import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.NEON_DATABASE_URL;
if (!connectionString)
  throw new Error(`Cannot read connection string: ${connectionString}`);

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
