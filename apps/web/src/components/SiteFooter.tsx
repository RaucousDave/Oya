import { Wordmark } from "./Logo";

const GROUPS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Merchant dashboard", href: "#merchants" },
      { label: "Receipts", href: "#receipts" },
      { label: "Payment states", href: "#how" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Payment API", href: "#developers" },
      { label: "Realtime updates", href: "#developers" },
      { label: "Ledger and payouts", href: "#receipts" },
      { label: "Chain adapter", href: "#developers" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "The build", href: "#scope" },
      { label: "FAQ", href: "#faq" },
      { label: "Contact", href: "#start" },
      { label: "Privacy", href: "#start" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div className="footer__brand">
            <Wordmark />
            <p>Stablecoin payments for Nigerian merchants. Dollars in, naira out.</p>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title} className="footer__col">
              <h3 className="footer__col-title">{group.title}</h3>
              <ul>
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer__bottom">
          <span>© 2026 Oya. Built for the Cleva hackathon.</span>
          <span>
            <i className="footer__dot" aria-hidden="true" />
            Base Sepolia testnet. No real funds move.
          </span>
        </div>
      </div>
    </footer>
  );
}
