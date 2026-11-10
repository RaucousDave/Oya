// Note: this script should only be run once
import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

// generates mnemonic for xpub
const mnemonic = process.env.OYA_MNEMONIC ?? generateMnemonic(wordlist);

// creates the xpub - extended public key
const account = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(
  "m/44'/60'/0",
);

console.log("mnemonic from script: ", mnemonic);
console.log("xpub for application: ", account.publicExtendedKey);
