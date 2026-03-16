import { describe, it, expect } from "vitest";
import { createRouter, json } from "../router.js";
import { cors } from "../middleware/cors.js";
import { registerHealthRoutes } from "../routes/health.js";
import { registerPolicyRoutes } from "../routes/policies.js";
import { registerAuditRoutes } from "../routes/audit.js";
import { createPolicyEngine } from "@lattice-kernel/policy-engine";
import { createMemoryAuditSink } from "@lattice-kernel/audit";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

// Minimal mock for IncomingMessage and ServerResponse
function mockReq(
  method: string,
  url: string,
  body?: string,
): IncomingMessage {
  const emitter = new EventEmitter();
  const req = emitter as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3100" };

  if (body !== undefined) {
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(body));
      emitter.emit("end");
    });
  } else {
    process.nextTick(() => emitter.emit("end"));
  }

  return req;
}

function mockRes(): ServerResponse & { statusCode: number; body: string; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
      return res;
    },
    end(data?: string) {
      if (data) res.body = data;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
  } as unknown as ServerResponse & { statusCode: number; body: string; headers: Record<string, string> };
  return res;
}

function parseBody(res: { body: string }): unknown {
  return JSON.parse(res.body);
}

describe("Control Plane Routes", () => {
  describe("health", () => {
    it("returns ok status", async () => {
      const router = createRouter();
      registerHealthRoutes(router);

      const req = mockReq("GET", "/health");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(200);
      const body = parseBody(res) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeTruthy();
    });
  });

  describe("policies", () => {
    it("lists empty rules initially", async () => {
      const router = createRouter();
      const engine = createPolicyEngine({ defaultDeny: true });
      registerPolicyRoutes(router, engine);

      const req = mockReq("GET", "/api/v1/policies");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(200);
      const body = parseBody(res) as Record<string, unknown>;
      expect(body.count).toBe(0);
    });

    it("adds a policy rule", async () => {
      const router = createRouter();
      const engine = createPolicyEngine({ defaultDeny: true });
      registerPolicyRoutes(router, engine);

      const rule = {
        id: "allow-infer",
        name: "Allow inference",
        permissions: ["canInfer"],
        effect: "allow",
        priority: 10,
      };

      const req = mockReq("POST", "/api/v1/policies", JSON.stringify(rule));
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(201);
      expect(engine.listRules()).toHaveLength(1);
    });

    it("deletes a policy rule", async () => {
      const router = createRouter();
      const engine = createPolicyEngine({ defaultDeny: true });
      engine.addRule({
        id: "r1",
        name: "test",
        permissions: ["canInfer"],
        effect: "allow",
        priority: 1,
      });
      registerPolicyRoutes(router, engine);

      const req = mockReq("DELETE", "/api/v1/policies/r1");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(200);
      expect(engine.listRules()).toHaveLength(0);
    });

    it("rejects invalid rule", async () => {
      const router = createRouter();
      const engine = createPolicyEngine({ defaultDeny: true });
      registerPolicyRoutes(router, engine);

      const req = mockReq("POST", "/api/v1/policies", "{}");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe("audit", () => {
    it("queries audit events", async () => {
      const router = createRouter();
      const sink = createMemoryAuditSink();
      await sink.emit({
        eventId: "evt_1",
        type: "infer",
        requestId: "req_1",
        scope: {},
        trustLevel: "trusted_user_explicit",
        timestamp: new Date().toISOString(),
        actor: "test",
        policyDecisions: [],
      });
      registerAuditRoutes(router, sink);

      const req = mockReq("GET", "/api/v1/audit?type=infer");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(200);
      const body = parseBody(res) as Record<string, unknown>;
      expect((body.events as unknown[]).length).toBe(1);
      expect(body.total).toBe(1);
    });

    it("supports pagination", async () => {
      const router = createRouter();
      const sink = createMemoryAuditSink();
      for (let i = 0; i < 5; i++) {
        await sink.emit({
          eventId: `evt_${i}`,
          type: "infer",
          requestId: `req_${i}`,
          scope: {},
          trustLevel: "trusted_user_explicit",
          timestamp: new Date().toISOString(),
          actor: "test",
          policyDecisions: [],
        });
      }
      registerAuditRoutes(router, sink);

      const req = mockReq("GET", "/api/v1/audit?limit=2&offset=0");
      const res = mockRes();
      await router.handle(req, res);

      const body = parseBody(res) as Record<string, unknown>;
      expect((body.events as unknown[]).length).toBe(2);
      expect(body.total).toBe(5);
      expect(body.hasMore).toBe(true);
    });
  });

  describe("router", () => {
    it("returns 404 for unknown routes", async () => {
      const router = createRouter();
      const req = mockReq("GET", "/unknown");
      const res = mockRes();
      await router.handle(req, res);

      expect(res.statusCode).toBe(404);
    });

    it("parses path parameters", async () => {
      const router = createRouter();
      let capturedId = "";
      router.get("/items/:id", async (_req, res, params) => {
        capturedId = params.id!;
        json(res, 200, { id: capturedId });
      });

      const req = mockReq("GET", "/items/abc-123");
      const res = mockRes();
      await router.handle(req, res);

      expect(capturedId).toBe("abc-123");
    });
  });

  describe("cors", () => {
    it("sets CORS headers on regular requests", () => {
      const applyCors = cors();
      const req = mockReq("GET", "/health");
      const res = mockRes();
      const handled = applyCors(req, res);

      expect(handled).toBe(false);
      expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(res.headers["Access-Control-Allow-Methods"]).toContain("GET");
    });

    it("handles OPTIONS preflight with 204", () => {
      const applyCors = cors();
      const req = mockReq("OPTIONS", "/api/v1/policies");
      const res = mockRes();
      const handled = applyCors(req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(204);
    });

    it("supports custom origin", () => {
      const applyCors = cors({ allowOrigin: "https://dashboard.example.com" });
      const req = mockReq("GET", "/health");
      const res = mockRes();
      applyCors(req, res);

      expect(res.headers["Access-Control-Allow-Origin"]).toBe(
        "https://dashboard.example.com",
      );
    });
  });
});
