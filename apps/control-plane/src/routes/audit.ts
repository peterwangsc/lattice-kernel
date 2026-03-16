import type { AuditSink, AuditQueryFilter } from "@lattice-kernel/audit";
import type { AuditEventType } from "@lattice-kernel/schemas";
import type { Router } from "../router.js";
import { json } from "../router.js";
import type { IncomingMessage } from "node:http";

function parseQueryParams(req: IncomingMessage): AuditQueryFilter {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const filter: AuditQueryFilter = {};

  const requestId = url.searchParams.get("requestId");
  if (requestId) filter.requestId = requestId;

  const traceId = url.searchParams.get("traceId");
  if (traceId) filter.traceId = traceId;

  const type = url.searchParams.get("type");
  if (type) filter.type = type as AuditEventType;

  const actor = url.searchParams.get("actor");
  if (actor) filter.actor = actor;

  const modelId = url.searchParams.get("modelId");
  if (modelId) filter.modelId = modelId;

  const since = url.searchParams.get("since");
  if (since) filter.since = since;

  const until = url.searchParams.get("until");
  if (until) filter.until = until;

  const hasError = url.searchParams.get("hasError");
  if (hasError !== null) filter.hasError = hasError === "true";

  const tenantId = url.searchParams.get("tenantId");
  const appId = url.searchParams.get("appId");
  if (tenantId || appId) {
    filter.scope = {};
    if (tenantId) filter.scope.tenantId = tenantId;
    if (appId) filter.scope.appId = appId;
  }

  const limit = url.searchParams.get("limit");
  if (limit) filter.limit = parseInt(limit, 10);

  const offset = url.searchParams.get("offset");
  if (offset) filter.offset = parseInt(offset, 10);

  return filter;
}

export function registerAuditRoutes(
  router: Router,
  auditSink: AuditSink,
): void {
  // Query audit events with pagination and filtering
  router.get("/api/v1/audit", async (req, res) => {
    try {
      const filter = parseQueryParams(req);
      const result = await auditSink.query(filter);
      json(res, 200, result);
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : "Query failed",
      });
    }
  });
}
