import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

type TokenKind = "k" | "s" | "c" | "n" | "p" | "t";

type Token = readonly [kind: TokenKind, text: string];

const LINES: Token[][] = [
  [["c", "// Create a payment request in naira"]],
  [
    ["k", "const"],
    ["t", " payment = "],
    ["k", "await"],
    ["t", " oya.payments.create({"],
  ],
  [["t", "  amountNgn: "], ["s", '"8500.00"'], ["t", ","]],
  [["t", "  description: "], ["s", '"Ankara fabric, 6 yards"'], ["t", ","]],
  [["t", "});"]],
  [["t", ""]],
  [
    ["t", "payment.depositAddress;"],
    ["c", "  // 0x7f3a...c21b"],
  ],
  [["t", "payment.amountToken;"], ["c", '     // "5.62"']],
  [["t", "payment.rateExpiresAt;"], ["c", "   // 60 seconds"]],
  [["t", ""]],
  [["c", "// AWAITING_PAYMENT -> CONFIRMING -> PAID"]],
  [
    ["k", "for"],
    ["t", " "],
    ["k", "await"],
    ["t", " ("],
    ["k", "const"],
    ["t", " event of oya.payments.events(payment.id)) {"],
  ],
  [["t", "  render(event.status);"]],
  [["t", "}"]],
];

const PLAIN_TEXT = LINES.map((line) => line.map(([, text]) => text).join("")).join(
  "\n",
);

export function CodePanel() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PLAIN_TEXT);
    } catch {
      // Clipboard can be unavailable outside secure contexts.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="code">
      <div className="code__bar">
        <span className="code__file">create-payment.ts</span>
        <button
          type="button"
          className="code__copy"
          data-copied={copied}
          onClick={copy}
          aria-label="Copy code example"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code__pre">
        <code>
          {LINES.map((line, lineIndex) => (
            <span key={lineIndex}>
              {line.map(([kind, text], tokenIndex) => (
                <span key={tokenIndex} className={kind === "t" ? undefined : `tok-${kind}`}>
                  {text}
                </span>
              ))}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
