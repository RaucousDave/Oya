import type { ConfirmProcessor } from "../processors/confirm-processor.js";
import type { JobLogger } from "./job-logger.js";

export class ConfirmJob {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly processor: Pick<ConfirmProcessor, "confirmOnce">,
    private readonly intervalMs: number,
    private readonly logger: JobLogger,
  ) {}

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.processor.confirmOnce();
    } catch (error) {
      this.logger.error("Confirm job failed", error);
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
