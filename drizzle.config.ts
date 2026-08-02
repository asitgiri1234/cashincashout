import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local for the app, but drizzle-kit runs outside Next and
// only reads .env by default — so load it explicitly here.
config({ path: ".env.local", quiet: true });

/**
 * Migrations run against the DIRECT connection (port 5432), never the pooled
 * one: PgBouncer in transaction mode cannot execute some DDL statements.
 */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
