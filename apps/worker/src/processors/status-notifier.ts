export interface StatusNotifier {
  notifyPaymentStatus(paymentId: string): Promise<void>;
}
