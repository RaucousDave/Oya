import { useEffect, useState } from "react";
import type { PaymentStatus } from "@oya/contracts";
import { api } from "./api";

export const statusLabels: Record<PaymentStatus, string> = {
  CREATED: "Created",
  AWAITING_PAYMENT: "Awaiting payment",
  CONFIRMING: "Confirming transfer",
  UNDERPAID: "Top-up needed",
  OVERPAID: "Overpayment received",
  PAID: "Payment confirmed",
  PAYOUT_PENDING: "Demo payout pending",
  SETTLED: "Settled",
  EXPIRED: "Expired",
  WRONG_NETWORK_FLAGGED: "Wrong network",
  REFUNDED: "Refunded",
  FAILED: "Failed",
};

export function formatUnits(value: string, decimals: number) {
  const signed = value.startsWith("-");
  const digits = (signed ? value.slice(1) : value).padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return `${signed ? "-" : ""}${BigInt(whole).toLocaleString("en-NG")}${fraction ? "." + fraction : ""}`;
}

export function naira(kobo: string) {
  const [whole, fraction = ""] = formatUnits(kobo, 2).split(".");
  return `₦${whole}.${fraction.padEnd(2, "0")}`;
}

const dateTime = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
});
export function paymentDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "—";
}

export function useLivePayment(id: string, enabled: boolean, receive: Parameters<typeof api.subscribe>[1]) {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return api.subscribe(id, receive, setConnected);
  }, [id, enabled, receive]);
  return connected;
}
