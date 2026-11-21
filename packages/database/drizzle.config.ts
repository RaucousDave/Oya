import { defineConfig } from "drizzle-kit";
import {connectionString} from "./src/db"

if (!connectionString) throw new Error("Something went wrong")

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
