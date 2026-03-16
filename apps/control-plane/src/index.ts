/**
 * Lattice Kernel Control Plane
 *
 * REST API for policy management, audit log querying, and system health.
 * Uses SQLite for persistent storage of policies and audit logs.
 */

import { createServer } from "node:http";
import { createRouter } from "./router.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerOpenApiRoutes } from "./routes/openapi.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerCheckpointRoutes } from "./routes/checkpoints.js";
import { cors } from "./middleware/cors.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { requestLogger } from "./middleware/logger.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import {
  createSqliteAuditSink,
  createSqlitePolicyStore,
  createSqliteMemoryStore,
} from "@lattice-kernel/storage";

const PORT = parseInt(process.env.PORT ?? "3100", 10);
const DB_PATH = process.env.DB_PATH ?? "./lattice-control-plane.db";
const API_KEYS = process.env.API_KEYS?.split(",").filter(Boolean) ?? [];
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT ?? "0", 10);

// Initialize services
const policyEngine = createPolicyEngine({ defaultDeny: true });
const auditSink = createSqliteAuditSink({ dbPath: DB_PATH });
const policyStore = createSqlitePolicyStore({ dbPath: DB_PATH });
const memoryStore = createSqliteMemoryStore({ dbPath: DB_PATH, policyEngine, auditSink });

// Load persisted policy rules on startup
policyStore.loadInto(policyEngine);
const loadedCount = policyEngine.listRules().length;
if (loadedCount > 0) {
  console.log(`Loaded ${loadedCount} policy rule(s) from database`);
}

// Build router
const router = createRouter();
registerHealthRoutes(router);
registerPolicyRoutes(router, policyEngine, policyStore);
registerAuditRoutes(router, auditSink);
registerMetricsRoutes(router, policyEngine, auditSink);
registerOpenApiRoutes(router);
registerMemoryRoutes(router, memoryStore);
registerCheckpointRoutes(router, memoryStore);

// Middleware
const logRequest = requestLogger();
const applyCors = cors();
const checkAuth = apiKeyAuth({ apiKeys: API_KEYS });
const checkRateLimit = RATE_LIMIT > 0
  ? rateLimit({ maxRequests: RATE_LIMIT, windowMs: 60_000 })
  : null;

// Start server
const server = createServer(async (req, res) => {
  try {
    logRequest(req, res); // Always returns false, just attaches timing
    if (applyCors(req, res)) return;
    if (checkRateLimit?.(req, res)) return;
    if (checkAuth(req, res)) return;
    await router.handle(req, res);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`Lattice Control Plane running on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Auth: ${API_KEYS.length > 0 ? "enabled" : "disabled (set API_KEYS to enable)"}`);
  console.log("Endpoints (16):");
  console.log("  GET    /health");
  console.log("  GET    /api/v1/policies");
  console.log("  POST   /api/v1/policies");
  console.log("  DELETE /api/v1/policies/:ruleId");
  console.log("  GET    /api/v1/audit");
  console.log("  GET    /api/v1/metrics");
  console.log("  GET    /api/v1/openapi.json");
  console.log("  GET    /api/v1/memory/stats");
  console.log("  GET    /api/v1/memory");
  console.log("  GET    /api/v1/memory/:id");
  console.log("  DELETE /api/v1/memory/:id");
  console.log("  POST   /api/v1/memory/expire");
  console.log("  GET    /api/v1/checkpoints");
  console.log("  POST   /api/v1/checkpoints");
  console.log("  POST   /api/v1/checkpoints/:id/rollback");
  console.log("  GET    /api/v1/checkpoints/:id/verify");
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { router, policyEngine, policyStore, auditSink };
