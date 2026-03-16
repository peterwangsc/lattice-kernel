import type { IncomingMessage, ServerResponse } from "node:http";

export interface AuthConfig {
  /** API keys that are allowed access. If empty, auth is disabled. */
  apiKeys: string[];
  /** Paths that skip authentication. */
  publicPaths?: string[];
}

/**
 * API key authentication middleware.
 * Expects `Authorization: Bearer <key>` or `X-API-Key: <key>` header.
 * Returns true if request was rejected (caller should stop processing).
 */
export function apiKeyAuth(config: AuthConfig) {
  const keySet = new Set(config.apiKeys);
  const publicPaths = new Set(config.publicPaths ?? ["/health"]);

  return function checkAuth(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    // Skip auth if no keys configured (disabled)
    if (keySet.size === 0) return false;

    // Skip auth for public paths
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (publicPaths.has(url.pathname)) return false;

    // Check Authorization: Bearer <key>
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const key = authHeader.slice(7);
      if (keySet.has(key)) return false;
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers["x-api-key"];
    if (typeof apiKeyHeader === "string" && keySet.has(apiKeyHeader)) {
      return false;
    }

    // Unauthorized
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized: valid API key required" }));
    return true;
  };
}
