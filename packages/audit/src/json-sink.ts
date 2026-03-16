import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter } from "./types.js";

export type LogWriter = (line: string) => void;

export interface JsonAuditSinkOptions {
  writer?: LogWriter;
}

/**
 * Audit sink that writes structured JSON lines to a log writer.
 * Suitable for production observability — pipe to stdout, file, or
 * a log aggregation service.
 *
 * Does not support querying (returns empty results). Pair with a
 * MemoryAuditSink via CompositeAuditSink if you need both logging
 * and querying.
 */
export function createJsonAuditSink(
  options: JsonAuditSinkOptions = {},
): AuditSink {
  const writer = options.writer ?? defaultWriter;

  return {
    async emit(event: AuditEvent): Promise<void> {
      const line = JSON.stringify({
        level: event.error ? "error" : "info",
        ...event,
      });
      writer(line);
    },

    async query(_filter: AuditQueryFilter): Promise<AuditEvent[]> {
      // JSON sink is write-only; use CompositeAuditSink with
      // MemoryAuditSink for query support
      return [];
    },

    async flush(): Promise<void> {
      // no-op — writer handles flushing
    },
  };
}

function defaultWriter(line: string): void {
  // eslint-disable-next-line no-console
  process.stdout.write(line + "\n");
}
