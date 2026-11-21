import type { Database } from "./db";

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Queries shared by the connection and a transaction, without a global-client fallback. */
export type DatabaseExecutor = Pick<Database, "select" | "insert" | "update" | "execute">;
export type TransactionExecutor = DatabaseExecutor & Pick<DatabaseTransaction, "rollback">;
