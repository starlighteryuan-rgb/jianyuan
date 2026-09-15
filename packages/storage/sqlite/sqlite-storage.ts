import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  CoreStoragePorts,
  CurrentFocusContext,
  Directive,
  DirectiveId,
  Discovery,
  DiscoveryId,
  EpistemicRole,
  EvidenceSupportLevel,
  EvidenceUnitId,
  FocusContextId,
  HypothesisId,
  IngestionPlan,
  LineageEdge,
  PersonalRecord,
  RecordEpistemicRoleAssignment,
  RecordId,
  ReflectionEpisode,
  ReflectionEpisodeId,
  ReflectionPreference,
  RelationClaimId,
  SourceFingerprint,
  StateAssignment,
  StateAssignmentId,
  StateTargetType,
  StoredHypothesis,
  StoredRelationClaim,
  UserReflectionRecord,
} from '../../core/index';
import { decodeEntity, encodeEntity } from './codec';
import type {
  SqliteEncryptionController,
  SqliteEncryptionStatus,
} from './encryption';
import { applyMigrations, SQLITE_SCHEMA_VERSION } from './migrations';

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;

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

export interface SqliteStorageOptions {
  readonly busyTimeoutMs?: number;
  readonly encryption?: SqliteEncryptionController;
}

export interface NativeValidationArtifacts {
  readonly recordIds: readonly string[];
  readonly episodeIds: readonly string[];
  readonly targetRef: string;
}

export interface SqliteLogicalExportV1 {
  readonly format: 'jianyuan.sqlite.logical-export';
  readonly version: 1;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly tables: Readonly<Record<DataTable, readonly SqlRow[]>>;
}

const asRow = (value: unknown): SqlRow => value as SqlRow;

const requiredText = (row: SqlRow, key: string): string => {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error(`SQLite row is missing text column ${key}`);
  }
  return value;
};

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const parseExport = (serialized: string): SqliteLogicalExportV1 => {
  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('Invalid Jianyuan SQLite export');
  }

  const candidate = parsed as Partial<SqliteLogicalExportV1>;
  if (
    candidate.format !== 'jianyuan.sqlite.logical-export' ||
    candidate.version !== 1 ||
    candidate.schemaVersion !== SQLITE_SCHEMA_VERSION ||
    candidate.tables === undefined
  ) {
    throw new Error('Unsupported Jianyuan SQLite export');
  }

  for (const table of TABLES) {
    if (!Array.isArray(candidate.tables[table])) {
      throw new Error(`SQLite export is missing table ${table}`);
    }
  }

  return candidate as SqliteLogicalExportV1;
};

/**
 * One file-backed adapter implementing the complete Core storage seam.
 * Repository methods are async for contract compatibility; `node:sqlite`
 * executes them synchronously inside this local process.
 */
export class SqliteStorageAdapter implements CoreStoragePorts {
  private readonly database: DatabaseSync;
  private closed = false;

  readonly encryptionStatus: SqliteEncryptionStatus;
  readonly schemaVersion = SQLITE_SCHEMA_VERSION;

  constructor(
    readonly databasePath: string,
    options: SqliteStorageOptions = {},
  ) {
    if (databasePath !== ':memory:') {
      mkdirSync(dirname(resolve(databasePath)), { recursive: true });
    }

    this.database = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
      timeout: options.busyTimeoutMs ?? 5_000,
    });
    options.encryption?.configure(this.database);
    this.encryptionStatus = {
      configured: options.encryption !== undefined,
      controllerId: options.encryption?.id ?? null,
      deviceLevelVerified: false,
    };

    this.database.exec('PRAGMA journal_mode = WAL');
    this.database.exec('PRAGMA synchronous = NORMAL');
    this.database.exec('PRAGMA foreign_keys = ON');
    applyMigrations(this.database);
  }

  readonly records: CoreStoragePorts['records'] = {
    findById: async (id) => this.findRecord('id', id),
    findBySourceFingerprint: async (fingerprint) =>
      this.findRecord('source_fingerprint', fingerprint),
    findByEvidenceUnit: async (unitId) =>
      this.allEntities<PersonalRecord>(
        'SELECT payload_json FROM records WHERE evidence_unit_id = ? ORDER BY created_at DESC',
        unitId,
      ).map((record) => this.withRoles(record)),
    countDistinctEvidenceUnits: async (ids) => {
      if (ids.length === 0) return 0;
      const placeholders = ids.map(() => '?').join(', ');
      const row = asRow(
        this.database
          .prepare(
            `SELECT COUNT(DISTINCT evidence_unit_id) AS count FROM records WHERE id IN (${placeholders})`,
          )
          .get(...ids),
      );
      return Number(row.count ?? 0);
    },
    listRecent: async (limit) => {
      if (limit <= 0) return [];
      return this.allEntities<PersonalRecord>(
        'SELECT payload_json FROM records ORDER BY created_at DESC LIMIT ?',
        limit,
      ).map((record) => this.withRoles(record));
    },
    searchText: async (query, limit) => {
      const needle = query.trim();
      if (needle.length === 0 || limit <= 0) return [];
      return this.allEntities<PersonalRecord>(
        "SELECT payload_json FROM records WHERE verbatim LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?",
        `%${escapeLike(needle)}%`,
        limit,
      ).map((record) => this.withRoles(record));
    },
    save: async (record) => this.saveRecord(record),
  };

  readonly roles: CoreStoragePorts['roles'] = {
    listRoles: async (recordId) => this.rolesFor(recordId),
    addRole: async (assignment) => this.addRole(assignment),
  };

  readonly lineage: CoreStoragePorts['lineage'] = {
    directParents: async (childId) =>
      this.allEntities<LineageEdge>(
        'SELECT payload_json FROM lineage_edges WHERE child_id = ? ORDER BY rowid',
        childId,
      ),
    save: async (edge) => this.saveLineage(edge),
  };

  readonly directives: CoreStoragePorts['directives'] = {
    findById: async (id) =>
      this.oneEntity<Directive>(
        'SELECT payload_json FROM directives WHERE id = ?',
        id,
      ),
    listActive: async () =>
      this.allEntities<Directive>(
        'SELECT payload_json FROM directives WHERE revoked_at IS NULL ORDER BY created_at',
      ),
    save: async (directive) => this.saveDirective(directive),
    revoke: async (id, at) => {
      const directive = await this.directives.findById(id);
      if (directive === null) return;
      this.saveDirective({ ...directive, revokedAt: at });
    },
  };

  readonly stateAssignments: CoreStoragePorts['stateAssignments'] = {
    findByTarget: async (targetType, targetRef) =>
      this.oneEntity<StateAssignment>(
        'SELECT payload_json FROM state_assignments WHERE target_type = ? AND target_ref = ?',
        targetType,
        targetRef,
      ),
    save: async (assignment) => {
      this.database
        .prepare(
          `INSERT INTO state_assignments(id, target_type, target_ref, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             target_type = excluded.target_type,
             target_ref = excluded.target_ref,
             payload_json = excluded.payload_json`,
        )
        .run(
          assignment.id,
          assignment.targetType,
          assignment.targetRef,
          encodeEntity(assignment),
        );
    },
    findById: async (id) =>
      this.oneEntity<StateAssignment>(
        'SELECT payload_json FROM state_assignments WHERE id = ?',
        id,
      ),
  };

  readonly discoveries: CoreStoragePorts['discoveries'] = {
    findById: async (id) =>
      this.oneEntity<Discovery>(
        'SELECT payload_json FROM discoveries WHERE id = ?',
        id,
      ),
    findByStableKey: async (stableKey) =>
      this.oneEntity<Discovery>(
        'SELECT payload_json FROM discoveries WHERE stable_key = ?',
        stableKey,
      ),
    ensure: async (discovery) => {
      const existing = await this.discoveries.findByStableKey(
        discovery.stableKey,
      );
      if (existing !== null) return existing;

      this.database
        .prepare(
          `INSERT INTO discoveries(
             id, stable_key, subject_type, subject_id, created_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(stable_key) DO NOTHING`,
        )
        .run(
          discovery.id,
          discovery.stableKey,
          discovery.subjectRef.type,
          discovery.subjectRef.id,
          discovery.createdAt.toISOString(),
          encodeEntity(discovery),
        );
      return (await this.discoveries.findByStableKey(discovery.stableKey)) ?? discovery;
    },
  };

  readonly relationClaims: CoreStoragePorts['relationClaims'] = {
    findById: async (id) =>
      this.oneEntity<StoredRelationClaim>(
        'SELECT payload_json FROM relation_claims WHERE id = ?',
        id,
      ),
    findByRecordRef: async (recordId) =>
      this.allEntities<StoredRelationClaim>(
        `SELECT c.payload_json
         FROM relation_claims c
         JOIN relation_record_refs r ON r.claim_id = c.id
         WHERE r.record_id = ?
         ORDER BY c.created_at DESC`,
        recordId,
      ),
    listBySupportLevel: async (level) =>
      this.allEntities<StoredRelationClaim>(
        'SELECT payload_json FROM relation_claims WHERE support_level = ? ORDER BY created_at DESC',
        level,
      ),
    listAll: async (limit) => {
      if (limit <= 0) return [];
      return this.allEntities<StoredRelationClaim>(
        'SELECT payload_json FROM relation_claims ORDER BY created_at DESC LIMIT ?',
        limit,
      );
    },
    save: async (claim) => this.saveRelation(claim),
  };

  readonly hypotheses: CoreStoragePorts['hypotheses'] = {
    findById: async (id) =>
      this.oneEntity<StoredHypothesis>(
        'SELECT payload_json FROM hypotheses WHERE id = ?',
        id,
      ),
    findByAnchorRef: async (anchorRef) =>
      this.allEntities<StoredHypothesis>(
        `SELECT h.payload_json
         FROM hypotheses h
         JOIN hypothesis_anchor_refs a ON a.hypothesis_id = h.id
         WHERE a.anchor_ref = ?
         ORDER BY h.created_at`,
        anchorRef,
      ),
    listAll: async () =>
      this.allEntities<StoredHypothesis>(
        'SELECT payload_json FROM hypotheses ORDER BY created_at',
      ),
    save: async (hypothesis) => this.saveHypothesis(hypothesis),
  };

  readonly focusContexts: CoreStoragePorts['focusContexts'] = {
    findById: async (id) =>
      this.oneEntity<CurrentFocusContext>(
        'SELECT payload_json FROM focus_contexts WHERE id = ?',
        id,
      ),
    listActive: async (now) =>
      this.allEntities<CurrentFocusContext>(
        `SELECT payload_json FROM focus_contexts
         WHERE ended_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC`,
        now.toISOString(),
      ),
    save: async (context) => this.saveFocusContext(context),
    expire: async (id, at) => {
      const context = await this.focusContexts.findById(id);
      if (context === null) return;
      this.saveFocusContext({ ...context, endedAt: at });
    },
  };

  readonly reflectionPreferences: CoreStoragePorts['reflectionPreferences'] = {
    find: async () =>
      this.oneEntity<ReflectionPreference>(
        'SELECT payload_json FROM reflection_preferences ORDER BY rowid LIMIT 1',
      ),
    save: async (preference) => {
      this.database
        .prepare(
          `INSERT INTO reflection_preferences(id, payload_json) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
        )
        .run(preference.id, encodeEntity(preference));
    },
  };

  readonly reflectionEpisodes: CoreStoragePorts['reflectionEpisodes'] = {
    save: async (episode) => {
      this.database
        .prepare(
          `INSERT INTO reflection_episodes(id, payload_json) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
        )
        .run(episode.id, encodeEntity(episode));
    },
    /**
     * `reflection_episodes` stores no target column, so the target is read
     * out of the payload. `occurredAt` is encoded as a tagged ISO string
     * (see codec.ts), which sorts lexicographically as chronological order.
     */
    listByTarget: async (targetRef) =>
      this.allEntities<ReflectionEpisode>(
        `SELECT payload_json FROM reflection_episodes
         WHERE json_extract(payload_json, '$.targetRef') = ?
         ORDER BY json_extract(payload_json, '$.occurredAt."$jianyuan.date"') DESC`,
        targetRef,
      ),
  };

  readonly userReflectionRecords: CoreStoragePorts['userReflectionRecords'] = {
    save: async (record) => {
      this.database
        .prepare(
          `INSERT INTO user_reflection_records(id, record_id, created_at, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             record_id = excluded.record_id,
             created_at = excluded.created_at,
             payload_json = excluded.payload_json`,
        )
        .run(
          record.id,
          record.recordId,
          record.createdAt.toISOString(),
          encodeEntity(record),
        );
    },
    listByRecord: async (recordId) =>
      this.allEntities<UserReflectionRecord>(
        `SELECT payload_json FROM user_reflection_records
         WHERE record_id = ? ORDER BY created_at`,
        recordId,
      ),
    listByEpisode: async (episodeRef) =>
      this.allEntities<UserReflectionRecord>(
        `SELECT payload_json FROM user_reflection_records
         WHERE json_extract(payload_json, '$.episodeRef') = ?
         ORDER BY created_at`,
        episodeRef,
      ),
  };

  readonly ingestion: CoreStoragePorts['ingestion'] = {
    commit: async (plan) => {
      this.transaction(() => {
        if (plan.kind === 'create') this.saveRecord(plan.record);
        const targetRecordId =
          plan.kind === 'create' ? plan.record.id : plan.recordId;

        for (const role of plan.rolesToAdd) {
          this.addRole({ recordId: targetRecordId, role });
        }
        if (plan.lineageEdge !== null) {
          this.saveLineage({
            ...plan.lineageEdge,
            createdAt:
              plan.kind === 'create' ? plan.record.createdAt : new Date(),
          });
        }
      });
    },
  };

  exportData(): string {
    this.assertOpen();
    const tables = Object.fromEntries(
      TABLES.map((table) => [
        table,
        this.database
          .prepare(`SELECT * FROM "${table}" ORDER BY rowid`)
          .all()
          .map(asRow),
      ]),
    ) as unknown as Record<DataTable, readonly SqlRow[]>;

    const exported: SqliteLogicalExportV1 = {
      format: 'jianyuan.sqlite.logical-export',
      version: 1,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tables,
    };
    return JSON.stringify(exported, null, 2);
  }

  restoreData(serialized: string): void {
    const restored = parseExport(serialized);
    this.transaction(() => {
      this.clearData();
      for (const table of TABLES) {
        for (const row of restored.tables[table]) this.insertExportRow(table, row);
      }
    });
  }

  /**
   * Remove only entities explicitly created by the Desktop native validation
   * harness. The harness supplies generated IDs and targetRef values; this is
   * deliberately not part of the Core storage port or normal product flow.
   */
  removeNativeValidationArtifacts(artifacts: NativeValidationArtifacts): void {
    this.transaction(() => {
      if (artifacts.recordIds.length > 0) {
        const placeholders = artifacts.recordIds.map(() => '?').join(', ');
        this.database
          .prepare(
            `DELETE FROM records WHERE id IN (${placeholders})`,
          )
          .run(...artifacts.recordIds);
      }
      if (artifacts.episodeIds.length > 0) {
        const placeholders = artifacts.episodeIds.map(() => '?').join(', ');
        this.database
          .prepare(
            `DELETE FROM reflection_episodes WHERE id IN (${placeholders})`,
          )
          .run(...artifacts.episodeIds);
      }
      this.database
        .prepare(
          `DELETE FROM state_assignments
           WHERE target_type = 'relation_claim' AND target_ref = ?`,
        )
        .run(artifacts.targetRef);
    });
  }

  clear(): void {
    this.transaction(() => this.clearData());
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SQLite adapter is closed');
  }

  private transaction<T>(work: () => T): T {
    this.assertOpen();
    if (this.database.isTransaction) return work();

    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private oneEntity<T>(sql: string, ...params: SqlValue[]): T | null {
    this.assertOpen();
    const row = this.database.prepare(sql).get(...params);
    if (row === undefined) return null;
    return decodeEntity<T>(requiredText(asRow(row), 'payload_json'));
  }

  private allEntities<T>(sql: string, ...params: SqlValue[]): T[] {
    this.assertOpen();
    return this.database
      .prepare(sql)
      .all(...params)
      .map((row) => decodeEntity<T>(requiredText(asRow(row), 'payload_json')));
  }

  private findRecord(
    column: 'id' | 'source_fingerprint',
    value: RecordId | SourceFingerprint,
  ): PersonalRecord | null {
    const record = this.oneEntity<PersonalRecord>(
      `SELECT payload_json FROM records WHERE ${column} = ?`,
      value,
    );
    return record === null ? null : this.withRoles(record);
  }

  private withRoles(record: PersonalRecord): PersonalRecord {
    return { ...record, epistemicRoles: this.rolesFor(record.id) };
  }

  private rolesFor(recordId: RecordId): readonly EpistemicRole[] {
    return this.database
      .prepare('SELECT role FROM record_roles WHERE record_id = ? ORDER BY role')
      .all(recordId)
      .map((row) => requiredText(asRow(row), 'role') as EpistemicRole);
  }

  private saveRecord(record: PersonalRecord): void {
    this.database
      .prepare(
        `INSERT INTO records(
           id, source_fingerprint, evidence_unit_id, verbatim, created_at, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_fingerprint = excluded.source_fingerprint,
           evidence_unit_id = excluded.evidence_unit_id,
           verbatim = excluded.verbatim,
           created_at = excluded.created_at,
           payload_json = excluded.payload_json`,
      )
      .run(
        record.id,
        record.sourceFingerprint,
        record.evidenceUnitId,
        record.rawExpression?.verbatim ?? null,
        record.createdAt.toISOString(),
        encodeEntity(record),
      );
  }

  private addRole(assignment: RecordEpistemicRoleAssignment): void {
    this.database
      .prepare(
        'INSERT OR IGNORE INTO record_roles(record_id, role) VALUES (?, ?)',
      )
      .run(assignment.recordId, assignment.role);
  }

  private saveLineage(edge: LineageEdge): void {
    this.database
      .prepare(
        `INSERT INTO lineage_edges(id, parent_id, child_id, relation_type, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           parent_id = excluded.parent_id,
           child_id = excluded.child_id,
           relation_type = excluded.relation_type,
           payload_json = excluded.payload_json`,
      )
      .run(
        edge.id,
        edge.parentId,
        edge.childId,
        edge.relationToParent,
        encodeEntity(edge),
      );
  }

  private saveDirective(directive: Directive): void {
    this.database
      .prepare(
        `INSERT INTO directives(id, revoked_at, created_at, payload_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           revoked_at = excluded.revoked_at,
           created_at = excluded.created_at,
           payload_json = excluded.payload_json`,
      )
      .run(
        directive.id,
        directive.revokedAt?.toISOString() ?? null,
        directive.createdAt.toISOString(),
        encodeEntity(directive),
      );
  }

  private saveRelation(claim: StoredRelationClaim): void {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO relation_claims(id, support_level, created_at, payload_json)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             support_level = excluded.support_level,
             created_at = excluded.created_at,
             payload_json = excluded.payload_json`,
        )
        .run(
          claim.id,
          claim.supportLevel,
          claim.createdAt.toISOString(),
          encodeEntity(claim),
        );
      this.database
        .prepare('DELETE FROM relation_record_refs WHERE claim_id = ?')
        .run(claim.id);
      const insert = this.database.prepare(
        'INSERT INTO relation_record_refs(claim_id, record_id) VALUES (?, ?)',
      );
      for (const recordRef of claim.recordRefs) insert.run(claim.id, recordRef);
    });
  }

  private saveHypothesis(hypothesis: StoredHypothesis): void {
    this.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO hypotheses(id, created_at, payload_json) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             created_at = excluded.created_at,
             payload_json = excluded.payload_json`,
        )
        .run(
          hypothesis.id,
          hypothesis.createdAt.toISOString(),
          encodeEntity(hypothesis),
        );
      this.database
        .prepare('DELETE FROM hypothesis_anchor_refs WHERE hypothesis_id = ?')
        .run(hypothesis.id);
      const insert = this.database.prepare(
        'INSERT INTO hypothesis_anchor_refs(hypothesis_id, anchor_ref) VALUES (?, ?)',
      );
      for (const anchorRef of hypothesis.anchorRefs) {
        insert.run(hypothesis.id, anchorRef);
      }
    });
  }

  private saveFocusContext(context: CurrentFocusContext): void {
    this.database
      .prepare(
        `INSERT INTO focus_contexts(id, ended_at, expires_at, created_at, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           expires_at = excluded.expires_at,
           created_at = excluded.created_at,
           payload_json = excluded.payload_json`,
      )
      .run(
        context.id,
        context.endedAt?.toISOString() ?? null,
        context.expiresAt?.toISOString() ?? null,
        context.createdAt.toISOString(),
        encodeEntity(context),
      );
  }

  private clearData(): void {
    for (const table of [...TABLES].reverse()) {
      this.database.exec(`DELETE FROM "${table}"`);
    }
  }

  private insertExportRow(table: DataTable, row: SqlRow): void {
    const allowedColumns = new Set(
      this.database
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((entry) => requiredText(asRow(entry), 'name')),
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
    this.database
      .prepare(`INSERT INTO "${table}" (${quoted}) VALUES (${placeholders})`)
      .run(...columns.map((column) => row[column] ?? null));
  }
}

export const createSqliteStorage = (
  databasePath: string,
  options: SqliteStorageOptions = {},
): SqliteStorageAdapter => new SqliteStorageAdapter(databasePath, options);
