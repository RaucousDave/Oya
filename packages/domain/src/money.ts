export function koboToNaira(kobo: bigint): string {
  const isNegative = kobo < 0n;
  const abs = isNegative ? -kobo : kobo;
  const wholeNaira = abs / 100n;
  const paddedKobo = (abs % 100n).toString().padStart(2, "0");

  const naira = `${isNegative ? "-" : ""}${wholeNaira}.${paddedKobo}`;
  return naira;
}

export function nairaToKobo(naira: string): bigint {
  const trimmed = naira.trim();
  const isNegative = trimmed.startsWith("-");
  const clean = isNegative ? trimmed.slice(1) : trimmed;

  const currencySplit = clean.split(".");

  if (currencySplit.length > 2 || currencySplit[0] === "") {
    throw new Error("Invalid currency format");
  }

  const nairaHalf = currencySplit[0];
  let koboHalf = currencySplit[1] ?? "00";

  if (koboHalf.length === 1) {
    koboHalf = koboHalf.padEnd(2, "0");
  } else if (koboHalf.length > 2) {
    throw new Error("Invalid currency format");
  }

  const kobo = BigInt(`${nairaHalf}${koboHalf}`);
  return isNegative ? -kobo : kobo;
}

export function calculateRequiredTokenAmount(
  amountInKobo: bigint,
  rateNgnPerUsd: string,
  tokenDecimals: number,
): bigint {
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0) {
    throw new Error("Invalid token");
  }

  const rateInKobo = nairaToKobo(rateNgnPerUsd);

  if (rateInKobo <= 0n) {
    throw new Error("Rate Must be greater than 0");
  }

  if (amountInKobo <= 0n) {
    throw new Error("Amount must be greater than 0");
  }

  const scaled = amountInKobo * 10n ** BigInt(tokenDecimals);

  return (scaled + rateInKobo - 1n) / rateInKobo;
}

export interface PaymentComparison {
  status: "EXACT" | "UNDERPAID" | "OVERPAID";
  difference: bigint;
}

export function comparePaymentAmounts(
  requiredAmount: bigint,
  receivedAmount: bigint,
): PaymentComparison {
  if (receivedAmount > requiredAmount) {
    return {
      status: "OVERPAID",
      difference: receivedAmount - requiredAmount,
    };
  }
  if (receivedAmount < requiredAmount) {
    return {
      status: "UNDERPAID",
      difference: requiredAmount - receivedAmount,
    };
  }
  return {
    status: "EXACT",
    difference: 0n,
  };
}
