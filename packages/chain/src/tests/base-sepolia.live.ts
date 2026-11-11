import { formatUnits } from "viem";
import { createBaseSepoliaAdapter } from "../adapter.js";
import { loadChainEnv } from "../env.js";

const env = loadChainEnv();
const adapter = createBaseSepoliaAdapter();

const latest = await adapter.getLatestBlock();
const fromBlock = latest > 50n ? latest - 50n : 0n;
const transfers = await adapter.getTransfersInRange(fromBlock, latest);

console.log(`Latest block: ${latest}`);
console.log(
  `Transfer events from block ${fromBlock} to ${latest}: ${transfers.length}`,
);

for (const transfer of transfers) {
  const amount = formatUnits(transfer.amount, env.TOKEN_DECIMALS);
  console.log(
    `${transfer.txHash} -> ${transfer.to} amount ${amount} at block ${transfer.blockNumber}`,
  );
}
