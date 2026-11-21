import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatUnits, naira, paymentDate } from "../lib/payments";
import { ErrorMessage } from "./PaymentShell";

export function Receipt({ id, merchant }: { id: string; merchant: boolean }) {
  const receipt = useQuery({
    queryKey: [merchant ? "merchant" : "checkout", "receipt", id],
    queryFn: ({ signal }) => api.receipt(id, merchant, signal),
  });
  if (receipt.isPending) return <p role="status">Loading receipt…</p>;
  if (receipt.error) return <ErrorMessage error={receipt.error} />;
  const data = receipt.data;

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `oya-receipt-${data.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="product-card">
    <h2>Payment receipt</h2>
    <dl className="product-facts">
      <div><dt>Merchant</dt><dd>{data.merchantName ?? "—"}</dd></div>
      <div><dt>Amount</dt><dd>{data.ngnAmountKobo === null ? "—" : naira(data.ngnAmountKobo)}</dd></div>
      <div><dt>Tokens received</dt><dd>{data.tokenAmount === null ? "—" : formatUnits(data.tokenAmount, data.tokenDecimals)}</dd></div>
      <div><dt>Locked rate</dt><dd>{data.rate ? `₦${data.rate} per USD` : "—"}</dd></div>
      <div><dt>Settled</dt><dd>{paymentDate(data.createdAt)}</dd></div>
    </dl>
    {data.transactionHashes.length > 0 && <ul>
      {data.transactionHashes.map((hash) => <li key={hash}><a href={`https://sepolia.basescan.org/tx/${hash}`}>{hash}</a></li>)}
    </ul>}
    <button className="product-secondary" type="button" onClick={download}>Download receipt</button>
  </section>;
}
