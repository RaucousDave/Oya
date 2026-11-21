import { useCallback, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage, PaymentEvent } from "@oya/contracts";
import { Checkout, CopyButton } from "../components/Checkout";
import { ErrorMessage } from "../components/PaymentShell";
import { Receipt } from "../components/Receipt";
import { api } from "../lib/api";
import { formatUnits, naira, paymentDate, statusLabels, useLivePayment } from "../lib/payments";

type Details<T> = {
  id: string;
  title: string;
  first: CursorPage<T>;
  load: (id: string, cursor: string, signal?: AbortSignal) => Promise<CursorPage<T>>;
  render: (item: T) => ReactNode;
};

function Records<T extends { id: string }>({ id, title, first, load, render }: Details<T>) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const extra = useQuery({
    queryKey: ["merchant", "records", id, title, cursor],
    enabled: Boolean(cursor),
    queryFn: ({ signal }) => load(id, cursor!, signal),
  });
  const page = cursor ? extra.data : first;
  return <section className="product-card">
    <h2>{title}</h2>
    {extra.error && <ErrorMessage error={extra.error} />}
    {cursor && extra.isPending && <p role="status">Loading records…</p>}
    {page && (page.items.length ? <ul className="product-records">{page.items.map((item) => <li key={item.id}>{render(item)}</li>)}</ul>
      : <p>No records yet.</p>)}
    <div className="product-actions">
      {cursor && <button className="product-secondary" onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button>}
      {page?.nextCursor && <button className="product-secondary" onClick={() => setCursors([...cursors, page.nextCursor!])}>Next</button>}
    </div>
  </section>;
}

export function MerchantPaymentPage() {
  const id = useParams().paymentId ?? "";
  const client = useQueryClient();
  const key = ["merchant", "payment", id];
  const detail = useQuery({ queryKey: key, queryFn: ({ signal }) => api.merchantPayment(id, signal), refetchInterval: 5000 });
  const refresh = useCallback((_payment: PaymentEvent) => {
    void client.invalidateQueries({ queryKey: ["merchant", "payment", id] });
    void client.invalidateQueries({ queryKey: ["merchant", "payments"] });
  }, [client, id]);
  useLivePayment(id, Boolean(detail.data), refresh);

  if (detail.isPending) return <p role="status">Loading payment…</p>;
  if (!detail.data) return <ErrorMessage error={detail.error ?? new Error("Payment unavailable")} />;
  const { payment, audit, transactions, payout, ledger } = detail.data;
  return <div className="product-stack">
    <div className="product-actions">
      <Link className="product-secondary" to="/dashboard">Back to payments</Link>
      <Link className="product-primary" to={`/pay/${encodeURIComponent(id)}`}>Open customer checkout</Link>
    </div>
    <Checkout payment={payment} />
    <section className="product-card product-share">
      <h2>Share payment</h2>
      <a href={payment.paymentUrl}>{payment.paymentUrl}</a>
      <CopyButton value={payment.paymentUrl} label="Copy payment link" />
    </section>
    {payment.receiptAvailable && <Receipt id={id} merchant />}
    <section className="product-card">
      <h2>Demo payout</h2>
      {payout ? <p>{payout.status ?? "Pending"}{payout.ngnAmountKobo === null ? "" : ` · ${naira(payout.ngnAmountKobo)}`}
        {payout.providerReference && ` · ${payout.providerReference}`}</p> : <p>No payout recorded yet.</p>}
    </section>
    <Records key={`${id}-tx`} id={id} title="Chain transfers" first={transactions} load={api.transactions}
      render={(tx) => <div>{tx.txHash && <a href={`https://sepolia.basescan.org/tx/${tx.txHash}`}>{tx.txHash}</a>}
        <p>{tx.amount && `${formatUnits(tx.amount, payment.token.decimals)} ${payment.token.symbol} · `}
          {tx.confirmations ?? 0} confirmations · {paymentDate(tx.detectedAt)}</p></div>} />
    <Records key={`${id}-audit`} id={id} title="Status history" first={audit} load={api.audit}
      render={(event) => <div><strong>{event.newStatus ? statusLabels[event.newStatus] : "Status update"}</strong>
        <p>{event.reason} · {paymentDate(event.createdAt)}</p></div>} />
    <Records key={`${id}-ledger`} id={id} title="Ledger" first={ledger} load={api.ledger}
      render={(entry) => <div><strong>{entry.entryType}</strong>
        <p>{entry.amount && formatUnits(entry.amount, entry.assetDecimals ?? 0)} {entry.assetCode} · {paymentDate(entry.createdAt)}</p></div>} />
  </div>;
}
