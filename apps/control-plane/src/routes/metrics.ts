import type { AuditSink } from "@lattice-kernel/audit";
import type { PolicyEngine } from "@lattice-kernel/policy-engine";
import type { Router } from "../router.js";
import { json } from "../router.js";

export function registerMetricsRoutes(
  router: Router,
  policyEngine: PolicyEngine,
  auditSink: AuditSink,
): void {
  router.get("/api/v1/metrics", async (_req, res) => {
    const rules = policyEngine.listRules();

    // Count recent events by type
    const allEvents = await auditSink.query({ limit: 10000 });
    const eventsByType: Record<string, number> = {};
    const errorCount = (await auditSink.query({ hasError: true, limit: 10000 })).total;

    for (const event of allEvents.events) {
      eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
    }

    json(res, 200, {
      timestamp: new Date().toISOString(),
      policy: {
        ruleCount: rules.length,
        rules: rules.map((r) => ({ id: r.id, effect: r.effect, priority: r.priority })),
      },
      audit: {
        totalEvents: allEvents.total,
        errorCount,
        eventsByType,
      },
      system: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
      },
    });
  });
}
