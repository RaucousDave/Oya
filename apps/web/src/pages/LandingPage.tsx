import { Fragment } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  MinusIcon,
  NetworkIcon,
  RefreshIcon,
} from "../components/Icons";
import { CodePanel } from "../components/CodePanel";
import { DashboardMockup } from "../components/DashboardMockup";
import { Faq } from "../components/Faq";
import { Mesh } from "../components/Mesh";
import { PaymentPreview } from "../components/PaymentPreview";
import { ReceiptCard } from "../components/ReceiptCard";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";

const OLD_WAY = [
  "Your customer finds a P2P buyer for their USDT.",
  "They wait for a bank transfer to land, then wait again for it to clear.",
  "You get a screenshot and a narration that does not match the amount.",
  "You reconcile by hand and hope the alert is real.",
];

const OYA_WAY = [
  "Your customer scans the QR code with any wallet.",
  "They send the exact USDT or USDC amount. The rate is already locked.",
  "Oya matches the transfer on chain by address and transaction hash.",
  "You get a receipt, a live status and a queued naira payout.",
];

const FLOW_STATES = [
  "Created",
  "Awaiting payment",
  "Confirming",
  "Paid",
  "Payout pending",
  "Settled",
];

const FLOW_BRANCHES = ["Expired", "Underpaid", "Overpaid", "Wrong network"];

const REAL_TODAY = [
  "Payment state machine with validated transitions",
  "60 second rate lock with expiry and top-up grace",
  "A unique deposit address derived for every payment",
  "Base Sepolia watcher with two confirmations",
  "Live status over Server-Sent Events",
  "Double entry ledger, receipts and audit events",
  "Merchant dashboard with filters and totals",
];

const MOCKED = [
  "Naira payout sits behind a provider interface and settles to a mock",
  "The live rate source falls back to a fixed rate",
  "Merchant onboarding and KYC are manual for the demo",
  "Multi-chain support and native apps are deferred",
  "KYC and production compliance are out of scope",
  "No real funds move, this is a testnet",
];

export function LandingPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <SiteNav />

      <div className="hero-shell" id="top">
        <Mesh />
        <section className="hero">
          <div className="wrap">
            <div className="hero__inner">
              <div className="hero__copy">
                <span className="hero__eyebrow">
                  <i className="hero__eyebrow-dot" aria-hidden="true" />
                  Running on Base Sepolia testnet
                </span>

                <h1 className="hero__title">Oya, pay.</h1>

                <p className="hero__lead">
                  Accept USDT and USDC at your shop. Your customer scans a QR code
                  and pays from any wallet. You get a{" "}
                  <strong>naira receipt in seconds</strong>, without ever touching
                  crypto.
                </p>

                <div className="hero__actions">
                  <a className="btn btn--primary btn--lg" href="#start">
                    Create a payment
                    <ArrowRightIcon size={16} />
                  </a>
                  <a className="btn btn--secondary btn--lg" href="#how">
                    See how it works
                  </a>
                </div>

                <p className="hero__note">
                  Rate locked for 60 seconds. Two confirmations. No keys held.
                </p>
              </div>

              <figure className="hero__visual">
                <PaymentPreview />
                <figcaption className="sr-only">
                  A live preview of an Oya payment request for ₦8,500 that moves
                  from awaiting payment to confirming to paid.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
      </div>

      <section className="stats" aria-label="How Oya works in numbers">
        <div className="wrap">
          <div className="stats__grid">
            <div className="stat">
              <div className="stat__value">60 seconds</div>
              <p className="stat__label">Rate locked when the request is created</p>
            </div>
            <div className="stat">
              <div className="stat__value">2 confirmations</div>
              <p className="stat__label">Before a payment counts as paid</p>
            </div>
            <div className="stat">
              <div className="stat__value">1 address</div>
              <p className="stat__label">Derived for every single payment</p>
            </div>
            <div className="stat">
              <div className="stat__value">0 screenshots</div>
              <p className="stat__label">Matched on chain by transaction hash</p>
            </div>
          </div>
        </div>
      </section>

      <main id="main">
        <section className="section section--soft" id="problem">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">The gap</span>
              <h2 className="section-title">
                Your customers hold dollars. Your shop runs on naira.
              </h2>
              <p className="section-lead">
                Selling stablecoin on a P2P market costs time, spread and trust.
                Oya removes the steps between the wallet and your bank account.
              </p>
            </div>

            <div className="compare">
              <div className="compare__col">
                <span className="compare__label">
                  <i aria-hidden="true" />
                  The old way
                </span>
                <ol className="compare__list">
                  {OLD_WAY.map((item, index) => (
                    <li className="compare__item" key={item}>
                      <span className="compare__num">0{index + 1}</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ol>
                <p className="compare__outcome">
                  Time lost, spread paid, trust assumed.
                </p>
              </div>

              <div className="compare__col compare__col--oya">
                <span className="compare__label">
                  <i aria-hidden="true" />
                  With Oya
                </span>
                <ol className="compare__list">
                  {OYA_WAY.map((item, index) => (
                    <li className="compare__item" key={item}>
                      <span className="compare__num">0{index + 1}</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ol>
                <p className="compare__outcome">
                  Matched on chain. Receipt issued.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">How it works</span>
              <h2 className="section-title">
                Three steps. Under ten seconds to start.
              </h2>
              <p className="section-lead">
                Creating the request is your only job. Everything after that
                happens on chain and in the ledger.
              </p>
            </div>

            <div className="steps">
              <div className="step">
                <span className="step__num">01</span>
                <h3 className="step__title">Set the price</h3>
                <p className="step__text">
                  Type the naira amount and a short description. Oya locks an
                  NGN/USD rate for 60 seconds and derives a fresh deposit address
                  for that one payment.
                </p>
              </div>
              <div className="step">
                <span className="step__num">02</span>
                <h3 className="step__title">Customer scans and pays</h3>
                <p className="step__text">
                  The QR code carries the network, token, address and exact
                  amount. They can also open the payment link. No account, no app
                  download.
                </p>
              </div>
              <div className="step">
                <span className="step__num">03</span>
                <h3 className="step__title">You get a receipt</h3>
                <p className="step__text">
                  Oya detects the transfer, waits for two confirmations and marks
                  the payment paid. A receipt is issued and the payout is queued.
                </p>
              </div>
            </div>

            <div className="flow">
              <span className="flow__label">The payment lifecycle</span>
              <div className="flow__row">
                {FLOW_STATES.map((state, index) => (
                  <Fragment key={state}>
                    <span className="flow__state" data-current={state === "Paid"}>
                      {state}
                    </span>
                    {index < FLOW_STATES.length - 1 ? (
                      <span className="flow__arrow" aria-hidden="true">
                        →
                      </span>
                    ) : null}
                  </Fragment>
                ))}
              </div>
              <div className="flow__branches">
                <span className="flow__branch-label">Handled separately</span>
                {FLOW_BRANCHES.map((branch) => (
                  <span key={branch} className="flow__branch">
                    {branch}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="section section--soft" id="merchants">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Merchant dashboard</span>
              <h2 className="section-title">Every payment, matched on chain.</h2>
              <p className="section-lead">
                Amounts, statuses, transaction hashes and receipts in one list.
                No narrations to read and no alerts to trust.
              </p>
            </div>

            <DashboardMockup />
          </div>
        </section>

        <section className="section" id="edges">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Edge cases</span>
              <h2 className="section-title">
                The awkward cases are handled, not ignored.
              </h2>
              <p className="section-lead">
                Most demos stop at the happy path. Oya treats a short payment, a
                late payment and a wrong network as first class states.
              </p>
            </div>

            <div className="edge-grid">
              <div className="edge-card edge-card--cream">
                <div>
                  <span className="edge-card__icon">
                    <ArrowDownIcon size={16} />
                  </span>
                  <h3 className="edge-card__title">Underpaid</h3>
                  <p className="edge-card__text">
                    The page shows the shortfall and a top up amount. The merchant
                    is notified and the payment stays open instead of quietly
                    failing.
                  </p>
                </div>
                <div className="shortfall">
                  <div className="shortfall__row">
                    <span>Required</span>
                    <b>₦8,500.00</b>
                  </div>
                  <div className="shortfall__row">
                    <span>Received</span>
                    <b>₦6,000.00</b>
                  </div>
                  <div className="shortfall__row shortfall__row--total">
                    <span>Shortfall</span>
                    <b>₦2,500.00</b>
                  </div>
                  <span className="shortfall__action">Top up ₦2,500</span>
                </div>
              </div>

              <div className="edge-card">
                <span className="edge-card__icon">
                  <ArrowUpIcon size={16} />
                </span>
                <h3 className="edge-card__title">Overpaid</h3>
                <p className="edge-card__text">
                  The excess is recorded in the ledger as refundable, so the
                  balance always explains itself.
                </p>
              </div>

              <div className="edge-card">
                <span className="edge-card__icon">
                  <ClockIcon size={16} />
                </span>
                <h3 className="edge-card__title">Rate expired</h3>
                <p className="edge-card__text">
                  Paid after the 60 second lock? Oya re-prices inside a tolerance,
                  or flags it for refund.
                </p>
              </div>

              <div className="edge-card">
                <span className="edge-card__icon">
                  <NetworkIcon size={16} />
                </span>
                <h3 className="edge-card__title">Wrong network</h3>
                <p className="edge-card__text">
                  A transfer on an unsupported chain is caught and flagged for
                  manual recovery. It is never credited silently.
                </p>
              </div>

              <div className="edge-card">
                <span className="edge-card__icon">
                  <RefreshIcon size={16} />
                </span>
                <h3 className="edge-card__title">Watcher downtime</h3>
                <p className="edge-card__text">
                  The worker resumes from a stored block cursor and backfills
                  every block it missed.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--cream" id="receipts">
          <div className="wrap">
            <div className="receipt-grid">
              <div>
                <div className="section-head">
                  <span className="eyebrow">Receipts</span>
                  <h2 className="section-title">
                    Proof before your customer closes the tab.
                  </h2>
                  <p className="section-lead">
                    Every paid payment produces a receipt with the merchant, the
                    naira amount, the token amount, the rate used, the transaction
                    hash and a timestamp.
                  </p>
                </div>

                <ul className="check-list">
                  <li>
                    <CheckIcon size={16} />
                    Issued automatically the moment a payment is confirmed
                  </li>
                  <li>
                    <CheckIcon size={16} />
                    Amounts stored as integers and decimal strings, never floats
                  </li>
                  <li>
                    <CheckIcon size={16} />
                    Every status change logged with a timestamp and a reason
                  </li>
                </ul>
              </div>

              <ReceiptCard />
            </div>
          </div>
        </section>

        <section className="section" id="scope">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Honest scope</span>
              <h2 className="section-title">What is real in this build.</h2>
              <p className="section-lead">
                Oya is a hackathon MVP on a testnet. Here is exactly what works
                today and what is simulated for the demo.
              </p>
            </div>

            <div className="scope">
              <div className="scope__card">
                <div className="scope__head">
                  <h3 className="scope__title">Working today</h3>
                  <span className="pill-tag">Shipped</span>
                </div>
                <ul className="scope__list">
                  {REAL_TODAY.map((item) => (
                    <li className="scope__item scope__item--real" key={item}>
                      <CheckIcon size={15} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="scope__card scope__card--mocked">
                <div className="scope__head">
                  <h3 className="scope__title">Simulated for the demo</h3>
                  <span className="pill-tag pill-tag--muted">Mocked</span>
                </div>
                <ul className="scope__list">
                  {MOCKED.map((item) => (
                    <li className="scope__item scope__item--mocked" key={item}>
                      <MinusIcon size={15} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--dark on-dark" id="developers">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">For developers</span>
              <h2 className="section-title">
                Built like infrastructure, not a checkout widget.
              </h2>
              <p className="section-lead">
                A typed API, an isolated chain adapter and one state machine for
                every money transition. Swap the mock payout provider for a
                licensed partner without touching payment logic.
              </p>
            </div>

            <div className="dev">
              <div>
                <div className="spec">
                  <h3 className="spec__title">Chain adapter</h3>
                  <p className="spec__text">
                    Base Sepolia today. The interface stays chain agnostic, so a
                    new network is an adapter, not a rewrite.
                  </p>
                </div>
                <div className="spec">
                  <h3 className="spec__title">Money as strings</h3>
                  <p className="spec__text">
                    Naira is stored in kobo and tokens in base units. No floating
                    point anywhere in the ledger.
                  </p>
                </div>
                <div className="spec">
                  <h3 className="spec__title">Idempotent by default</h3>
                  <p className="spec__text">
                    Unique transaction hashes, safe retries and a stored block
                    cursor for backfills after downtime.
                  </p>
                </div>
              </div>

              <CodePanel />
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Questions</span>
              <h2 className="section-title">
                The things a merchant should ask.
              </h2>
              <p className="section-lead">
                Straight answers before you point a customer at a QR code.
              </p>
            </div>
            <Faq />
          </div>
        </section>

        <section className="cta-section" id="start">
          <Mesh full />
          <div className="wrap">
            <div className="cta-card">
              <h2 className="cta-card__title">Oya, pay.</h2>
              <p className="cta-card__lead">
                One payment, from QR code to naira receipt, in under a minute.
                The MVP is live on Base Sepolia.
              </p>
              <div className="cta-card__actions">
                <a className="btn btn--primary btn--lg" href="#how">
                  Walk through a payment
                  <ArrowRightIcon size={16} />
                </a>
                <a className="btn btn--secondary btn--lg" href="#faq">
                  Read the FAQ
                </a>
              </div>
              <p className="cta-card__note">
                No real funds move. Payouts are mocked behind a provider
                interface.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
