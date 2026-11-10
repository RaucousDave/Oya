import { describe, it, expect } from "vitest";
import {
  getExpiryTimeStamps,
  isRateExpired,
  isWithinGracePeriod,
  evaluatePaymentTiming,
  RATE_LOCK_DURATION_MS,
  TOP_UP_GRACE_PERIOD,
} from "../expiry.js";

describe("Rate lock and expiry rules (OYA-014)", () => {
  const baseTime = new Date("2026-11-10T12:00:00.000Z");

  it("calculates accurate expiry timestamps", () => {
    const { rateExpiresAt, gracePeriodExpiresAt } = getExpiryTimeStamps(baseTime);

    expect(rateExpiresAt.getTime() - baseTime.getTime()).toBe(RATE_LOCK_DURATION_MS);
    expect(gracePeriodExpiresAt.getTime() - rateExpiresAt.getTime()).toBe(TOP_UP_GRACE_PERIOD);
  });

  it("correctly identifies rate expiry", () => {
    const { rateExpiresAt } = getExpiryTimeStamps(baseTime);

    // 30s in -> not expired
    const inside = new Date(baseTime.getTime() + 30 * 1000);
    expect(isRateExpired(rateExpiresAt, inside)).toBe(false);

    // 61s in -> expired
    const expired = new Date(baseTime.getTime() + 61 * 1000);
    expect(isRateExpired(rateExpiresAt, expired)).toBe(true);
  });

  it("identifies when payment is within top-up grace period", () => {
    const { rateExpiresAt, gracePeriodExpiresAt } = getExpiryTimeStamps(baseTime);

    // 30s in -> NOT in grace period (still in valid rate window)
    const tooEarly = new Date(baseTime.getTime() + 30 * 1000);
    expect(isWithinGracePeriod(rateExpiresAt, gracePeriodExpiresAt, tooEarly)).toBe(false);

    // 2 minutes in -> within grace period
    const inGrace = new Date(baseTime.getTime() + 120 * 1000);
    expect(isWithinGracePeriod(rateExpiresAt, gracePeriodExpiresAt, inGrace)).toBe(true);

    // 7 minutes in -> past grace period
    const tooLate = new Date(baseTime.getTime() + 420 * 1000);
    expect(isWithinGracePeriod(rateExpiresAt, gracePeriodExpiresAt, tooLate)).toBe(false);
  });

  it("evaluates payment timing accurately across all windows", () => {
    // 1. Within 60 seconds
    const withinRate = new Date(baseTime.getTime() + 45 * 1000);
    expect(evaluatePaymentTiming(baseTime, withinRate)).toBe("VALID_RATE_WINDOW");

    // 2. Between 60s and 60s + 5m (e.g. 3 minutes)
    const inGrace = new Date(baseTime.getTime() + 180 * 1000);
    expect(evaluatePaymentTiming(baseTime, inGrace)).toBe("WITHIN_GRACE_PERIOD");

    // 3. Past grace period (e.g. 10 minutes)
    const expired = new Date(baseTime.getTime() + 600 * 1000);
    expect(evaluatePaymentTiming(baseTime, expired)).toBe("EXPIRED");
  });
});
