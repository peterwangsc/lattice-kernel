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
    const event = makeEvent({ requestId: "req_1" });
    await sink.emit(event);

    const results = await sink.query({ requestId: "req_1" });
    expect(results).toHaveLength(1);
    expect(results[0]!.requestId).toBe("req_1");
  });

  it("filters by type", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ type: "infer" }));
    await sink.emit(makeEvent({ type: "remember" }));
    await sink.emit(makeEvent({ type: "infer" }));

    const results = await sink.query({ type: "infer" });
    expect(results).toHaveLength(2);
  });

  it("filters by actor", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(makeEvent({ actor: "alice" }));
    await sink.emit(makeEvent({ actor: "bob" }));

    const results = await sink.query({ actor: "alice" });
    expect(results).toHaveLength(1);
  });

  it("respects maxEvents limit", async () => {
    const sink = createMemoryAuditSink({ maxEvents: 3 });
    for (let i = 0; i < 5; i++) {
      await sink.emit(makeEvent({ requestId: `req_${i}` }));
    }

    const results = await sink.query({});
    expect(results).toHaveLength(3);
    // Oldest events should have been evicted
    expect(results[0]!.requestId).toBe("req_2");
  });

  it("filters by time range", async () => {
    const sink = createMemoryAuditSink();
    await sink.emit(
      makeEvent({ timestamp: "2025-01-01T00:00:00.000Z" }),
    );
    await sink.emit(
      makeEvent({ timestamp: "2025-06-01T00:00:00.000Z" }),
    );
    await sink.emit(
      makeEvent({ timestamp: "2025-12-01T00:00:00.000Z" }),
    );

    const results = await sink.query({
      since: "2025-03-01T00:00:00.000Z",
      until: "2025-09-01T00:00:00.000Z",
    });
    expect(results).toHaveLength(1);
  });

  it("respects query limit", async () => {
    const sink = createMemoryAuditSink();
    for (let i = 0; i < 10; i++) {
      await sink.emit(makeEvent());
    }

    const results = await sink.query({ limit: 3 });
    expect(results).toHaveLength(3);
  });
});
