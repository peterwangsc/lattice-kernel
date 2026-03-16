import type { IncomingMessage, ServerResponse } from "node:http";

export interface CorsConfig {
  allowOrigin?: string;
  allowMethods?: string;
  allowHeaders?: string;
  maxAge?: number;
}

const DEFAULTS: Required<CorsConfig> = {
  allowOrigin: "*",
  allowMethods: "GET, POST, PUT, DELETE, OPTIONS",
  allowHeaders: "Content-Type, Authorization",
  maxAge: 86400,
};

export function cors(config: CorsConfig = {}) {
  const opts = { ...DEFAULTS, ...config };

  return function applyCors(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    res.setHeader("Access-Control-Allow-Origin", opts.allowOrigin);
    res.setHeader("Access-Control-Allow-Methods", opts.allowMethods);
    res.setHeader("Access-Control-Allow-Headers", opts.allowHeaders);
    res.setHeader("Access-Control-Max-Age", String(opts.maxAge));

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true; // Request handled, skip routing
    }

    return false; // Continue to routing
  };
}
