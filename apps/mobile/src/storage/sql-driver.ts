/**
 * The one narrow seam between the Mobile storage adapter and SQLite.
 *
 * WHY A DRIVER SEAM EXISTS AT ALL
 * The Desktop adapter talks to `node:sqlite` directly, which cannot be
 * imported on iOS. `expo-sqlite` cannot be imported under Node either, so an
 * adapter that referenced it directly would be untestable in this repository:
 * the real SQL, the real migrations, and the real restart behaviour could only
 * ever be verified on a device.
 *
 * Defining the driver as this small async interface means the adapter's SQL is
 * ordinary code that can be executed for real under Node against a
 * `node:sqlite`-backed driver double, and on device against
 * `expo-sqlite` — same adapter, same statements, no mock SQL.
 *
 * SCOPE DISCIPLINE
 * This interface is deliberately tiny. It is NOT a storage port and carries no
 * epistemic meaning: `CoreStoragePorts` in packages/core remains the contract
 * the product speaks. Nothing here may leak into Core, and no Core type may be
 * referenced here.
 */

/** Values SQLite can bind directly. Booleans are not bindable on every driver. */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

/**
 * Anything that can execute statements. A transaction handle is also one of
 * these, which is what lets the adapter pass the executor down explicitly
 * instead of swapping a mutable field mid-flight.
 */
export interface SqlExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: readonly SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<TRow>(sql: string, params: readonly SqlValue[]): Promise<TRow[]>;
  getFirstAsync<TRow>(
    sql: string,
    params: readonly SqlValue[],
  ): Promise<TRow | null>;
}

export interface SqlDriver extends SqlExecutor {
  /** Where the database file lives. Reported in runtime status/diagnostics. */
  readonly location: string;

  isInTransactionAsync(): Promise<boolean>;

  /**
   * Run `work` inside one atomic transaction, committing on success and
   * rolling back on throw. `work` receives the transaction executor, so every
   * statement inside it is part of the same transaction.
   */
  withExclusiveTransactionAsync<TResult>(
    work: (transaction: SqlExecutor) => Promise<TResult>,
  ): Promise<TResult>;

  closeAsync(): Promise<void>;
}
