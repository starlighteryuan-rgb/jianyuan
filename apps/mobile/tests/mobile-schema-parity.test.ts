/**
 * Phase M1-A verification: Mobile and Desktop schemas cannot silently drift.
 *
 * WHY THIS TEST IS LOAD-BEARING
 * Mobile repeats the DDL from packages/storage/sqlite/migrations.ts instead of
 * importing it (see src/storage/migrations.ts for why). A repeated schema is a
 * schema that can drift, and a drift here is silent: the app would still run,
 * but Mobile and Desktop would disagree about columns, constraints, or indexes,
 * and a future export/import or shared query would break in a way no type checks
 * catch.
 *
 * HOW IT IS CHECKED
 * Both schemas are built for real — the Desktop one through its own
 * `applyMigrations`, the Mobile one through the driver seam — and the resulting
 * `sqlite_master` structure is compared: every table, column, declared type,
 * nullability, primary-key flag, and every index with its definition. The schema
 * version constants are compared too.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMigrations as applyDesktopMigrations, SQLITE_SCHEMA_VERSION } from '../../../packages/storage/sqlite/migrations';
import { openNodeSqlDriver } from './support/node-sql-driver';
import { applyMobileMigrations, MOBILE_SQLITE_SCHEMA_VERSION } from '../src/storage/migrations';

const temporaryDirectories: string[] = [];

const scratchPath = (label: string): string => {
  const directory = mkdtempSync(join(tmpdir(), `jianyuan-${label}-`));
  temporaryDirectories.push(directory);
  return join(directory, 'schema.sqlite');
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface TableShape {
  readonly name: string;
  readonly columns: readonly string[];
  readonly indexes: readonly string[];
}

const normalizeSql = (sql: string | null): string =>
  (sql ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Read the logical schema shape out of a live database. */
const readSchemaShape = (database: DatabaseSync): readonly TableShape[] => {
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];

  return tables.map(({ name }) => {
    const columns = (
      database.prepare(`PRAGMA table_info("${name}")`).all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[]
    )
      .sort((left, right) => left.cid - right.cid)
      .map(
        (column) =>
          `${column.name}:${column.type.toLowerCase()}:notnull=${column.notnull}:pk=${column.pk}`,
      );

    const indexes = (
      database
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name",
        )
        .all(name) as { name: string; sql: string | null }[]
    ).map((index) => `${index.name}:${normalizeSql(index.sql)}`);

    return { name, columns, indexes };
  });
};

const buildDesktopSchema = (): readonly TableShape[] => {
  const database = new DatabaseSync(scratchPath('desktop-schema'));
  database.exec('PRAGMA foreign_keys = ON');
  applyDesktopMigrations(database);
  const shape = readSchemaShape(database);
  database.close();
  return shape;
};

const buildMobileSchema = async (): Promise<readonly TableShape[]> => {
  const location = scratchPath('mobile-schema');
  const driver = openNodeSqlDriver(location);
  await applyMobileMigrations(driver);

  // Re-read the file with node:sqlite directly so the comparison uses the same
  // introspection path for both schemas.
  const database = new DatabaseSync(location);
  const shape = readSchemaShape(database);
  database.close();
  await driver.closeAsync();
  return shape;
};

describe('Mobile and Desktop SQLite schema parity (M1-A)', () => {
  it('declares the same schema version', () => {
    expect(MOBILE_SQLITE_SCHEMA_VERSION).toBe(SQLITE_SCHEMA_VERSION);
  });

  it('produces an identical table, column, and index shape', async () => {
    const desktop = buildDesktopSchema();
    const mobile = await buildMobileSchema();

    // Compared as whole structures so a missing table, a changed column type, a
    // dropped NOT NULL, or a missing index all surface as a diff.
    expect(mobile).toEqual(desktop);
  });

  it('creates every table the Core storage ports require', async () => {
    const mobile = await buildMobileSchema();
    const names = mobile.map((table) => table.name);

    for (const table of [
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
    ]) {
      expect(names).toContain(table);
    }
  });

  it('is idempotent: re-running migrations applies nothing and keeps the shape', async () => {
    const location = scratchPath('mobile-idempotent');
    const driver = openNodeSqlDriver(location);

    await applyMobileMigrations(driver);
    const first = await driver.getAllAsync<{ version: number }>(
      'SELECT version FROM _jianyuan_migrations ORDER BY version',
      [],
    );

    // Second launch: must not duplicate tables or re-apply a version.
    await applyMobileMigrations(driver);
    const second = await driver.getAllAsync<{ version: number }>(
      'SELECT version FROM _jianyuan_migrations ORDER BY version',
      [],
    );

    expect(second).toEqual(first);
    expect(second.map((row) => Number(row.version))).toEqual([SQLITE_SCHEMA_VERSION]);

    const tableCount = await driver.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'records'",
      [],
    );
    expect(Number(tableCount?.count)).toBe(1);

    await driver.closeAsync();
  });

  it('enables foreign key enforcement so the schema constraints are live', async () => {
    const location = scratchPath('mobile-fk');
    const driver = openNodeSqlDriver(location);
    await applyMobileMigrations(driver);

    const pragma = await driver.getFirstAsync<{ foreign_keys: number }>(
      'PRAGMA foreign_keys',
      [],
    );
    // node:sqlite was opened with foreign keys enabled; the adapter also sets
    // the pragma explicitly on every connection.
    expect(Number(pragma?.foreign_keys)).toBe(1);

    await driver.closeAsync();
  });
});
