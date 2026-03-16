/**
 * Lattice Kernel Control Plane
 *
 * REST API for policy management, audit log querying, and system health.
 * Uses SQLite for persistent storage.
 */

import { createServer } from "node:http";
import { createRouter } from "./router.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPolicyRoutes } from "./routes/policies.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createSqliteAuditSink } from "@lattice-kernel/storage";

const PORT = parseInt(process.env.PORT ?? "3100", 10);
const DB_PATH = process.env.DB_PATH ?? "./lattice-control-plane.db";

// Initialize services
const policyEngine = createPolicyEngine({ defaultDeny: true });
const auditSink = createSqliteAuditSink({ dbPath: DB_PATH });

// Build router
const router = createRouter();
registerHealthRoutes(router);
registerPolicyRoutes(router, policyEngine);
registerAuditRoutes(router, auditSink);

// Start server
const server = createServer(async (req, res) => {
  try {
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
  console.log("Endpoints:");
  console.log("  GET  /health");
  console.log("  GET  /api/v1/policies");
  console.log("  POST /api/v1/policies");
  console.log("  DELETE /api/v1/policies/:ruleId");
  console.log("  GET  /api/v1/audit?type=infer&limit=10&offset=0");
});

export { router, policyEngine, auditSink };
