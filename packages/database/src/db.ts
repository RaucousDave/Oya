import { drizzle } from "drizzle-orm/neon-serverless";
import "dotenv/config";
import { relations } from "./db/relations";
const connectionString = process.env.NEON_DATABSE_URL;

if (!connectionString)
  throw new Error("Missing connection string of postgres db`");

export const db = drizzle(connectionString, { relations: relations });
export type Database = typeof db;
