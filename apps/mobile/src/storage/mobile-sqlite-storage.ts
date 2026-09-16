/**
 * Mobile SQLite storage adapter — implements the complete Core storage seam.
 *
 * WHAT THIS IS
 * A `CoreStoragePorts` implementation backed by the `SqlDriver` interface. On
 * device the driver is `expo-sqlite` (src/storage/expo-sql-driver.ts); under
 * Node tests it is a `node:sqlite` driver double. The SQL, the write ordering,
 * the transaction boundaries, and the entity encoding below are the production
 * ones on both paths — nothing is mocked at the query level.
 *
 * RELATIONSHIP TO THE DESKTOP ADAPTER
 * This is a separate implementation, not a port of packages/storage/sqlite.
 * The Desktop adapter is built on `node:sqlite`'s synchronous `DatabaseSync`
 * and is part of the frozen Desktop runtime. Mobile needs genuinely
 * asynchronous persistence (expo-sqlite is async, and blocking the JS thread on
 * every Record write would drop frames on save), so each repository method here
 * awaits. The SEMANTICS are the Desktop semantics: same tables, same columns,
 * same ordering rules, same upsert conflicts, same role re-attachment, same
 * payload codec. Where Desktop's contract says "ORDERED BY created_at, never by
 * time" or "an unscored claim is returned by no level query", this file does the
 * same thing, because those are Core's rules and Core is shared.
 *
 * EXPORT / RESTORE
 * `exportData` / `restoreData` emit and accept the same logical backup shape as
 * the Desktop adapter (`jianyuan.sqlite.logical-export` v1): one JSON object
 * holding every table's rows. That format is platform-independent, so a backup
 * taken on one platform can be read on the other without a second definition
 * of the data model. The physical statements differ (async expo-sqlite here,
 * synchronous node:sqlite there); the semantics do not.
 *
 * WHAT IS DELIBERATELY ABSENT
 * Native-validation artifact cleanup and the encryption controller. Those are
 * Desktop harness and Desktop at-rest concerns.
 */

import type {
  CoreStoragePorts,
  CurrentFocusContext,
  Directive,
  Discovery,
  EpistemicRole,
  EvidenceSupportLevel,
  EvidenceUnitId,
  IngestionPlan,
  LineageEdge,
  PersonalRecord,
  RecordEpistemicRoleAssignment,
  RecordId,
  ReflectionEpisode,
  ReflectionPreference,
  SourceFingerprint,
  StateAssignment,
  StateTargetType,
  StoredHypothesis,
  StoredRelationClaim,
  UserReflectionRecord,
} from '../../../../packages/core/index';

import { decodeEntity, encodeEntity } from './codec';
import { applyMobileMigrations, applyMobilePragmas, MOBILE_SQLITE_SCHEMA_VERSION } from './migrations';
import type { SqlDriver, SqlExecutor, SqlValue } from './sql-driver';

type SqlRow = Record<string, SqlValue>;

export interface MobileLogicalExportV1 {
  readonly format: 'jianyuan.sqlite.logical-export';
  readonly version: 1;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly tables: Readonly<Record<DataTable, readonly SqlRow[]>>;
}

/**
 * Tables in the order Desktop declares them. Reversed for deletion so foreign
 * keys are respected (children before parents) with `foreign_keys = ON`.
 */
const TABLES = [
  'records',
  'record_roles',
  'lineage_edges',
  'directives',
  'state_assignments',
  'relation_claims',
  'relation_record_refs',
  'hypotheses',
  'hypothesis_anchor_refs',
  'discoveries',
  'focus_contexts',
  'reflection_preferences',
  'reflection_episodes',
  'user_reflection_records',
] as const;

type DataTable = (typeof TABLES)[number];

const asRow = (value: unknown): SqlRow => value as SqlRow;

/**
 * Validate a serialized backup before touching the live database.
 *
 * Every check happens up front, so an incompatible or truncated file is
 * rejected without clearing the user's existing data first.
 */
export const parseMobileLogicalExport = (
  serialized: string,
): MobileLogicalExportV1 => {
  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Invalid Jianyuan SQLite export');
  }

  const candidate = parsed as Partial<MobileLogicalExportV1>;
  if (
    candidate.format !== 'jianyuan.sqlite.logical-export' ||
    candidate.version !== 1 ||
    candidate.schemaVersion !== MOBILE_SQLITE_SCHEMA_VERSION ||
    candidate.tables === undefined
  ) {
    throw new Error('Unsupported Jianyuan SQLite export');
  }

  for (const table of TABLES) {
    if (!Array.isArray(candidate.tables[table])) {
      throw new Error(`SQLite export is missing table ${table}`);
    }
  }

  return candidate as MobileLogicalExportV1;
};

/**
 * Records, newest first.
 *
 * `created_at` is the platform clock — when the row was written — and is
 * deliberately NOT `time`, which is a TimeAssertion whose semantic varies per
 * Record (Core's RecordRepository.listRecent contract; INV-07, INV-08).
 *
 * The `rowid DESC` tiebreaker is load-bearing, not decoration. `created_at` is
 * derived from `capturedAt`, so two captures inside the same millisecond carry
 * IDENTICAL `created_at` values. SQLite returns equal keys in ascending rowid
 * order even under `ORDER BY ... DESC`, which silently reverses a same-
 * millisecond batch and makes "newest first" non-deterministic. Ordering by
 * insertion order descending is what the contract means by "most recently
 * stored", so the tiebreak makes the stated contract true rather than changing
 * it.
 */
const RECORD_ORDER = 'ORDER BY created_at DESC, rowid DESC';

const requiredText = (row: SqlRow, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error(`SQLite row is missing text column ${key}`);
  }
  return value;
};

/** Mirrors Desktop: LIKE wildcards in user text must match literally. */
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

/**
 * One file-backed Mobile adapter implementing every Core storage port.
 *
 * Construct via `createMobileStorage`, which also runs the pragmas and
 * migrations; a bare `new` leaves the schema unprepared.
 */
export class MobileSqliteStorageAdapter implements CoreStoragePorts {
  private closed = false;

  readonly schemaVersion = MOBILE_SQLITE_SCHEMA_VERSION;

  constructor(private readonly driver: SqlDriver) {}

  /** Where the database file lives. Inside the iOS app sandbox in production. */
  get location(): string {
    return this.driver.location;
  }

  readonly records: CoreStoragePorts['records'] = {
    findById: async (id) => this.findRecord('id', id),

    findBySourceFingerprint: async (fingerprint) =>
      this.findRecord('source_fingerprint', fingerprint),

    findByEvidenceUnit: async (unitId: EvidenceUnitId) => {
      const records = await this.allEntities<PersonalRecord>(
        this.driver,
        `SELECT payload_json FROM records WHERE evidence_unit_id = ? ${RECORD_ORDER}`,
        unitId,
      );
      return this.attachRoles(records);
    },

    countDistinctEvidenceUnits: async (ids: readonly RecordId[]) => {
      if (ids.length === 0) return 0;
      const placeholders = ids.map(() => '?').join(', ');
      const row = await this.driver.getFirstAsync<SqlRow>(
        `SELECT COUNT(DISTINCT evidence_unit_id) AS count FROM records WHERE id IN (${placeholders})`,
        [...ids],
      );
      return Number(row?.count ?? 0);
    },

    listRecent: async (limit) => {
      if (limit <= 0) return [];
      const records = await this.allEntities<PersonalRecord>(
        this.driver,
        `SELECT payload_json FROM records ${RECORD_ORDER} LIMIT ?`,
        limit,
      );
      return this.attachRoles(records);
    },

    searchText: async (query, limit) => {
      const needle = query.trim();
      if (needle.length === 0 || limit <= 0) return [];
      const records = await this.allEntities<PersonalRecord>(
        this.driver,
        `SELECT payload_json FROM records WHERE verbatim LIKE ? ESCAPE '\\' ${RECORD_ORDER} LIMIT ?`,
        `%${escapeLike(needle)}%`,
        limit,
      );
      return this.attachRoles(records);
    },

    save: async (record) => {
      await this.saveRecord(this.driver, record);
    },
  };

  readonly roles: CoreStoragePorts['roles'] = {
    listRoles: async (recordId) => this.rolesFor(this.driver, recordId),
    addRole: async (assignment) => {
      await this.addRole(this.driver, assignment);
    },
  };

  readonly lineage: CoreStoragePorts['lineage'] = {
    directParents: async (childId) =>
      this.allEntities<LineageEdge>(
        this.driver,
        'SELECT payload_json FROM lineage_edges WHERE child_id = ? ORDER BY rowid',
        childId,
      ),
    save: async (edge) => {
      await this.saveLineage(this.driver, edge);
    },
  };

  readonly directives: CoreStoragePorts['directives'] = {
    findById: async (id) =>
      this.oneEntity<Directive>(
        this.driver,
        'SELECT payload_json FROM directives WHERE id = ?',
        id,
      ),
    listActive: async () =>
      this.allEntities<Directive>(
        this.driver,
        'SELECT payload_json FROM directives WHERE revoked_at IS NULL ORDER BY created_at',
      ),
    save: async (directive) => {
      await this.saveDirective(this.driver, directive);
    },
    revoke: async (id, at) => {
      const directive = await this.directives.findById(id);
      if (directive === null) return;
      await this.saveDirective(this.driver, { ...directive, revokedAt: at });
    },
  };

  readonly stateAssignments: CoreStoragePorts['stateAssignments'] = {
    findByTarget: async (targetType: StateTargetType, targetRef) =>
      this.oneEntity<StateAssignment>(
        this.driver,
        'SELECT payload_json FROM state_assignments WHERE target_type = ? AND target_ref = ?',
        targetType,
        targetRef,
      ),
    save: async (assignment) => {
      await this.driver.runAsync(
        `INSERT INTO state_assignments(id, target_type, target_ref, payload_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           target_type = excluded.target_type,
           target_ref = excluded.target_ref,
           payload_json = excluded.payload_json`,
        [
          assignment.id,
          assignment.targetType,
          assignment.targetRef,
          encodeEntity(assignment),
        ],
      );
    },
    findById: async (id) =>
      this.oneEntity<StateAssignment>(
        this.driver,
        'SELECT payload_json FROM state_assignments WHERE id = ?',
        id,
      ),
  };

  readonly discoveries: CoreStoragePorts['discoveries'] = {
    findById: async (id) =>
      this.oneEntity<Discovery>(
        this.driver,
        'SELECT payload_json FROM discoveries WHERE id = ?',
        id,
      ),
    findByStableKey: async (stableKey) =>
      this.oneEntity<Discovery>(
        this.driver,
        'SELECT payload_json FROM discoveries WHERE stable_key = ?',
        stableKey,
      ),
    ensure: async (discovery) => {
      const existing = await this.discoveries.findByStableKey(discovery.stableKey);
      if (existing !== null) return existing;

      await this.driver.runAsync(
        `INSERT INTO discoveries(
           id, stable_key, subject_type, subject_id, created_at, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(stable_key) DO NOTHING`,
        [
          discovery.id,
          discovery.stableKey,
          discovery.subjectRef.type,
          discovery.subjectRef.id,
          discovery.createdAt.toISOString(),
          encodeEntity(discovery),
        ],
      );

      return (
        (await this.discoveries.findByStableKey(discovery.stableKey)) ?? discovery
      );
    },
  };

  readonly relationClaims: CoreStoragePorts['relationClaims'] = {
    findById: async (id) =>
      this.oneEntity<StoredRelationClaim>(
        this.driver,
        'SELECT payload_json FROM relation_claims WHERE id = ?',
        id,
      ),
    findByRecordRef: async (recordId) =>
      this.allEntities<StoredRelationClaim>(
        this.driver,
        `SELECT c.payload_json
         FROM relation_claims c
         JOIN relation_record_refs r ON r.claim_id = c.id
         WHERE r.record_id = ?
         ORDER BY c.created_at DESC`,
        recordId,
      ),
    listBySupportLevel: async (level: EvidenceSupportLevel) =>
      this.allEntities<StoredRelationClaim>(
        this.driver,
        'SELECT payload_json FROM relation_claims WHERE support_level = ? ORDER BY created_at DESC',
        level,
      ),
    listAll: async (limit) => {
      if (limit <= 0) return [];
      return this.allEntities<StoredRelationClaim>(
        this.driver,
        'SELECT payload_json FROM relation_claims ORDER BY created_at DESC LIMIT ?',
        limit,
      );
    },
    save: async (claim) => {
      await this.atomic(async (transaction) => {
        await this.saveRelation(transaction, claim);
      });
    },
  };

  readonly hypotheses: CoreStoragePorts['hypotheses'] = {
    findById: async (id) =>
      this.oneEntity<StoredHypothesis>(
        this.driver,
        'SELECT payload_json FROM hypotheses WHERE id = ?',
        id,
      ),
    findByAnchorRef: async (anchorRef) =>
      this.allEntities<StoredHypothesis>(
        this.driver,
        `SELECT h.payload_json
         FROM hypotheses h
         JOIN hypothesis_anchor_refs a ON a.hypothesis_id = h.id
         WHERE a.anchor_ref = ?
         ORDER BY h.created_at`,
        anchorRef,
      ),
    listAll: async () =>
      this.allEntities<StoredHypothesis>(
        this.driver,
        'SELECT payload_json FROM hypotheses ORDER BY created_at',
      ),
    save: async (hypothesis) => {
      await this.atomic(async (transaction) => {
        await this.saveHypothesis(transaction, hypothesis);
      });
    },
  };

  readonly focusContexts: CoreStoragePorts['focusContexts'] = {
    findById: async (id) =>
      this.oneEntity<CurrentFocusContext>(
        this.driver,
        'SELECT payload_json FROM focus_contexts WHERE id = ?',
        id,
      ),
    listActive: async (now) =>
      this.allEntities<CurrentFocusContext>(
        this.driver,
        `SELECT payload_json FROM focus_contexts
         WHERE ended_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC`,
        now.toISOString(),
      ),
    save: async (context) => {
      await this.saveFocusContext(this.driver, context);
    },
    expire: async (id, at) => {
      const context = await this.focusContexts.findById(id);
      if (context === null) return;
      await this.saveFocusContext(this.driver, { ...context, endedAt: at });
    },
  };

  readonly reflectionPreferences: CoreStoragePorts['reflectionPreferences'] = {
    find: async () =>
      this.oneEntity<ReflectionPreference>(
        this.driver,
        'SELECT payload_json FROM reflection_preferences ORDER BY rowid LIMIT 1',
      ),
    save: async (preference) => {
      await this.driver.runAsync(
        `INSERT INTO reflection_preferences(id, payload_json) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
        [preference.id, encodeEntity(preference)],
      );
    },
  };

  readonly reflectionEpisodes: CoreStoragePorts['reflectionEpisodes'] = {
    save: async (episode) => {
      await this.driver.runAsync(
        `INSERT INTO reflection_episodes(id, payload_json) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
        [episode.id, encodeEntity(episode)],
      );
    },
    /**
     * `reflection_episodes` stores no target column, so the target is read out
     * of the payload. `occurredAt` is encoded as a tagged ISO string (codec.ts),
     * which sorts lexicographically as chronological order. Same query shape as
     * Desktop; it relies on SQLite's built-in JSON1 functions, which are
     * compiled into the vendored SQLite (3.50.3) that expo-sqlite ships.
     */
    listByTarget: async (targetRef) =>
      this.allEntities<ReflectionEpisode>(
        this.driver,
        `SELECT payload_json FROM reflection_episodes
         WHERE json_extract(payload_json, '$.targetRef') = ?
         ORDER BY json_extract(payload_json, '$.occurredAt."$jianyuan.date"') DESC`,
        targetRef,
      ),
  };

  readonly userReflectionRecords: CoreStoragePorts['userReflectionRecords'] & {
    listRecent(limit: number): Promise<readonly UserReflectionRecord[]>;
  } = {
    save: async (record) => {
      await this.driver.runAsync(
        `INSERT INTO user_reflection_records(id, record_id, created_at, payload_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           record_id = excluded.record_id,
           created_at = excluded.created_at,
           payload_json = excluded.payload_json`,
        [
          record.id,
          record.recordId,
          record.createdAt.toISOString(),
          encodeEntity(record),
        ],
      );
    },
    listByRecord: async (recordId) =>
      this.allEntities<UserReflectionRecord>(
        this.driver,
        `SELECT payload_json FROM user_reflection_records
         WHERE record_id = ? ORDER BY created_at`,
        recordId,
      ),
    listByEpisode: async (episodeRef) =>
      this.allEntities<UserReflectionRecord>(
        this.driver,
        `SELECT payload_json FROM user_reflection_records
         WHERE json_extract(payload_json, '$.episodeRef') = ?
         ORDER BY created_at`,
        episodeRef,
      ),
    listRecent: async (limit) => {
      if (limit <= 0) return [];
      return this.allEntities<UserReflectionRecord>(
        this.driver,
        `SELECT payload_json FROM user_reflection_records
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        limit,
      );
    },
  };

  /**
   * All-or-nothing persistence of one complete Ingestion plan.
   *
   * The planner owns every epistemic decision; this port owns only write
   * ordering and atomicity. It calls the private helpers directly rather than
   * the public repository methods, so no nested transaction is ever opened.
   */
  readonly ingestion: CoreStoragePorts['ingestion'] = {
    commit: async (plan: IngestionPlan) => {
      await this.atomic(async (transaction) => {
        if (plan.kind === 'create') {
          await this.saveRecord(transaction, plan.record);
        }
        const targetRecordId =
          plan.kind === 'create' ? plan.record.id : plan.recordId;

        for (const role of plan.rolesToAdd) {
          await this.addRole(transaction, { recordId: targetRecordId, role });
        }

        if (plan.lineageEdge !== null) {
          await this.saveLineage(transaction, {
            ...plan.lineageEdge,
            createdAt: plan.kind === 'create' ? plan.record.createdAt : new Date(),
          });
        }
      });
    },
  };

  /** Delete every stored entity. Used by tests and by an explicit user reset. */
  /**
   * Serialize every table into the shared logical backup format.
   *
   * Rows are read in insertion order so a restore reproduces the same
   * `rowid`-dependent ordering the live database used.
   */
  async exportData(): Promise<string> {
    this.assertOpen();
    const tables = Object.fromEntries(
      await Promise.all(
        TABLES.map(async (table) => {
          const rows = await this.driver.getAllAsync<SqlRow>(
            `SELECT * FROM "${table}" ORDER BY rowid`,
            [],
          );
          return [table, rows.map(asRow)] as const;
        }),
      ),
    ) as unknown as Record<DataTable, readonly SqlRow[]>;

    const exported: MobileLogicalExportV1 = {
      format: 'jianyuan.sqlite.logical-export',
      version: 1,
      schemaVersion: MOBILE_SQLITE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tables,
    };
    return JSON.stringify(exported, null, 2);
  }

  /**
   * Replace the database contents with a validated backup.
   *
   * The whole restore is one transaction: if any row is rejected the previous
   * data is still intact, so a bad file cannot destroy existing Records.
   */
  async restoreData(serialized: string): Promise<void> {
    this.assertOpen();
    const restored = parseMobileLogicalExport(serialized);
    await this.atomic(async (transaction) => {
      for (const table of [...TABLES].reverse()) {
        await transaction.execAsync(`DELETE FROM "${table}"`);
      }
      for (const table of TABLES) {
        for (const row of restored.tables[table]) {
          await this.insertExportRow(transaction, table, row);
        }
      }
    });
  }
  async clear(): Promise<void> {
    this.assertOpen();
    await this.atomic(async (transaction) => {
      for (const table of [...TABLES].reverse()) {
        await transaction.execAsync(`DELETE FROM "${table}"`);
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.driver.closeAsync();
    this.closed = true;
  }

  /**
   * Apply connection pragmas and bring the schema up to date.
   *
   * Public because it must run before any repository call, and because opening
   * a database is inherently asynchronous: a constructor cannot await. Callers
   * should use `createMobileStorage`, which calls this exactly once. It is
   * idempotent, so a repeated call is harmless.
   */
  async initialize(): Promise<void> {
    await applyMobilePragmas(this.driver);
    await applyMobileMigrations(this.driver);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Mobile SQLite adapter is closed');
  }

  /**
   * Execute `work` inside one atomic transaction.
   *
   * Every caller passes the received executor down to private helpers instead of
   * calling public repository methods, so `atomic` is never re-entered and there
   * is no BEGIN inside BEGIN.
   */
  private async atomic<TResult>(
    work: (transaction: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    this.assertOpen();
    return this.driver.withExclusiveTransactionAsync(work);
  }

  private async oneEntity<T>(
    executor: SqlExecutor,
    sql: string,
    ...params: SqlValue[]
  ): Promise<T | null> {
    this.assertOpen();
    const row = await executor.getFirstAsync<SqlRow>(sql, params);
    if (row === null || row === undefined) return null;
    return decodeEntity<T>(requiredText(row, 'payload_json'));
  }

  private async allEntities<T>(
    executor: SqlExecutor,
    sql: string,
    ...params: SqlValue[]
  ): Promise<T[]> {
    this.assertOpen();
    const rows = await executor.getAllAsync<SqlRow>(sql, params);
    return rows.map((row) => decodeEntity<T>(requiredText(row, 'payload_json')));
  }

  private async findRecord(
    column: 'id' | 'source_fingerprint',
    value: RecordId | SourceFingerprint,
  ): Promise<PersonalRecord | null> {
    // `column` is a closed union of literal column names, never user input.
    const record = await this.oneEntity<PersonalRecord>(
      this.driver,
      `SELECT payload_json FROM records WHERE ${column} = ?`,
      value,
    );
    if (record === null) return null;
    const [withRoles] = await this.attachRoles([record]);
    return withRoles ?? null;
  }

  /**
   * Roles live in their own table and are re-attached on every read, so a
   * Record's `epistemicRoles` are never stale relative to the role table.
   */
  private async attachRoles(
    records: readonly PersonalRecord[],
  ): Promise<readonly PersonalRecord[]> {
    const enriched: PersonalRecord[] = [];
    for (const record of records) {
      enriched.push({
        ...record,
        epistemicRoles: await this.rolesFor(this.driver, record.id),
      });
    }
    return enriched;
  }

  private async rolesFor(
    executor: SqlExecutor,
    recordId: RecordId,
  ): Promise<readonly EpistemicRole[]> {
    const rows = await executor.getAllAsync<SqlRow>(
      'SELECT role FROM record_roles WHERE record_id = ? ORDER BY role',
      [recordId],
    );
    return rows.map((row) => requiredText(row, 'role') as EpistemicRole);
  }

  private async saveRecord(
    executor: SqlExecutor,
    record: PersonalRecord,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO records(
         id, source_fingerprint, evidence_unit_id, verbatim, created_at, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_fingerprint = excluded.source_fingerprint,
         evidence_unit_id = excluded.evidence_unit_id,
         verbatim = excluded.verbatim,
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`,
      [
        record.id,
        record.sourceFingerprint,
        record.evidenceUnitId,
        record.rawExpression?.verbatim ?? null,
        record.createdAt.toISOString(),
        encodeEntity(record),
      ],
    );
  }

  private async addRole(
    executor: SqlExecutor,
    assignment: RecordEpistemicRoleAssignment,
  ): Promise<void> {
    await executor.runAsync(
      'INSERT OR IGNORE INTO record_roles(record_id, role) VALUES (?, ?)',
      [assignment.recordId, assignment.role],
    );
  }

  private async saveLineage(
    executor: SqlExecutor,
    edge: LineageEdge,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO lineage_edges(id, parent_id, child_id, relation_type, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         parent_id = excluded.parent_id,
         child_id = excluded.child_id,
         relation_type = excluded.relation_type,
         payload_json = excluded.payload_json`,
      [
        edge.id,
        edge.parentId,
        edge.childId,
        edge.relationToParent,
        encodeEntity(edge),
      ],
    );
  }

  private async saveDirective(
    executor: SqlExecutor,
    directive: Directive,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO directives(id, revoked_at, created_at, payload_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         revoked_at = excluded.revoked_at,
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`,
      [
        directive.id,
        directive.revokedAt?.toISOString() ?? null,
        directive.createdAt.toISOString(),
        encodeEntity(directive),
      ],
    );
  }

  private async saveRelation(
    executor: SqlExecutor,
    claim: StoredRelationClaim,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO relation_claims(id, support_level, created_at, payload_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         support_level = excluded.support_level,
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`,
      [
        claim.id,
        claim.supportLevel,
        claim.createdAt.toISOString(),
        encodeEntity(claim),
      ],
    );
    // Refs are replaced wholesale so a re-saved claim never keeps a stale
    // Record reference.
    await executor.runAsync('DELETE FROM relation_record_refs WHERE claim_id = ?', [
      claim.id,
    ]);
    for (const recordRef of claim.recordRefs) {
      await executor.runAsync(
        'INSERT INTO relation_record_refs(claim_id, record_id) VALUES (?, ?)',
        [claim.id, recordRef],
      );
    }
  }

  private async saveHypothesis(
    executor: SqlExecutor,
    hypothesis: StoredHypothesis,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO hypotheses(id, created_at, payload_json) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`,
      [
        hypothesis.id,
        hypothesis.createdAt.toISOString(),
        encodeEntity(hypothesis),
      ],
    );
    await executor.runAsync(
      'DELETE FROM hypothesis_anchor_refs WHERE hypothesis_id = ?',
      [hypothesis.id],
    );
    for (const anchorRef of hypothesis.anchorRefs) {
      await executor.runAsync(
        'INSERT INTO hypothesis_anchor_refs(hypothesis_id, anchor_ref) VALUES (?, ?)',
        [hypothesis.id, anchorRef],
      );
    }
  }

  private async saveFocusContext(
    executor: SqlExecutor,
    context: CurrentFocusContext,
  ): Promise<void> {
    await executor.runAsync(
      `INSERT INTO focus_contexts(id, ended_at, expires_at, created_at, payload_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         ended_at = excluded.ended_at,
         expires_at = excluded.expires_at,
         created_at = excluded.created_at,
         payload_json = excluded.payload_json`,
      [
        context.id,
        context.endedAt?.toISOString() ?? null,
        context.expiresAt?.toISOString() ?? null,
        context.createdAt.toISOString(),
        encodeEntity(context),
      ],
    );
  }

  /**
   * Insert one exported row verbatim.
   *
   * Column names are read from the live schema and intersected with the
   * exported row, so a hand-edited or future-version file cannot smuggle an
   * arbitrary column into the INSERT. Missing columns are written as NULL
   * rather than dropped, which is what keeps a backup round-trip lossless.
   */
  private async insertExportRow(
    executor: SqlExecutor,
    table: DataTable,
    row: SqlRow,
  ): Promise<void> {
    const info = await executor.getAllAsync<SqlRow>(
      `PRAGMA table_info("${table}")`,
      [],
    );
    const allowedColumns = new Set(
      info.map((entry) => requiredText(entry, 'name')),
    );
    const columns = Object.keys(row);
    if (
      columns.length === 0 ||
      columns.some((column) => !allowedColumns.has(column))
    ) {
      throw new Error(`Invalid columns in SQLite export table ${table}`);
    }
    const placeholders = columns.map(() => '?').join(', ');
    const quoted = columns.map((column) => `"${column}"`).join(', ');
    await executor.runAsync(
      `INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`,
      columns.map((column) => row[column] ?? null),
    );
  }
}

/**
 * Open a ready-to-use Mobile storage adapter over an already-opened driver.
 *
 * The driver is passed in rather than created here so that production (app
 * sandbox) and tests (scratch file) differ in nothing but where the file lives.
 */
export const createMobileStorage = async (
  driver: SqlDriver,
): Promise<MobileSqliteStorageAdapter> => {
  const adapter = new MobileSqliteStorageAdapter(driver);
  await adapter.initialize();
  return adapter;
};
