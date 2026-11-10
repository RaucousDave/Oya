import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Hex } from "./types";
import { getAddress, keccak256 } from "viem";

// creates a unique address for each merchant, to avoid collision when looking up transactions
export function deriveDepositAddress(xpub: string, index: number): Hex {
  // checks if the index is not a whole number, if it's less than zero and if it's a hardened value
  if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error("Index must be an integer");
  }

  //   creating a node from the extended public key
  const node = HDKey.fromExtendedKey(xpub);
  //   checks if node is a private key rather than a public one
  if (node.privateKey) {
    throw new Error("Refusal to collect extended private key");
  }

  //   derives the address
  const child = node.deriveChild(0).deriveChild(index);
  if (!child.publicKey) {
    throw new Error("derivation failed");
  }

  //   converts the public key to an ethereum address
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey).toBytes(
    false,
  );

  const hash = keccak256(uncompressed.slice(1));
  return getAddress(`0x${hash.slice(-40)}`);
}
