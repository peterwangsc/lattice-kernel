import { describe, it, expect, beforeEach } from "vitest";
import { createSqliteAuditSink } from "../sqlite-audit-sink.js";
import type { AuditSink } from "@lattice-kernel/audit";
import type { AuditEvent } from "@lattice-kernel/schemas";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: `evt_${Date.now()}_${Math.random()}`,
    type: "infer",
    requestId: `req_${Date.now()}`,
    scope: { tenantId: "acme" },
    trustLevel: "trusted_user_explicit",
    timestamp: new Date().toISOString(),
    actor: "test",
    policyDecisions: ["rule-1"],
    ...overrides,
  };
}

describe("SqliteAuditSink", () => {
  let sink: AuditSink;

  beforeEach(() => {
    sink = createSqliteAuditSink({ dbPath: ":memory:" });
  });

  it("stores and queries events", async () => {
    await sink.emit(makeEvent({ requestId: "req_1" }));
    const { events } = await sink.query({ requestId: "req_1" });
    expect(events).toHaveLength(1);
    expect(events[0]!.requestId).toBe("req_1");
  });

  it("filters by type", async () => {
    await sink.emit(makeEvent({ type: "infer" }));
    await sink.emit(makeEvent({ type: "remember" }));

    const { events } = await sink.query({ type: "infer" });
    expect(events).toHaveLength(1);
  });

  it("filters by actor", async () => {
    await sink.emit(makeEvent({ actor: "alice" }));
    await sink.emit(makeEvent({ actor: "bob" }));

    const { events } = await sink.query({ actor: "alice" });
    expect(events).toHaveLength(1);
  });

  it("paginates results", async () => {
    for (let i = 0; i < 10; i++) {
      await sink.emit(makeEvent({ requestId: `req_${i}` }));
    }

    const page1 = await sink.query({ limit: 3, offset: 0 });
    expect(page1.events).toHaveLength(3);
    expect(page1.total).toBe(10);
    expect(page1.hasMore).toBe(true);

    const page2 = await sink.query({ limit: 3, offset: 9 });
    expect(page2.events).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it("filters by time range", async () => {
    await sink.emit(makeEvent({ timestamp: "2025-01-01T00:00:00.000Z" }));
    await sink.emit(makeEvent({ timestamp: "2025-06-01T00:00:00.000Z" }));
    await sink.emit(makeEvent({ timestamp: "2025-12-01T00:00:00.000Z" }));

    const { events } = await sink.query({
      since: "2025-03-01T00:00:00.000Z",
      until: "2025-09-01T00:00:00.000Z",
    });
    expect(events).toHaveLength(1);
  });

  it("filters by hasError", async () => {
    await sink.emit(makeEvent({ error: "failed" }));
    await sink.emit(makeEvent({}));

    const errors = await sink.query({ hasError: true });
    expect(errors.events).toHaveLength(1);

    const successes = await sink.query({ hasError: false });
    expect(successes.events).toHaveLength(1);
  });

  it("filters by modelId", async () => {
    await sink.emit(makeEvent({ modelId: "claude" }));
    await sink.emit(makeEvent({ modelId: "gpt" }));

    const { events } = await sink.query({ modelId: "claude" });
    expect(events).toHaveLength(1);
  });

  it("preserves policyDecisions array", async () => {
    await sink.emit(makeEvent({ policyDecisions: ["rule-a", "rule-b"] }));
    const { events } = await sink.query({});
    expect(events[0]!.policyDecisions).toEqual(["rule-a", "rule-b"]);
  });

  it("handles scope filtering", async () => {
    await sink.emit(makeEvent({ scope: { tenantId: "acme" } }));
    await sink.emit(makeEvent({ scope: { tenantId: "globex" } }));

    const { events } = await sink.query({
      scope: { tenantId: "acme" },
    });
    expect(events).toHaveLength(1);
  });
});
