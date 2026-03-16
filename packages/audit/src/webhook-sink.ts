import type { AuditEvent } from "@lattice-kernel/schemas";
import type { AuditSink, AuditQueryFilter, AuditQueryResult } from "./types.js";

export interface WebhookConfig {
  /** URL to POST audit events to. */
  url: string;
  /** Optional headers (e.g., authorization). */
  headers?: Record<string, string>;
  /** Filter: only send events matching these types. If empty, send all. */
  eventTypes?: string[];
  /** Batch size before flushing. Default: 1 (real-time). */
  batchSize?: number;
  /** Max time to wait before flushing batch (ms). Default: 1000. */
  flushIntervalMs?: number;
  /** Called on delivery failure. */
  onError?: (error: Error, events: AuditEvent[]) => void;
}

/**
 * Audit sink that delivers events via HTTP POST webhooks.
 * Supports batching and filtering by event type.
 *
 * Write-only: query returns empty results. Pair with another
 * sink via CompositeAuditSink for query support.
 */
export function createWebhookAuditSink(config: WebhookConfig): AuditSink {
  const {
    url,
    headers = {},
    eventTypes,
    batchSize = 1,
    flushIntervalMs = 1000,
    onError,
  } = config;

  const typeFilter = eventTypes && eventTypes.length > 0 ? new Set(eventTypes) : null;
  const buffer: AuditEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function deliver(events: AuditEvent[]): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Webhook delivery failed (${response.status}): ${body}`);
      }
    } catch (err) {
      if (onError) {
        onError(err instanceof Error ? err : new Error(String(err)), events);
      }
    }
  }

  async function flushBuffer(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    await deliver(batch);
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushBuffer();
    }, flushIntervalMs);
  }

  return {
    async emit(event: AuditEvent): Promise<void> {
      // Filter by event type
      if (typeFilter && !typeFilter.has(event.type)) return;

      buffer.push(event);

      if (buffer.length >= batchSize) {
        await flushBuffer();
      } else {
        scheduleFlush();
      }
    },

    async query(_filter: AuditQueryFilter): Promise<AuditQueryResult> {
      return { events: [], total: 0, hasMore: false, offset: 0, limit: 0 };
    },

    async flush(): Promise<void> {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flushBuffer();
    },
  };
}
