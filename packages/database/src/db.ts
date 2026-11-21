import { drizzle } from "drizzle-orm/node-postgres";
import "dotenv/config";
import { relations } from "./db/relations";
const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? process.env.NEON_DATABSE_URL;

if (!connectionString)
  throw new Error("Missing DATABASE_URL");

export const db = drizzle(connectionString, { relations: relations });
export type Database = typeof db;
