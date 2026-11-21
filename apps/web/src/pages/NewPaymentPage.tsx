import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CreatePaymentRequest } from "@oya/contracts";
import { ErrorMessage } from "../components/PaymentShell";
import { api } from "../lib/api";

export function NewPaymentPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const create = useMutation({
    mutationFn: ({ body, key }: { body: CreatePaymentRequest; key: string }) => api.createPayment(body, key),
    onSuccess: (payment) => {
      void client.invalidateQueries({ queryKey: ["merchant", "payments"] });
      navigate(`/dashboard/payments/${encodeURIComponent(payment.id)}`);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    const fields = new FormData(event.currentTarget);
    const body = { amount: String(fields.get("amount")).trim(), description: String(fields.get("description")).trim() };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    create.mutate({ body, key: attempt.current.key });
  }

  return <section className="product-card product-narrow">
    <h1>New payment</h1>
    <p>Set your price in naira. The rate locks for 60 seconds when you create the payment.</p>
    <form className="product-form" onSubmit={submit}>
      <label>Amount in naira<input name="amount" inputMode="decimal" placeholder="8500.00" pattern="[0-9]{1,16}([.][0-9]{1,2})?" required /></label>
      <label>Description (optional)<textarea name="description" maxLength={240} rows={3} /></label>
      {create.error && <ErrorMessage error={create.error} />}
      <button className="product-primary" type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating payment…" : "Create payment link"}
      </button>
    </form>
  </section>;
}
