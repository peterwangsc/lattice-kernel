import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter, AuditQueryResult } from "./types.js";

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

    async query(filter: AuditQueryFilter): Promise<AuditQueryResult> {
      let results: AuditEvent[] = events;

      if (filter.requestId) {
        results = results.filter((e) => e.requestId === filter.requestId);
      }
      if (filter.traceId) {
        results = results.filter(
          (e) =>
            e.requestId.includes(filter.traceId!) ||
            (e as Record<string, unknown>).traceId === filter.traceId,
        );
      }
      if (filter.type) {
        results = results.filter((e) => e.type === filter.type);
      }
      if (filter.actor) {
        results = results.filter((e) => e.actor === filter.actor);
      }
      if (filter.modelId) {
        results = results.filter((e) => e.modelId === filter.modelId);
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
      if (filter.hasError !== undefined) {
        results = results.filter((e) =>
          filter.hasError ? e.error !== undefined : e.error === undefined,
        );
      }

      const total = results.length;
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? total;
      const page = results.slice(offset, offset + limit);

      return {
        events: page,
        total,
        hasMore: offset + limit < total,
        offset,
        limit,
      };
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
