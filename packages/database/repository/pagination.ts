import { and, eq, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import type { PaymentCursor } from "../types/payment";

export function validateLimit(limit = 20): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Limit must be an integer between 1 and 100");
  }
  return limit;
}

export function validateDate(date: Date): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError("Expected a valid Date");
  }
}

export function validateCursor(cursor?: PaymentCursor): void {
  if (!cursor) return;
  validateDate(cursor.timestamp);
  if (!cursor.id) throw new TypeError("Cursor must include an ID");
}

// Match the millisecond precision exposed by JS Dates. Historical audit/ledger
// rows can have no timestamp and sort at the end using a stable sentinel.
export const missingTimestamp = new Date("0001-01-01T00:00:00.000Z");
export function orderedTimestamp(column: SQLWrapper) {
  return sql`date_trunc('milliseconds', coalesce(${column}, timestamp '0001-01-01'))`;
}

export function beforeCursor(timestamp: SQLWrapper, id: SQLWrapper, cursor?: PaymentCursor) {
  validateCursor(cursor);
  if (!cursor) return undefined;
  const time = sql`${cursor.timestamp.toISOString()}::timestamp`;
  return or(lt(timestamp, time), and(eq(timestamp, time), lt(id, cursor.id)));
}
