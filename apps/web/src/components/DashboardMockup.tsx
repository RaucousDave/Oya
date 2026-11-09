import { LogoMark } from "./Logo";

type Status = "paid" | "confirming" | "underpaid";

const ROWS: Array<{
  name: string;
  id: string;
  amount: string;
  status: Status;
  statusLabel: string;
  time: string;
  tx: string;
}> = [
  {
    name: "Ankara fabric, 6 yards",
    id: "OY-1042",
    amount: "₦8,500.00",
    status: "paid",
    statusLabel: "Paid",
    time: "2m ago",
    tx: "0x9c4e...7f21",
  },
  {
    name: "Bridal lace, 3 yards",
    id: "OY-1041",
    amount: "₦24,000.00",
    status: "confirming",
    statusLabel: "Confirming",
    time: "12s ago",
    tx: "0x2b7d...a903",
  },
  {
    name: "Delivery within Lekki",
    id: "OY-1040",
    amount: "₦3,200.00",
    status: "paid",
    statusLabel: "Paid",
    time: "18m ago",
    tx: "0x51ac...3e77",
  },
  {
    name: "Custom aso-oke",
    id: "OY-1039",
    amount: "₦42,000.00",
    status: "underpaid",
    statusLabel: "Underpaid",
    time: "34m ago",
    tx: "0x7f3a...c21b",
  },
  {
    name: "Ready-to-wear set",
    id: "OY-1038",
    amount: "₦18,500.00",
    status: "paid",
    statusLabel: "Paid",
    time: "1h ago",
    tx: "0x88de...1b42",
  },
];

const BARS = [38, 54, 44, 68, 52, 80, 96];

export function DashboardMockup() {
  return (
    <div
      className="dash on-dark"
      role="img"
      aria-label="Oya merchant dashboard showing payments, statuses, transaction hashes and totals for today and this week."
    >
      <div className="dash__shell" aria-hidden="true">
        <div className="dash__top">
          <div className="dash__brand">
            <LogoMark size={18} />
            <span>Oya</span>
            <span className="dash__brand-divider" />
            <span className="dash__brand-sub">Merchant</span>
          </div>
          <div className="dash__tabs">
            <span className="dash__tab" data-active="true">
              Payments
            </span>
            <span className="dash__tab">Receipts</span>
            <span className="dash__tab">Settings</span>
          </div>
          <div className="dash__user">
            <span className="dash__avatar">MF</span>
            <span>Mariam</span>
          </div>
        </div>

        <div className="dash__body">
          <div className="dash__heading">
            <h3 className="dash__title">Payments</h3>
            <span className="dash__new">New payment</span>
          </div>

          <div className="dash__stats">
            <div className="dash__stat">
              <span className="dash__stat-label">Today</span>
              <div className="dash__stat-row">
                <span className="dash__stat-value">₦142,500.00</span>
                <div className="dash__bars">
                  {BARS.map((height, index) => (
                    <i
                      key={index}
                      style={{ height: `${height}%` }}
                      data-today={index === BARS.length - 1}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="dash__stat">
              <span className="dash__stat-label">This week</span>
              <div className="dash__stat-row">
                <span className="dash__stat-value">₦986,200.00</span>
                <span className="dash__stat-delta">+18%</span>
              </div>
            </div>
            <div className="dash__stat">
              <span className="dash__stat-label">Awaiting payout</span>
              <div className="dash__stat-row">
                <span className="dash__stat-value">₦58,000.00</span>
              </div>
            </div>
          </div>

          <div className="dash__table-wrap">
            <table className="dash__table">
              <thead>
                <tr>
                  <th scope="col">Payment</th>
                  <th scope="col" className="is-amount">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                  <th scope="col">Transaction</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="dash__pay-name">{row.name}</span>
                      <span className="dash__pay-id">{row.id}</span>
                    </td>
                    <td className="is-amount">{row.amount}</td>
                    <td>
                      <span className="dash__status" data-state={row.status}>
                        <i />
                        {row.statusLabel}
                      </span>
                    </td>
                    <td>{row.time}</td>
                    <td className="dash__tx">{row.tx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="dash__foot">
            <span>
              <i className="dash__live" />
              Live updates over Server-Sent Events
            </span>
            <span>Base Sepolia</span>
          </div>
        </div>
      </div>
    </div>
  );
}
