import { createBaseSepoliaAdapter } from "../adapter";
import "dotenv/config";
import { Hex } from "../types";

const tokenAddress = process.env.DEMO_TOKEN_ADDRESS as Hex | undefined;
if (!tokenAddress) throw new Error("Invalid token address");
const chain = createBaseSepoliaAdapter({ tokenAddress });
const latest = await chain.getLatestBlock();

console.log("10 blocks old...", await chain.getConfirmations(latest - 10n));
console.log("20 blocks old...", await chain.getConfirmations(latest + 20n));
