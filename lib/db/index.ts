import "server-only";

/**
 * Application-facing database entry point.
 *
 * `server-only` turns an accidental import from a Client Component into a
 * build error, rather than a runtime leak of the connection string into the
 * browser bundle. CLI scripts cannot use this module — Node has no
 * react-server condition, so the guard throws — and should import
 * `lib/db/client` directly instead.
 */
export { db, sql, schema } from "./client";
