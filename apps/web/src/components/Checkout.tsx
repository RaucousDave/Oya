import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { CheckoutPayment } from "@oya/contracts";
import { formatUnits, naira } from "../lib/payments";
import { Status } from "./PaymentShell";

const messages: Partial<Record<CheckoutPayment["status"], string>> = {
  CONFIRMING: "We detected your transfer and are waiting for network confirmations.",
  PAID: "Your transfer has been confirmed.",
  PAYOUT_PENDING: "Your transfer is confirmed and the demo payout is processing.",
  OVERPAID: "We received more than the requested amount. Your merchant can see the difference.",
  SETTLED: "Your demo payment is settled. Your receipt is ready when settlement records are available.",
  EXPIRED: "Ask the merchant for a new payment link.",
  WRONG_NETWORK_FLAGGED: "A transfer was flagged on the wrong network. Contact the merchant before sending again.",
  FAILED: "The payment could not complete. Contact the merchant for help.",
  REFUNDED: "The payment has been marked as refunded.",
};

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  return <div>
    <button className="product-secondary" type="button" onClick={async () => {
      try {
        await navigator.clipboard.writeText(value);
        setFeedback("Copied.");
      } catch {
        setFeedback("Select and copy the text manually.");
      }
    }}>{label}</button>
    <span className="product-copy-status" role="status">{feedback}</span>
  </div>;
}

function PaymentQr({ payload }: { payload: string }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, { margin: 4, width: 244 })
      .then((image) => { if (active) setQr(image); })
      .catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [payload]);
  return qr ? <img className="product-qr" src={qr} alt="Scan to open the exact transfer in a compatible wallet" width={244} height={244} />
    : <p>Use the wallet link or copy the deposit address.</p>;
}

export function Checkout({ payment }: { payment: CheckoutPayment }) {
  const [now, setNow] = useState(Date.now);
  const topUp = payment.status === "UNDERPAID";
  const deadline = topUp ? payment.topUpExpiresAt : payment.rateExpiresAt;
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  const awaiting = topUp || payment.status === "AWAITING_PAYMENT";
  const canPay = awaiting && seconds > 0 && BigInt(payment.remainingTokenAmount) > 0n;

  useEffect(() => {
    if (!awaiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [awaiting]);

  return <section className="product-card product-checkout">
    <div className="product-heading">
      <div>
        <p className="product-muted">{payment.merchant.businessName}</p>
        <h1>{naira(payment.ngnAmountKobo)}</h1>
        {payment.description && <p>{payment.description}</p>}
      </div>
      <div aria-live="polite"><Status value={payment.status} /></div>
    </div>
    <p className="product-note">Base Sepolia testnet · Test tokens only · Naira payouts are simulated</p>
    {awaiting && !canPay && <p role="status">The payment window has ended. Ask the merchant for a new link.</p>}
    {messages[payment.status] && <p>{messages[payment.status]}</p>}
    <dl className="product-facts">
      <div><dt>Requested</dt><dd>{formatUnits(payment.requiredTokenAmount, payment.token.decimals)} {payment.token.symbol}</dd></div>
      <div><dt>Confirmed received</dt><dd>{formatUnits(payment.receivedTokenAmount, payment.token.decimals)} {payment.token.symbol}</dd></div>
      <div><dt>Locked rate</dt><dd>₦{payment.lockedRate} per USD</dd></div>
      <div><dt>Required confirmations</dt><dd>{payment.requiredConfirmations}</dd></div>
    </dl>
    {canPay && <div className="product-payment-instructions">
      <PaymentQr key={payment.qrPayload} payload={payment.qrPayload} />
      <div>
        <h2>{topUp ? "Top up this payment" : "Send the exact amount"}</h2>
        <p className="product-amount">{formatUnits(payment.remainingTokenAmount, payment.token.decimals)} {payment.token.symbol}</p>
        <p>{Math.floor(seconds / 60)}m {seconds % 60}s left</p>
        <dl className="product-facts">
          <div><dt>Deposit address</dt><dd><code>{payment.depositAddress}</code></dd></div>
          <div><dt>Token contract</dt><dd><code>{payment.token.address}</code></dd></div>
        </dl>
        <div className="product-actions">
          <a className="product-primary" href={payment.qrPayload}>Open wallet</a>
          <CopyButton value={payment.depositAddress} label="Copy address" />
        </div>
      </div>
    </div>}
  </section>;
}
