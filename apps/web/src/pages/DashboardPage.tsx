import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { paymentStatuses, type PaymentFilters, type PaymentStatus } from "@oya/contracts";
import { ErrorMessage, SignOut, Status } from "../components/PaymentShell";
import { api } from "../lib/api";
import { naira, paymentDate, statusLabels } from "../lib/payments";

function lagosDay(date: string, end = false) {
  if (!date) return undefined;
  return new Date(Date.parse(`${date}T00:00:00+01:00`) + (end ? 86_400_000 : 0)).toISOString();
}

export function DashboardPage() {
  const [filters, setFilters] = useState<PaymentFilters>({});
  const [cursors, setCursors] = useState<string[]>([]);
  const payments = useQuery({
    queryKey: ["merchant", "payments", filters, cursors.at(-1)],
    queryFn: ({ signal }) => api.merchantPayments({ ...filters, cursor: cursors.at(-1) }, signal),
    refetchInterval: 5000,
  });

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") ?? "") as PaymentStatus | "";
    setCursors([]);
    setFilters({
      status: status || undefined,
      from: lagosDay(String(form.get("from") ?? "")),
      to: lagosDay(String(form.get("to") ?? ""), true),
    });
  }

  return <div className="product-stack">
    <div className="product-heading">
      <h1>Payments</h1>
      <div className="product-actions"><Link className="product-primary" to="/payments/new">New payment</Link><SignOut /></div>
    </div>
    <form className="product-filters" onSubmit={filter}>
      <label>Status<select name="status"><option value="">All statuses</option>
        {paymentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select></label>
      <label>From<input name="from" type="date" /></label>
      <label>Through<input name="to" type="date" /></label>
      <button className="product-secondary" type="submit">Apply filters</button>
    </form>
    {payments.isPending && <p role="status">Loading payments…</p>}
    {payments.error && <ErrorMessage error={payments.error} />}
    {payments.data && <>
      <dl className="product-totals">
        <div className="product-card"><dt>Requested today</dt><dd>{naira(payments.data.totals.today)}</dd></div>
        <div className="product-card"><dt>Requested this week</dt><dd>{naira(payments.data.totals.week)}</dd></div>
      </dl>
      <section className="product-card">
        <h2>Payment history</h2>
        {payments.data.items.length === 0 ? <p>No payments match these filters.</p> :
          <ul className="product-records">{payments.data.items.map((payment) => <li key={payment.id}>
            <Link to={`/dashboard/payments/${encodeURIComponent(payment.id)}`}>
              <strong>{naira(payment.ngnAmountKobo)}</strong>
              <span>{payment.description || payment.reference}</span>
              <span>{paymentDate(payment.createdAt)}</span>
              <Status value={payment.status} />
            </Link>
          </li>)}</ul>}
        <div className="product-actions">
          {cursors.length > 0 && <button className="product-secondary" onClick={() => setCursors(cursors.slice(0, -1))}>Previous page</button>}
          {payments.data.nextCursor && <button className="product-secondary"
            onClick={() => setCursors([...cursors, payments.data.nextCursor!])}>Next page</button>}
        </div>
      </section>
    </>}
  </div>;
}
