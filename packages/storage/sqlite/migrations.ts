import type { DatabaseSync } from 'node:sqlite';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const SQLITE_SCHEMA_VERSION = 1;

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

export const applyMigrations = (database: DatabaseSync): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _jianyuan_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const applied = new Set(
    database
      .prepare('SELECT version FROM _jianyuan_migrations')
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database
        .prepare(
          'INSERT INTO _jianyuan_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        )
        .run(migration.version, migration.name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
};
