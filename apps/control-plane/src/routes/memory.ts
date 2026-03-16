import type { MemoryStore } from "@lattice-kernel/memory";
import type { Router } from "../router.js";
import { json } from "../router.js";
import type { IncomingMessage } from "node:http";

function parseQueryParams(req: IncomingMessage): Record<string, string> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const params: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }
  return params;
}

export function registerMemoryRoutes(
  router: Router,
  memoryStore: MemoryStore,
): void {
  // Memory statistics
  router.get("/api/v1/memory/stats", async (_req, res) => {
    const stats = memoryStore.stats();
    json(res, 200, stats);
  });

  // Retrieve memory items
  router.get("/api/v1/memory", async (req, res) => {
    const params = parseQueryParams(req);
    const scope: Record<string, string> = {};
    if (params.tenantId) scope.tenantId = params.tenantId;
    if (params.appId) scope.appId = params.appId;
    if (params.userId) scope.userId = params.userId;

    const query = params.q ?? "";
    const topK = params.limit ? parseInt(params.limit, 10) : 20;

    const items = await memoryStore.retrieve(query, scope, { topK });
    json(res, 200, { items, count: items.length });
  });

  // Get single memory item
  router.get("/api/v1/memory/:id", async (_req, res, params) => {
    const item = await memoryStore.get(params.id!);
    if (!item) {
      json(res, 404, { error: "Memory item not found" });
      return;
    }
    json(res, 200, item);
  });

  // Delete memory item
  router.delete("/api/v1/memory/:id", async (_req, res, params) => {
    await memoryStore.delete(params.id!);
    json(res, 200, { message: "Item deleted", id: params.id });
  });

  // Expire stale items
  router.post("/api/v1/memory/expire", async (_req, res) => {
    const expired = await memoryStore.expireStale();
    json(res, 200, { expired });
  });
}
