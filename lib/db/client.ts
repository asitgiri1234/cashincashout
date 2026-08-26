import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * The database client itself.
 *
 * Deliberately NOT guarded with `server-only`, so CLI tooling — seeds,
 * migrations, one-off scripts — can import it under plain Node. Application
 * code should import from `lib/db` instead, which re-exports this behind that
 * guard so an accidental import from a Client Component fails at build time.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

/**
 * Whether DATABASE_URL points at a transaction-mode connection pooler
 * (PgBouncer, as fronted by Supabase's 6543 endpoint).
 *
 * An EXPLICIT flag, not a guess from the port or hostname: the port a pooler
 * listens on is a deployment detail, self-hosted PgBouncer commonly runs on
 * 5432, and a string match would silently disable prepared statements on a
 * direct connection that merely looked pooled — or, worse, leave them enabled
 * against a real pooler, where they fail only under load once connections
 * start being reused across transactions.
 */
const pooled = process.env.DB_POOLED === "true";

/**
 * Next's hot reload re-evaluates modules on every edit. Caching the client on
 * globalThis stops that opening a fresh pool each time and exhausting
 * Postgres' connection limit.
 */
const globalForDb = globalThis as unknown as {
  __cicoSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__cicoSql ??
  postgres(url, {
    // PgBouncer in transaction mode does not support prepared statements —
    // a statement prepared on one connection is not there when the next
    // transaction lands on another. On a direct connection (local Postgres,
    // or the 5432 endpoint) they are left ON, which is the faster path.
    prepare: !pooled,
    // Serverless invocations are short-lived and numerous; a small ceiling
    // per instance keeps total connections sane.
    max: process.env.NODE_ENV === "production" ? 1 : 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__cicoSql = client;

export const db = drizzle(client, { schema });
export { client as sql, schema };
