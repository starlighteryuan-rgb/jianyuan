/**
 * Mobile schema migrations.
 *
 * RELATIONSHIP TO THE DESKTOP SCHEMA
 * The DDL below is semantically identical to the one in
 * packages/storage/sqlite/migrations.ts: same 14 tables, same columns, same
 * constraints, same indexes, same STRICT typing, same schema version. That
 * equivalence is not asserted by prose — tests/mobile-schema-parity.test.ts
 * builds BOTH schemas through the same driver interface and compares the
 * resulting sqlite_master structure (tables, columns, types, nullability,
 * primary keys, indexes) plus the schema version constant. If the Desktop
 * schema changes and this one does not, that test fails.
 *
 * WHY THE DDL IS REPEATED RATHER THAN IMPORTED
 * The Desktop module keeps its migration list private and its public
 * `applyMigrations` is typed against `node:sqlite`'s `DatabaseSync`. Reusing it
 * here would mean either modifying the frozen Desktop storage package or
 * importing a `node:sqlite` type into the Metro bundle. Both are out of scope
 * for M1 (the Desktop SQLite schema/runtime must not change), so Mobile owns
 * its own migration runner over the driver seam and the parity test carries the
 * guarantee that the two schemas cannot drift apart unnoticed.
 */

import type { SqlDriver } from './sql-driver';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/** Must stay equal to SQLITE_SCHEMA_VERSION in packages/storage/sqlite. */
export const MOBILE_SQLITE_SCHEMA_VERSION = 1;

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_core_storage',
    sql: `
      CREATE TABLE records (
        id TEXT PRIMARY KEY,
        source_fingerprint TEXT NOT NULL UNIQUE,
        evidence_unit_id TEXT NOT NULL,
        verbatim TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX records_created_at_idx ON records(created_at DESC);
      CREATE INDEX records_evidence_unit_idx ON records(evidence_unit_id);
      CREATE INDEX records_verbatim_idx ON records(verbatim);

      CREATE TABLE record_roles (
        record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY (record_id, role)
      ) STRICT;

      CREATE TABLE lineage_edges (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
        child_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX lineage_child_idx ON lineage_edges(child_id);

      CREATE TABLE directives (
        id TEXT PRIMARY KEY,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX directives_active_idx ON directives(revoked_at);

      CREATE TABLE state_assignments (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_ref TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE(target_type, target_ref)
      ) STRICT;

      CREATE TABLE relation_claims (
        id TEXT PRIMARY KEY,
        support_level TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX relation_claims_created_idx ON relation_claims(created_at DESC);
      CREATE INDEX relation_claims_support_idx ON relation_claims(support_level);

      CREATE TABLE relation_record_refs (
        claim_id TEXT NOT NULL REFERENCES relation_claims(id) ON DELETE CASCADE,
        record_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT,
        PRIMARY KEY (claim_id, record_id)
      ) STRICT;
      CREATE INDEX relation_record_ref_idx ON relation_record_refs(record_id);

      CREATE TABLE hypotheses (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE hypothesis_anchor_refs (
        hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
        anchor_ref TEXT NOT NULL,
        PRIMARY KEY (hypothesis_id, anchor_ref)
      ) STRICT;
      CREATE INDEX hypothesis_anchor_idx ON hypothesis_anchor_refs(anchor_ref);

      CREATE TABLE discoveries (
        id TEXT PRIMARY KEY,
        stable_key TEXT NOT NULL UNIQUE,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX discoveries_subject_idx ON discoveries(subject_type, subject_id);

      CREATE TABLE focus_contexts (
        id TEXT PRIMARY KEY,
        ended_at TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX focus_contexts_active_idx ON focus_contexts(ended_at, expires_at);

      CREATE TABLE reflection_preferences (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE reflection_episodes (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL
      ) STRICT;

      CREATE TABLE user_reflection_records (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX user_reflection_record_idx
        ON user_reflection_records(record_id, created_at);
    `,
  },
];

/**
 * Bring the database up to the current schema version.
 *
 * Idempotent and safe to call on every launch: the ledger table records which
 * versions have already been applied, and each outstanding migration runs in
 * its own atomic transaction so a failure mid-migration cannot leave half a
 * schema behind.
 */
export const applyMobileMigrations = async (driver: SqlDriver): Promise<void> => {
  await driver.execAsync(`
    CREATE TABLE IF NOT EXISTS _jianyuan_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const appliedRows = await driver.getAllAsync<{ version: number }>(
    'SELECT version FROM _jianyuan_migrations',
    [],
  );
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    await driver.execAsync('BEGIN IMMEDIATE');
    try {
      await driver.execAsync(migration.sql);
      await driver.runAsync(
        'INSERT INTO _jianyuan_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        [migration.version, migration.name, new Date().toISOString()],
      );
      await driver.execAsync('COMMIT');
    } catch (error) {
      await driver.execAsync('ROLLBACK');
      throw error;
    }
  }
};

/** Connection pragmas, mirroring the Desktop adapter. */
export const applyMobilePragmas = async (driver: SqlDriver): Promise<void> => {
  await driver.execAsync('PRAGMA journal_mode = WAL');
  await driver.execAsync('PRAGMA synchronous = NORMAL');
  // Foreign keys are per-connection in SQLite and default to OFF, so the
  // ON DELETE CASCADE / RESTRICT rules in the schema above are inert unless
  // this is set on every connection.
  await driver.execAsync('PRAGMA foreign_keys = ON');
};
