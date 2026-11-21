import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentEvent } from "@oya/contracts";
import { Checkout } from "../components/Checkout";
import { ErrorMessage } from "../components/PaymentShell";
import { Receipt } from "../components/Receipt";
import { api, RequestError } from "../lib/api";
import { useLivePayment } from "../lib/payments";

export function PaymentPage() {
  const id = useParams().paymentId ?? "";
  const client = useQueryClient();
  const receive = useCallback((payment: PaymentEvent) => client.setQueryData(["checkout", id], payment), [id, client]);
  const connected = useLivePayment(id, Boolean(id), receive);
  const payment = useQuery({
    queryKey: ["checkout", id],
    queryFn: ({ signal }) => api.checkout(id, signal),
    retry: false,
    refetchInterval: (query) => connected || query.state.error instanceof RequestError && query.state.error.statusCode === 404 ? false : 5000,
  });

  if (payment.isPending) return <p role="status">Loading payment…</p>;
  if (!payment.data) return <ErrorMessage error={payment.error ?? new Error("Payment unavailable")} />;
  return <div className="product-stack">
    <Checkout payment={payment.data} />
    {payment.data.receiptAvailable && <Receipt id={id} merchant={false} />}
  </div>;
}
