import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

export function createBaseSepoliaClient(rpcUrl?: string) {
  const url =
    rpcUrl ??
    process.env.BASE_SEPOLIA_URL ??
    baseSepolia.rpcUrls.default.http[0];

  return createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
}
