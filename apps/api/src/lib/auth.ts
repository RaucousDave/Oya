import { betterAuth } from "better-auth";
import { db, schema } from "@oya/database";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),

  emailAndPassword: {
    enabled: true,
  },
});
