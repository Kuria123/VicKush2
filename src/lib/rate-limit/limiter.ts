/**
 * Rate limiting.
 *
 * A fixed-capacity token bucket per key, refilling continuously. Chosen over a
 * fixed window because a window lets someone spend a full allowance at 11:59
 * and another at 12:00 — twice the intended rate, at the worst possible
 * moment. A bucket smooths that out and still allows a short burst, which is
 * what a person clicking twice actually looks like.
 *
 * **This is in-process memory.** One server instance, one set of buckets. It
 * is genuinely effective against the thing it is here for — a signed-in user
 * looping a request that costs money upstream — and genuinely ineffective
 * across a multi-instance deployment, where each instance would grant the full
 * allowance independently. That is stated rather than left for someone to
 * discover: moving to shared storage is a deployment decision, and pretending
 * this covers it would be the wrong kind of reassurance.
 */

export interface RateLimitRule {
  /** Requests allowed in a burst. */
  capacity: number;
  /** Sustained rate, in requests per minute. */
  perMinute: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole tokens left after this request. */
  remaining: number;
  /** Seconds until one more token is available. Zero when allowed. */
  retryAfterSeconds: number;
  limit: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/**
 * The limits, stated in one place.
 *
 * The AI routes are the tight ones: each request costs real money upstream,
 * and a loop is indistinguishable from enthusiasm until the bill arrives.
 * Writing a scan is looser — it is one deliberate action per scan — but still
 * bounded, because an unbounded write endpoint is a way to fill a disk.
 */
export const RATE_LIMITS = {
  'ai-explain': { capacity: 5, perMinute: 10 },
  'ai-mechanic': { capacity: 8, perMinute: 20 },
  'save-session': { capacity: 10, perMinute: 30 },
  // Reads are cheap, but a client polling a list still costs a query each
  // time. Loose enough that a mobile app refreshing a screen never notices.
  read: { capacity: 60, perMinute: 120 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const buckets = new Map<string, Bucket>();

/**
 * Discards buckets nobody has touched recently.
 *
 * Without this the map grows once per user per route and never shrinks, which
 * is a slow leak rather than a dramatic one — the kind that survives to
 * production because nothing fails until it does.
 */
const IDLE_EVICTION_MS = 15 * 60_000;

function evictIdle(now: number): void {
  if (buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefillMs > IDLE_EVICTION_MS) buckets.delete(key);
  }
}

export function checkRateLimit(
  name: RateLimitName,
  identity: string,
  now: number = Date.now(),
): RateLimitDecision {
  const rule = RATE_LIMITS[name];
  const key = `${name}:${identity}`;

  evictIdle(now);

  const bucket = buckets.get(key) ?? { tokens: rule.capacity, lastRefillMs: now };

  // Refill for the time elapsed, capped at capacity.
  const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
  const refilled = (elapsedMs / 60_000) * rule.perMinute;
  const tokens = Math.min(rule.capacity, bucket.tokens + refilled);

  if (tokens < 1) {
    // Store the refill so the clock keeps advancing while blocked.
    buckets.set(key, { tokens, lastRefillMs: now });

    const secondsPerToken = 60 / rule.perMinute;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) * secondsPerToken)),
      limit: rule.capacity,
    };
  }

  buckets.set(key, { tokens: tokens - 1, lastRefillMs: now });

  return {
    allowed: true,
    remaining: Math.floor(tokens - 1),
    retryAfterSeconds: 0,
    limit: rule.capacity,
  };
}

/** For tests, and for a deployment that wants a clean slate on boot. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * The standard headers for a refused request.
 *
 * `Retry-After` is not optional politeness: without it a client has no way to
 * back off correctly and will usually retry immediately, which is the
 * behaviour the limit exists to prevent.
 */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(decision.limit),
    'RateLimit-Remaining': String(decision.remaining),
  };

  if (!decision.allowed) {
    headers['Retry-After'] = String(decision.retryAfterSeconds);
  }

  return headers;
}
