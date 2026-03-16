import type { MemoryStore } from "@lattice-kernel/memory";
import type { Router } from "../router.js";
import { json, readBody } from "../router.js";

export function registerCheckpointRoutes(
  router: Router,
  memoryStore: MemoryStore,
): void {
  // List all checkpoints
  router.get("/api/v1/checkpoints", async (_req, res) => {
    const checkpoints = memoryStore.listCheckpoints();
    json(res, 200, { checkpoints, count: checkpoints.length });
  });

  // Create a checkpoint
  router.post("/api/v1/checkpoints", async (req, res) => {
    try {
      const body = await readBody(req);
      const { description } = body ? JSON.parse(body) as { description?: string } : {};
      const cp = await memoryStore.checkpoint(description);
      json(res, 201, cp);
    } catch (err) {
      json(res, 400, {
        error: err instanceof Error ? err.message : "Invalid request",
      });
    }
  });

  // Rollback to a checkpoint
  router.post("/api/v1/checkpoints/:id/rollback", async (_req, res, params) => {
    try {
      await memoryStore.rollback(params.id!);
      json(res, 200, { message: "Rolled back", checkpointId: params.id });
    } catch (err) {
      json(res, 404, {
        error: err instanceof Error ? err.message : "Rollback failed",
      });
    }
  });

  // Verify checkpoint integrity
  router.get("/api/v1/checkpoints/:id/verify", async (_req, res, params) => {
    const result = await memoryStore.verifyCheckpoint(params.id!);
    json(res, result.valid ? 200 : 409, result);
  });
}
