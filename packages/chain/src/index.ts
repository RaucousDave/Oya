import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

function createBaseSepoliaClient(rpcUrl?: string) {
  const url =
    rpcUrl ??
    process.env.RPC_URL ??
    baseSepolia.rpcUrls.default.http[0];

  return createPublicClient({
    chain: baseSepolia,
    transport: http(url),
  });
}

export { createBaseSepoliaClient };
export * from "./types";
export * from "./env";
export * from "./derive";
export * from "./adapter";
