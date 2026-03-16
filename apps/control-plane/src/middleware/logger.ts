import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string;
  timestamp: string;
}

export type LogHandler = (log: RequestLog) => void;

function defaultLogHandler(log: RequestLog): void {
  const line = JSON.stringify(log);
  process.stdout.write(line + "\n");
}

/**
 * Request logging middleware. Wraps res.end to capture status and timing.
 * Always returns false (never handles the request — just observes).
 */
export function requestLogger(handler: LogHandler = defaultLogHandler) {
  return function logRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    const start = Date.now();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket?.remoteAddress ??
      "unknown";

    const originalEnd = res.end;
    // Monkey-patch res.end to capture timing
    res.end = function (this: ServerResponse, ...args: Parameters<ServerResponse["end"]>) {
      handler({
        method: req.method ?? "GET",
        path: url.pathname,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip,
        timestamp: new Date().toISOString(),
      });
      return originalEnd.apply(this, args);
    } as ServerResponse["end"];

    return false; // Never handles — always continue to next middleware
  };
}
