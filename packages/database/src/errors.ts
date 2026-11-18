/** The same error is used for absent records and records owned by another merchant. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** A guarded write lost a race; reread state and reevaluate the operation before retrying. */
export class ConcurrentUpdateError extends Error {
  override name = "ConcurrentUpdateError";
}
