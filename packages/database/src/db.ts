import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
import { relations } from "./db/relations";
import { fileURLToPath } from "node:url";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({path: path.resolve(__dirname, "../../../.env")})
const connectionString = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? process.env.NEON_DATABSE_URL;

if (!connectionString)
  throw new Error("Missing DATABASE_URL");

export const db = drizzle(connectionString, { relations: relations });
export type Database = typeof db;
