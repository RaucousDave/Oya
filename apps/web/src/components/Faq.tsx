import { PlusIcon } from "./Icons";

const QUESTIONS = [
  {
    question: "Do I need a crypto wallet as a merchant?",
    answer:
      "No. You enter a naira price and receive naira. The wallet belongs to your customer, and Oya never asks you to hold or manage one.",
  },
  {
    question: "Which tokens and networks work today?",
    answer:
      "USDT and USDC on Base Sepolia for the MVP. The chain adapter is isolated, so adding a network does not change the payment state machine.",
  },
  {
    question: "What happens if the rate moves before payment?",
    answer:
      "The rate is locked for 60 seconds. If a transfer arrives late, Oya re-prices inside a tolerance or flags the payment for refund.",
  },
  {
    question: "How do naira payouts work in production?",
    answer:
      "Through a licensed off-ramp partner. The MVP payout provider is a mock that writes a ledger entry and marks the payment settled.",
  },
  {
    question: "Is this handling real money?",
    answer:
      "Not yet. This is a testnet build. No real funds move, and no customer keys are held on the server.",
  },
];

export function Faq() {
  return (
    <div className="faq">
      {QUESTIONS.map((item) => (
        <details key={item.question}>
          <summary>
            {item.question}
            <PlusIcon size={18} className="faq__icon" />
          </summary>
          <p className="faq__answer">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
