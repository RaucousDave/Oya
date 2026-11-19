import type { StatusNotifier } from "../status-notifier.js";

export class InMemoryStatusNotifier implements StatusNotifier {
  readonly notifications: string[] = [];
  failure: Error | null = null;

  async notifyPaymentStatus(paymentId: string): Promise<void> {
    if (this.failure !== null) {
      throw this.failure;
    }

    this.notifications.push(paymentId);
  }
}
