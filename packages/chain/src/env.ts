import { z } from "zod";
import type { Hex } from "./types.js";

const tokenAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "TOKEN_ADDRESS must be a 20-byte hex address")
  .transform((value) => value as Hex);

export const chainEnvSchema = z.object({
  RPC_URL: z.string().url(),
  TOKEN_ADDRESS: tokenAddressSchema,
  TOKEN_DECIMALS: z.coerce.number().int().nonnegative(),
});

export type ChainEnv = z.infer<typeof chainEnvSchema>;

export function loadChainEnv(env: NodeJS.ProcessEnv = process.env): ChainEnv {
  const result = chainEnvSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid chain environment: ${details}`);
  }

  return result.data;
}
