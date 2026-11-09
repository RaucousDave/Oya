import { LogoMark } from "./Logo";

export function ReceiptCard() {
  return (
    <div
      className="receipt"
      role="img"
      aria-label="Oya receipt for ₦8,500 paid with 5.62 USDT on Base Sepolia, marked paid, with a queued naira payout."
    >
      <div aria-hidden="true">
        <div className="receipt__head">
          <span className="receipt__brand">
            <LogoMark size={18} />
            Oya
          </span>
          <span className="receipt__tag">Receipt OY-1042</span>
        </div>

        <span className="receipt__stamp">Paid</span>

        <div className="receipt__amount">
          <span>Amount received</span>
          <strong>₦8,500.00</strong>
        </div>

        <dl className="receipt__rows">
          <div className="receipt__row">
            <dt>Merchant</dt>
            <dd>Mariam&rsquo;s Fabrics</dd>
          </div>
          <div className="receipt__row">
            <dt>Paid with</dt>
            <dd>5.62 USDT</dd>
          </div>
          <div className="receipt__row">
            <dt>Rate used</dt>
            <dd>₦1,512.00 per USDT</dd>
          </div>
          <div className="receipt__row">
            <dt>Network</dt>
            <dd>Base Sepolia</dd>
          </div>
          <div className="receipt__row">
            <dt>Confirmations</dt>
            <dd>2</dd>
          </div>
          <div className="receipt__row">
            <dt>Transaction</dt>
            <dd className="is-mono">0x9c4e...7f21</dd>
          </div>
          <div className="receipt__row">
            <dt>Issued</dt>
            <dd>09 Nov 2026, 14:32 WAT</dd>
          </div>
        </dl>

        <div className="receipt__foot">
          <span>GTBank account ending 4821</span>
          <span className="receipt__payout">
            <i />
            Payout queued
          </span>
        </div>
      </div>
    </div>
  );
}
