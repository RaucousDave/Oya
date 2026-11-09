import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChainIcon,
  CheckCircleIcon,
  CopyIcon,
} from "./Icons";
import { QrCode } from "./QrCode";

type Phase = "awaiting" | "confirming" | "paid";

const PHASES: Phase[] = ["awaiting", "confirming", "paid"];

const PHASE_MS: Record<Phase, number> = {
  awaiting: 5400,
  confirming: 3200,
  paid: 4600,
};

const PHASE_LABEL: Record<Phase, string> = {
  awaiting: "Awaiting",
  confirming: "Confirming",
  paid: "Paid",
};

const STATUS_COPY: Record<Phase, { chip: string; hint: string }> = {
  awaiting: { chip: "Awaiting payment", hint: "Scan with any wallet" },
  confirming: { chip: "Confirming", hint: "2 of 2 confirmations" },
  paid: { chip: "Paid", hint: "₦8,500 received" },
};

const DEPOSIT_ADDRESS = "0x7f3a9c2e4b8d1a6f0e5c3b7d9a2f8e41c21b";

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduce;
}

export function PaymentPreview() {
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [copied, setCopied] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduceMotion) {
      setPhase("paid");
      return;
    }

    let index = 0;
    let timer = 0;

    const run = () => {
      const current = PHASES[index]!;
      setPhase(current);
      timer = window.setTimeout(() => {
        index = (index + 1) % PHASES.length;
        run();
      }, PHASE_MS[current]);
    };

    run();
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    return () => window.clearTimeout(copyTimer.current);
  }, []);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DEPOSIT_ADDRESS);
    } catch {
      // Clipboard can be unavailable outside secure contexts. The affordance still confirms.
    }
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const activeIndex = PHASES.indexOf(phase);
  const status = STATUS_COPY[phase];

  return (
    <article className="pay-card" data-phase={phase}>
      <header className="pay-card__head">
        <div className="pay-card__merchant">
          <span className="avatar" aria-hidden="true">
            MF
          </span>
          <div>
            <span className="pay-card__name">Mariam&rsquo;s Fabrics</span>
            <span className="pay-card__sub">Payment request</span>
          </div>
        </div>
        <span className="live-chip">
          <i className="live-chip__dot" aria-hidden="true" />
          Live preview
        </span>
      </header>

      <div className="pay-card__amount">
        <span className="pay-card__amount-label">Amount due</span>
        <span className="pay-card__amount-value">₦8,500.00</span>
        <p className="pay-card__desc">Ankara fabric, 6 yards</p>
      </div>

      <div className="pay-card__body">
        <div className="qr-box">
          <div className="qr">
            <QrCode />
            {phase === "awaiting" ? (
              <span className="qr__scan" aria-hidden="true" />
            ) : null}
          </div>
          <span className="qr-network">
            <ChainIcon />
            Base Sepolia
          </span>
        </div>

        <dl className="pay-meta">
          <div className="pay-meta__row">
            <dt>Pay with</dt>
            <dd>5.62 USDT</dd>
          </div>
          <div className="pay-meta__row">
            <dt>Rate</dt>
            <dd>₦1,512.00 / $1</dd>
          </div>
          <div className="pay-meta__row">
            <dt>Rate lock</dt>
            <dd>00:47</dd>
          </div>
          <div className="pay-meta__row">
            <dt>Accepted</dt>
            <dd>USDT, USDC</dd>
          </div>
        </dl>
      </div>

      <div className="pay-address">
        <span className="pay-address__label">Deposit address, one per payment</span>
        <div className="pay-address__row">
          <code>0x7f3a...c21b</code>
          <button
            type="button"
            className="copy-btn"
            data-copied={copied}
            onClick={copyAddress}
            aria-label="Copy deposit address"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <ol className="pay-progress">
        {PHASES.map((item, index) => (
          <li key={item} data-on={index <= activeIndex}>
            <span className="pay-progress__bar" />
            <span className="pay-progress__label">{PHASE_LABEL[item]}</span>
          </li>
        ))}
      </ol>

      <div className="pay-card__status">
        <span className="status-chip" data-state={phase}>
          <i aria-hidden="true" />
          {status.chip}
        </span>
        <span className="pay-card__hint">{status.hint}</span>
      </div>

      <p className="sr-only">
        Payment preview. A ₦8,500 request moves from awaiting payment to
        confirming to paid, then issues a receipt.
      </p>

      <div className="pay-toast" data-show={phase === "paid"} aria-hidden="true">
        <span className="pay-toast__icon">
          <CheckCircleIcon size={15} />
        </span>
        <div>
          <strong>₦8,500 received</strong>
          <span>Receipt OY-1042 issued</span>
        </div>
      </div>
    </article>
  );
}
