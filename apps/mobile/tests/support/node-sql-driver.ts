/**
 * A `node:sqlite` implementation of the Mobile `SqlDriver` interface.
 *
 * WHY THIS IS TEST INFRASTRUCTURE, NOT A MOCK
 * This driver executes real SQLite. It creates a real database file (or an
 * in-memory database), runs the real Mobile migrations, and runs the real SQL
 * from the adapter. What it replaces is only the *binding* to `expo-sqlite`,
 * which cannot be imported outside a device. So the adapter's statements, its
 * transaction boundaries, its ordering rules, and its restart behaviour are all
 * verified for real — the thing under test is the production code path.
 *
 * It lives under tests/support and is never imported by app code, so no
 * `node:sqlite` reference can reach the Metro bundle.
 */

import { DatabaseSync } from 'node:sqlite';

import type {
  SqlDriver,
  SqlExecutor,
  SqlRunResult,
  SqlValue,
} from '../../src/storage/sql-driver';

/** node:sqlite binds these types; everything else is rejected loudly. */
const assertBindable = (params: readonly SqlValue[]): void => {
  for (const param of params) {
    if (param !== null && typeof param !== 'string' && typeof param !== 'number') {
      throw new TypeError(`Unsupported SQLite bind value: ${typeof param}`);
    }
  }
};

class NodeSqlExecutor implements SqlExecutor {
  // Protected so NodeSqlDriver, which extends this class, can run its own
  // BEGIN/COMMIT/ROLLBACK against the same connection.
  constructor(protected readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async runAsync(sql: string, params: readonly SqlValue[]): Promise<SqlRunResult> {
    assertBindable(params);
    const result = this.database.prepare(sql).run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getAllAsync<TRow>(sql: string, params: readonly SqlValue[]): Promise<TRow[]> {
    assertBindable(params);
    return this.database.prepare(sql).all(...params) as TRow[];
  }

  async getFirstAsync<TRow>(
    sql: string,
    params: readonly SqlValue[],
  ): Promise<TRow | null> {
    assertBindable(params);
    const row = this.database.prepare(sql).get(...params);
    return (row as TRow | undefined) ?? null;
  }
}

class NodeSqlDriver extends NodeSqlExecutor implements SqlDriver {
  private inTransaction = false;

  constructor(
    database: DatabaseSync,
    readonly location: string,
  ) {
    super(database);
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.inTransaction;
  }

  /**
   * Real atomicity: BEGIN IMMEDIATE, commit on success, rollback on throw. The
   * flag guards against a nested BEGIN, which SQLite rejects.
   */
  async withExclusiveTransactionAsync<TResult>(
    work: (transaction: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    if (this.inTransaction) return work(this);

    this.database.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = await work(this);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

/**
 * Open a driver backed by a real SQLite file.
 *
 * Pass `:memory:` for an isolated per-test database.
 */
export const openNodeSqlDriver = (location: string): SqlDriver => {
  const database = new DatabaseSync(location, {
    enableForeignKeyConstraints: true,
  });
  return new NodeSqlDriver(database, location);
};
