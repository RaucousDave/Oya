import z from "zod";
import dotenv from "dotenv";
export const configScheme = z.object({
  DATABASE_URL: z.string().url(),
  BASE_SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.base.org"),
  DEPOSIT_XPUB: z.string().startsWith("xpub"),
  DEMO_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  DEMO_TOKEN_DECIMALS: z.coerce.number().default(6),
  FIXED_NGN_USD_RATE: z.string().default("1500.00"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

dotenv.config();

export const loadConfig = () => {
  const result = configScheme.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        `${issue.path.join(".")}: ${issue.message}`;
      })
      .join(",");
    throw new Error(`invalid env variables: ${issues}`);
  }

  return result.data;
};

export type AppConfig = z.infer<typeof configScheme>;
