import type {
  PayoutInput,
  PayoutProvider,
  PayoutResult,
} from "./payout-provider.js";

export const MOCK_PAYOUT_PROVIDER = "mock";

export class MockPayoutProvider implements PayoutProvider {
  private readonly payouts = new Map<string, PayoutResult>();
  readonly calls: PayoutInput[] = [];

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    this.calls.push({ ...input });

    const existing = this.payouts.get(input.idempotencyKey);

    if (existing !== undefined) {
      return { ...existing };
    }

    const result: PayoutResult = {
      provider: MOCK_PAYOUT_PROVIDER,
      providerReference: `mock-${input.paymentId}`,
      status: "COMPLETED",
    };

    this.payouts.set(input.idempotencyKey, result);

    return { ...result };
  }

  get payoutCount(): number {
    return this.payouts.size;
  }
}
