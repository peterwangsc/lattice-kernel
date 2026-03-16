import type { IncomingMessage, ServerResponse } from "node:http";

export interface RateLimitConfig {
  /** Max requests per window per IP. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/**
 * Simple sliding window rate limiter by client IP.
 * Returns true if request was rejected (caller should stop).
 */
export function rateLimit(config: RateLimitConfig) {
  const { maxRequests, windowMs } = config;
  const clients = new Map<string, number[]>();

  // Periodic cleanup of stale entries
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of clients) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        clients.delete(ip);
      } else {
        clients.set(ip, fresh);
      }
    }
  }, windowMs).unref();

  return function checkRateLimit(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    const now = Date.now();
    const cutoff = now - windowMs;

    let timestamps = clients.get(ip);
    if (!timestamps) {
      timestamps = [];
      clients.set(ip, timestamps);
    }

    // Prune old entries
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil(
        (timestamps[0]! + windowMs - now) / 1000,
      );
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      });
      res.end(
        JSON.stringify({
          error: "Too many requests",
          retryAfterSeconds: retryAfter,
        }),
      );
      return true;
    }

    timestamps.push(now);
    return false;
  };
}
