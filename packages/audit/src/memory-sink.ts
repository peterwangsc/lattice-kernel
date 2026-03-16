import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter } from "./types.js";

export interface MemoryAuditSinkOptions {
  maxEvents?: number;
}

export function createMemoryAuditSink(
  options: MemoryAuditSinkOptions = {},
): AuditSink {
  const { maxEvents = 10_000 } = options;
  const events: AuditEvent[] = [];

  return {
    async emit(event: AuditEvent): Promise<void> {
      events.push(event);
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
    },

    async query(filter: AuditQueryFilter): Promise<AuditEvent[]> {
      let results = events;

      if (filter.requestId) {
        results = results.filter((e) => e.requestId === filter.requestId);
      }
      if (filter.type) {
        results = results.filter((e) => e.type === filter.type);
      }
      if (filter.actor) {
        results = results.filter((e) => e.actor === filter.actor);
      }
      if (filter.scope) {
        results = results.filter((e) => scopeMatches(e.scope, filter.scope!));
      }
      if (filter.since) {
        results = results.filter((e) => e.timestamp >= filter.since!);
      }
      if (filter.until) {
        results = results.filter((e) => e.timestamp <= filter.until!);
      }

      const limit = filter.limit ?? results.length;
      return results.slice(-limit);
    },

    async flush(): Promise<void> {
      // no-op for memory sink
    },
  };
}

function scopeMatches(
  eventScope: Record<string, unknown>,
  filterScope: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(filterScope)) {
    if (value !== undefined && eventScope[key] !== value) {
      return false;
    }
  }
  return true;
}
