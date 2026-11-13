import { describe, expect, it, vi } from "vitest";
import { ExpireJob } from "../expire-job.js";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("ExpireJob", () => {
  it("does not start a run while the previous run is active", async () => {
    const gate = deferred();
    const expireOnce = vi.fn(() => gate.promise);
    const logger = { error: vi.fn() };
    const job = new ExpireJob({ expireOnce }, 1_000, logger);

    const firstRun = job.runOnce();
    const secondRun = job.runOnce();

    expect(expireOnce).toHaveBeenCalledTimes(1);

    gate.resolve();
    await Promise.all([firstRun, secondRun]);

    expect(expireOnce).toHaveBeenCalledTimes(1);
  });

  it("logs a failed tick and keeps the process alive", async () => {
    const error = new Error("database unavailable");
    const expireOnce = vi.fn(async () => {
      throw error;
    });
    const logger = { error: vi.fn() };
    const job = new ExpireJob({ expireOnce }, 1_000, logger);

    await expect(job.runOnce()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith("Expire job failed", error);
  });

  it("runs on the timer and stops cleanly", async () => {
    vi.useFakeTimers();

    try {
      const expireOnce = vi.fn(async () => {});
      const job = new ExpireJob({ expireOnce }, 1_000, { error: vi.fn() });

      job.start();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(expireOnce).toHaveBeenCalledTimes(1);

      job.stop();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(expireOnce).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
