import type { ScanProcessor } from "../processors/scan-processor.js";
import type { JobLogger } from "./job-logger.js";

export type { JobLogger } from "./job-logger.js";

export class ScanJob {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly processor: Pick<ScanProcessor, "scanOnce">,
    private readonly intervalMs: number,
    private readonly logger: JobLogger,
  ) {}

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.processor.scanOnce();
    } catch (error) {
      this.logger.error("Scan job failed", error);
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
