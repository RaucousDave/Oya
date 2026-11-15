import type { PayoutProcessor } from "../processors/payout-processor.js";
import type { JobLogger } from "./job-logger.js";

export class PayoutJob {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly processor: Pick<PayoutProcessor, "payoutOnce">,
    private readonly intervalMs: number,
    private readonly logger: JobLogger,
  ) {}

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.processor.payoutOnce();
    } catch (error) {
      this.logger.error("Payout job failed", error);
    } finally {
      this.running = false;
    }
  }

  start(): void {
    if (this.timer !== undefined) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer === undefined) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }
}
