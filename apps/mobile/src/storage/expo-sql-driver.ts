/**
 * The production Mobile SQLite driver, backed by `expo-sqlite`.
 *
 * This is the ONLY file in the Mobile app that imports `expo-sqlite`. Every
 * other storage module speaks to the `SqlDriver` interface, which is what keeps
 * the adapter testable under Node (see tests/support/sqlite-driver-test.ts).
 *
 * SANDBOX LOCATION
 * `openDatabaseAsync(name)` with no directory argument writes to
 * `ExpoSQLite.defaultDatabaseDirectory`, which on iOS resolves to the app
 * sandbox `Documents/SQLite` directory (verified in
 * node_modules/expo-sqlite/ios/SQLiteModule.swift). That is inside the
 * per-app container, survives app termination, and is removed with the app.
 * No path outside the sandbox is ever referenced, and no Desktop database is
 * ever opened: the file is created empty on first install.
 */

import * as SQLite from 'expo-sqlite';

import type { SqlDriver, SqlExecutor, SqlRunResult, SqlValue } from './sql-driver';

/** expo-sqlite accepts these types directly; nothing else is bindable. */
const assertBindable = (params: readonly SqlValue[]): void => {
  for (const param of params) {
    if (
      param !== null &&
      typeof param !== 'string' &&
      typeof param !== 'number' &&
      typeof param !== 'bigint'
    ) {
      throw new TypeError(
        `Unsupported SQLite bind value: ${typeof param}. Convert booleans to 0/1 before binding.`,
      );
    }
  }
};

class ExpoSqlExecutor implements SqlExecutor {
  // Protected rather than private: ExpoSqlDriver extends this class and must
  // not declare a second, conflicting private field of the same name.
  constructor(protected readonly database: SQLite.SQLiteDatabase) {}

  async execAsync(sql: string): Promise<void> {
    await this.database.execAsync(sql);
  }

  async runAsync(sql: string, params: readonly SqlValue[]): Promise<SqlRunResult> {
    assertBindable(params);
    const result = await this.database.runAsync(sql, [...params]);
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowId),
    };
  }

  async getAllAsync<TRow>(sql: string, params: readonly SqlValue[]): Promise<TRow[]> {
    assertBindable(params);
    return this.database.getAllAsync<TRow>(sql, [...params]);
  }

  async getFirstAsync<TRow>(
    sql: string,
    params: readonly SqlValue[],
  ): Promise<TRow | null> {
    assertBindable(params);
    return this.database.getFirstAsync<TRow>(sql, [...params]);
  }
}

class ExpoSqlDriver extends ExpoSqlExecutor implements SqlDriver {
  readonly location: string;

  constructor(
    database: SQLite.SQLiteDatabase,
    location: string,
  ) {
    super(database);
    this.location = location;
  }

  async isInTransactionAsync(): Promise<boolean> {
    return this.database.isInTransactionAsync();
  }

  /**
   * Exclusive rather than plain `withTransactionAsync`, because the latter is
   * documented as interruptible by other async queries and gives no ordering
   * guarantee. Ingestion commits must be all-or-nothing in a defined order.
   */
  async withExclusiveTransactionAsync<TResult>(
    work: (transaction: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult> {
    // expo-sqlite types its transaction callback as `Promise<void>`, so the
    // result is captured rather than returned through it, then handed back
    // once the transaction has committed.
    let result: TResult | undefined;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      // expo-sqlite's Transaction extends SQLiteDatabase, and it issues
      // BEGIN/COMMIT/ROLLBACK itself on a dedicated connection, so the same
      // executor wrapper serves both the database and the transaction.
      result = await work(new ExpoSqlExecutor(transaction));
    });
    return result as TResult;
  }

  async closeAsync(): Promise<void> {
    await this.database.closeAsync();
  }
}

export const MOBILE_DATABASE_NAME = 'jianyuan.sqlite';

/**
 * Open the app-sandbox database and return it as a `SqlDriver`.
 *
 * `directory` is optional purely so tests can point at a scratch location on
 * platforms that support it; production callers omit it and get the sandbox
 * default.
 */
export const openMobileSqlDriver = async (
  databaseName: string = MOBILE_DATABASE_NAME,
  directory?: string,
): Promise<SqlDriver> => {
  const database =
    directory === undefined
      ? await SQLite.openDatabaseAsync(databaseName)
      : await SQLite.openDatabaseAsync(databaseName, {}, directory);

  return new ExpoSqlDriver(
    database,
    directory === undefined
      ? `${SQLite.defaultDatabaseDirectory ?? '<sandbox>'}/${databaseName}`
      : `${directory}/${databaseName}`,
  );
};
