import { describe, it, expect } from "vitest";
import { deriveDepositAddress } from "../derive.js";

// Standard BIP-32 test vector xpub (public key only)
const TEST_XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

describe("deriveDepositAddress", () => {
  it("deterministically derives an Ethereum address for index 0", () => {
    const address1 = deriveDepositAddress(TEST_XPUB, 0);
    const address2 = deriveDepositAddress(TEST_XPUB, 0);

    // Must be valid 0x address format
    expect(address1).toMatch(/^0x[a-fA-F0-9]{40}$/);
    // Must be identical every run (deterministic)
    expect(address1).toBe(address2);
  });

  it("derives different addresses for different indices", () => {
    const addr0 = deriveDepositAddress(TEST_XPUB, 0);
    const addr1 = deriveDepositAddress(TEST_XPUB, 1);
    const addr2 = deriveDepositAddress(TEST_XPUB, 2);

    expect(addr0).not.toBe(addr1);
    expect(addr1).not.toBe(addr2);
  });

  it("throws if index is negative or not an integer", () => {
    expect(() => deriveDepositAddress(TEST_XPUB, -1)).toThrow("Index must be an integer");
    expect(() => deriveDepositAddress(TEST_XPUB, 1.5)).toThrow("Index must be an integer");
  });

  it("rejects an extended private key (xprv) to prevent accidental key leaks", () => {
    const TEST_XPRV =
      "xprv9s21ZrQH143K3D8TXfvAJgHVfTEeQNW5Ys9wZtnUZkqPzFzSjbEJrWC1vZ4GnXCvR7rQL2UFX3RSuYeU9MrERm1XBvACow7c36vnz5iYyj2";

    expect(() => deriveDepositAddress(TEST_XPRV, 0)).toThrow("Refusal to collect extended private key");
  });
});
