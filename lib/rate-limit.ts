/**
 * Fixed-window rate limiting, in process memory.
 *
 * SCOPE, HONESTLY: this is per server instance, not global. On a serverless
 * platform each instance keeps its own counters, so the effective ceiling is
 * the limit multiplied by however many instances are warm, and a counter
 * vanishes when an instance is recycled.
 *
 * That is still worth having for what it is for — stopping ONE client
 * hammering an endpoint in a loop, which is the realistic way an admin
 * session burns storage: a retry that never backs off, or a script left
 * running. It is NOT a defence against a distributed attacker, and it should
 * not be relied on as a spend cap. Durable limiting needs shared state
 * (Redis, or Postgres with a counter row) and is worth adding only when the
 * traffic justifies it.
 *
 * A fixed window rather than a sliding one or a token bucket: it is the
 * cheapest thing that answers "has this session done too much lately", and
 * its one flaw — up to 2x the limit across a window boundary — does not
 * matter when the limit exists to stop runaway loops rather than to meter
 * fairly.
 */

interface Window {
  count: number;
  /** Epoch ms at which this window expires and the count resets. */
  resetAt: number;
}

/**
 * Survives hot reload in development, which re-evaluates modules on every
 * edit and would otherwise hand out a fresh empty map each time.
 */
const globalForLimit = globalThis as unknown as {
  __cicoRateLimit?: Map<string, Window>;
};

const windows: Map<string, Window> =
  globalForLimit.__cicoRateLimit ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForLimit.__cicoRateLimit = windows;
}

/** Entries are only removed lazily; this stops the map growing without end. */
function prune(now: number) {
  if (windows.size < 256) return;
  for (const [key, w] of windows) {
    if (w.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * Count one request against `key`.
 *
 * Call this ONLY for requests that should consume quota. In particular, call
 * it after authentication — otherwise an unauthenticated flood exhausts the
 * quota of whoever shares its key, turning the limiter into the denial of
 * service it exists to prevent.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count };
}

/** Test helper — drops all counters. Not used by application code. */
export function resetRateLimits() {
  windows.clear();
}
