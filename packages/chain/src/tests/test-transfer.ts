import { createBaseSepoliaAdapter } from "../adapter";
import { Hex } from "../types";

const tokenAddress = process.env.DEMO_TOKEN_ADDRESS as Hex | undefined;
if (!tokenAddress) throw new Error("Token address doesn't exist");
const client = createBaseSepoliaAdapter({ tokenAddress });

const latest = await client.getLatestBlock();
const transfers = await client.getTransfersInRange(latest - 50n, latest);

for (const t of transfers) {
  console.log(t.hash, t.from, "->", t.to, t.value, "at", t.blockNumber);
}
