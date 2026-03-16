import type { Router } from "../router.js";
import { json } from "../router.js";

export function registerHealthRoutes(router: Router): void {
  router.get("/health", async (_req, res) => {
    json(res, 200, { status: "ok", timestamp: new Date().toISOString() });
  });
}
