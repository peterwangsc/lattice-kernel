import { describe, it, expect } from "vitest";
import { createMemoryAuditSink } from "../memory-sink.js";
import type { AuditEvent } from "@lattice-kernel/schemas";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: `evt_${Date.now()}`,
    type: "infer",
    requestId: `req_${Date.now()}`,
    scope: {},
    trustLevel: "trusted_user_explicit",
    timestamp: new Date().toISOString(),
    actor: "test",
    policyDecisions: [],
    ...overrides,
  };
}

describe("MemoryAuditSink", () => {
  it("stores and queries events", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ requestId: "req_1" }));

    const { events } = await sink.query({ requestId: "req_1" });
    expect(events).toHaveLength(1);
    expect(events[0]!.requestId).toBe("req_1");
  });

  it("filters by type", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ type: "infer" }));
    await sink.emit(makeEvent({ type: "remember" }));
    await sink.emit(makeEvent({ type: "infer" }));

    const { events } = await sink.query({ type: "infer" });
    expect(events).toHaveLength(2);
  });

  it("filters by actor", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ actor: "alice" }));
    await sink.emit(makeEvent({ actor: "bob" }));

    const { events } = await sink.query({ actor: "alice" });
    expect(events).toHaveLength(1);
  });

  it("respects maxEvents limit", async () => {
    const sink = createMemoryAuditSink({ maxEvents: 3 });
    for (let i = 0; i < 5; i++) {
      await sink.emit(makeEvent({ requestId: `req_${i}` }));
    }

    const { events } = await sink.query({});
    expect(events).toHaveLength(3);
    expect(events[0]!.requestId).toBe("req_2");
  });

  it("filters by time range", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ timestamp: "2025-01-01T00:00:00.000Z" }));
    await sink.emit(makeEvent({ timestamp: "2025-06-01T00:00:00.000Z" }));
    await sink.emit(makeEvent({ timestamp: "2025-12-01T00:00:00.000Z" }));

    const { events } = await sink.query({
      since: "2025-03-01T00:00:00.000Z",
      until: "2025-09-01T00:00:00.000Z",
    });
    expect(events).toHaveLength(1);
  });

  it("paginates with offset and limit", async () => {
    const sink = createMemoryAuditSink();
    for (let i = 0; i < 10; i++) {
      await sink.emit(makeEvent({ requestId: `req_${i}` }));
    }

    const page1 = await sink.query({ limit: 3, offset: 0 });
    expect(page1.events).toHaveLength(3);
    expect(page1.total).toBe(10);
    expect(page1.hasMore).toBe(true);
    expect(page1.events[0]!.requestId).toBe("req_0");

    const page2 = await sink.query({ limit: 3, offset: 3 });
    expect(page2.events).toHaveLength(3);
    expect(page2.hasMore).toBe(true);

    const lastPage = await sink.query({ limit: 3, offset: 9 });
    expect(lastPage.events).toHaveLength(1);
    expect(lastPage.hasMore).toBe(false);
  });

  it("filters by hasError", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ error: "something failed" }));
    await sink.emit(makeEvent({}));
    await sink.emit(makeEvent({ error: "another error" }));

    const errors = await sink.query({ hasError: true });
    expect(errors.events).toHaveLength(2);

    const successes = await sink.query({ hasError: false });
    expect(successes.events).toHaveLength(1);
  });

  it("filters by modelId", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ modelId: "claude-sonnet" }));
    await sink.emit(makeEvent({ modelId: "gpt-4" }));

    const { events } = await sink.query({ modelId: "claude-sonnet" });
    expect(events).toHaveLength(1);
  });

  it("returns total and pagination metadata", async () => {
    const sink = createMemoryAuditSink();
    for (let i = 0; i < 5; i++) {
      await sink.emit(makeEvent());
    }

    const result = await sink.query({ limit: 2 });
    expect(result.total).toBe(5);
    expect(result.events).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(2);
  });
});
