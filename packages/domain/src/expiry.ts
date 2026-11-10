export const RATE_LOCK_DURATION_MS = 60 * 1000;
export const TOP_UP_GRACE_PERIOD = 5 * 60 * 1000;

export function getExpiryTimeStamps(createdAt: Date) {
  const createdMs = createdAt.getTime();

  const rateExpiresAt = new Date(createdMs + RATE_LOCK_DURATION_MS);
  const gracePeriodExpiresAt = new Date(
    rateExpiresAt.getTime() + TOP_UP_GRACE_PERIOD,
  );

  return { rateExpiresAt, gracePeriodExpiresAt };
}

export function isRateExpired(
  rateExpiresAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() > rateExpiresAt.getTime();
}

export function isWithinGracePeriod(
  rateExpiresAt: Date,
  gracePeriodExpiresAt: Date,
  now: Date = new Date(),
): boolean {
  return (
    now.getTime() > rateExpiresAt.getTime() &&
    now.getTime() <= gracePeriodExpiresAt.getTime()
  );
}

export type TimingDecision =
  | "VALID_RATE_WINDOW"
  | "WITHIN_GRACE_PERIOD"
  | "EXPIRED";

export function evaluatePaymentTiming(
  createdAt: Date,
  now: Date = new Date(),
): TimingDecision {
  const { rateExpiresAt, gracePeriodExpiresAt } =
    getExpiryTimeStamps(createdAt);

  if (!isRateExpired(rateExpiresAt, now)) {
    return "VALID_RATE_WINDOW";
  } else if (isWithinGracePeriod(rateExpiresAt, gracePeriodExpiresAt, now)) {
    return "WITHIN_GRACE_PERIOD";
  }
  return "EXPIRED";
}
