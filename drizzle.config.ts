import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local for the app, but drizzle-kit runs outside Next and
// only reads .env by default — so load it explicitly here.
config({ path: ".env.local", quiet: true });

/**
 * Migrations run against the DIRECT connection, never the pooled one:
 * PgBouncer in transaction mode cannot execute some DDL statements.
 *
 * DIRECT_URL is that connection. It falls back to DATABASE_URL so an
 * environment that never had a pooler in front of it — local Postgres, or a
 * deployment predating this split — keeps working with one variable set.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. Copy .env.example to " +
      ".env.local and fill it in.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
