import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter } from "./types.js";

/**
 * Fans out audit events to multiple sinks. Queries are served from the
 * first sink (primary). Useful for writing to both an in-memory store
 * and a persistent backend simultaneously.
 */
export function createCompositeAuditSink(sinks: AuditSink[]): AuditSink {
  if (sinks.length === 0) {
    throw new Error("CompositeAuditSink requires at least one sink");
  }

  return {
    async emit(event: AuditEvent): Promise<void> {
      await Promise.all(sinks.map((s) => s.emit(event)));
    },

    async query(filter: AuditQueryFilter): Promise<AuditEvent[]> {
      return sinks[0]!.query(filter);
    },

    async flush(): Promise<void> {
      await Promise.all(sinks.map((s) => s.flush?.()));
    },
  };
}
