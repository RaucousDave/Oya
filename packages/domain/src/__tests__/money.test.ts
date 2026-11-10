import { describe, it, expect } from "vitest";
import {
  koboToNaira,
  nairaToKobo,
  calculateRequiredTokenAmount,
  comparePaymentAmounts,
} from "../money.js";

describe("Money and token arithmetic (OYA-013)", () => {
  describe("koboToNaira", () => {
    it("converts whole naira amounts", () => {
      expect(koboToNaira(100000n)).toBe("1000.00");
      expect(koboToNaira(0n)).toBe("0.00");
    });

    it("formats fractional kobo with leading zeros", () => {
      expect(koboToNaira(5n)).toBe("0.05");
      expect(koboToNaira(50n)).toBe("0.50");
      expect(koboToNaira(150n)).toBe("1.50");
    });

    it("handles negative amounts correctly", () => {
      expect(koboToNaira(-150n)).toBe("-1.50");
      expect(koboToNaira(-5n)).toBe("-0.05");
    });
  });

  describe("nairaToKobo", () => {
    it("converts whole naira strings", () => {
      expect(nairaToKobo("1000")).toBe(100000n);
      expect(nairaToKobo("0")).toBe(0n);
    });

    it("converts decimal strings", () => {
      expect(nairaToKobo("1000.50")).toBe(100050n);
      expect(nairaToKobo("1000.5")).toBe(100050n);
      expect(nairaToKobo("0.05")).toBe(5n);
    });

    it("handles negative amounts", () => {
      expect(nairaToKobo("-1000.50")).toBe(-100050n);
      expect(nairaToKobo("-0.50")).toBe(-50n);
    });

    it("throws on invalid currency formats", () => {
      expect(() => nairaToKobo("1.2.3")).toThrow("Invalid currency format");
      expect(() => nairaToKobo("10.555")).toThrow("Invalid currency format");
    });
  });

  describe("calculateRequiredTokenAmount", () => {
    it("calculates exact USDC (6 decimals) token units for given naira and rate", () => {
      // 15,000 NGN at 1500.00 NGN/USD = 10 USD = 10,000,000 base units
      const kobo = nairaToKobo("15000");
      const tokens = calculateRequiredTokenAmount(kobo, "1500.00", 6);
      expect(tokens).toBe(10_000_000n);
    });

    it("applies ceiling division to prevent rounding down on fractional units", () => {
      // 100 NGN at 1500.00 NGN/USD = 0.066666... USD
      const kobo = nairaToKobo("100");
      const tokens = calculateRequiredTokenAmount(kobo, "1500.00", 6);
      // 100 * 10^6 / 1500 = 66,666.666... -> ceiling is 66,667n
      expect(tokens).toBe(66_667n);
    });

    it("throws when rate or amount is <= 0 or decimals invalid", () => {
      expect(() => calculateRequiredTokenAmount(0n, "1500.00", 6)).toThrow("Amount must be greater than 0");
      expect(() => calculateRequiredTokenAmount(100n, "0.00", 6)).toThrow("Rate Must be greater than 0");
      expect(() => calculateRequiredTokenAmount(100n, "1500.00", -1)).toThrow("Invalid token");
    });
  });

  describe("comparePaymentAmounts", () => {
    it("identifies EXACT payments", () => {
      const res = comparePaymentAmounts(1000n, 1000n);
      expect(res.status).toBe("EXACT");
      expect(res.difference).toBe(0n);
    });

    it("identifies UNDERPAID payments with remaining deficit", () => {
      const res = comparePaymentAmounts(1000n, 700n);
      expect(res.status).toBe("UNDERPAID");
      expect(res.difference).toBe(300n);
    });

    it("identifies OVERPAID payments with positive surplus", () => {
      const res = comparePaymentAmounts(1000n, 1200n);
      expect(res.status).toBe("OVERPAID");
      expect(res.difference).toBe(200n);
    });
  });
});
