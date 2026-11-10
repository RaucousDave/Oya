import { describe, it, expect } from "vitest";
import { canTransition, transitionPayment } from "../state-machine.js";

describe("Payment state machine (OYA-012)", () => {
  it("allows happy path transitions from CREATED to SETTLED", () => {
    expect(canTransition("CREATED", "AWAITING_PAYMENT")).toBe(true);
    expect(canTransition("AWAITING_PAYMENT", "CONFIRMING")).toBe(true);
    expect(canTransition("CONFIRMING", "PAID")).toBe(true);
    expect(canTransition("PAID", "PAYOUT_PENDING")).toBe(true);
    expect(canTransition("PAYOUT_PENDING", "SETTLED")).toBe(true);
  });

  it("allows top-up flow for UNDERPAID payments", () => {
    expect(canTransition("CONFIRMING", "UNDERPAID")).toBe(true);
    expect(canTransition("UNDERPAID", "CONFIRMING")).toBe(true);
    expect(canTransition("UNDERPAID", "EXPIRED")).toBe(true);
  });

  it("blocks illegal state transitions", () => {
    // Cannot skip states
    expect(canTransition("CREATED", "SETTLED")).toBe(false);
    expect(canTransition("CREATED", "PAID")).toBe(false);

    // Terminal states cannot transition
    expect(canTransition("SETTLED", "PAID")).toBe(false);
    expect(canTransition("EXPIRED", "PAID")).toBe(false);
    expect(canTransition("FAILED", "PAID")).toBe(false);
  });

  it("transitionPayment returns an audit log object on valid transition", () => {
    const result = transitionPayment("AWAITING_PAYMENT", "CONFIRMING", "Detected on-chain tx");
    expect(result.from).toBe("AWAITING_PAYMENT");
    expect(result.to).toBe("CONFIRMING");
    expect(result.reason).toBe("Detected on-chain tx");
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it("transitionPayment throws on illegal transition", () => {
    expect(() =>
      transitionPayment("EXPIRED", "PAID", "Late deposit received")
    ).toThrowError(/Invalid payment transition: cannot move from EXPIRED to PAID/);
  });
});
