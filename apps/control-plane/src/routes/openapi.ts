import type { Router } from "../router.js";
import { json } from "../router.js";

const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Lattice Kernel Control Plane",
    version: "0.1.0",
    description:
      "REST API for managing policies, querying audit logs, and monitoring the Lattice runtime.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "System health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/policies": {
      get: {
        summary: "List all policy rules",
        responses: {
          "200": {
            description: "Policy rules list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rules: { type: "array", items: { $ref: "#/components/schemas/PolicyRule" } },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Add or update a policy rule",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PolicyRule" },
            },
          },
        },
        responses: {
          "201": { description: "Rule added" },
          "400": { description: "Invalid request" },
        },
      },
    },
    "/api/v1/policies/{ruleId}": {
      delete: {
        summary: "Delete a policy rule",
        parameters: [
          { name: "ruleId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Rule removed" },
        },
      },
    },
    "/api/v1/audit": {
      get: {
        summary: "Query audit events with pagination",
        parameters: [
          { name: "type", in: "query", schema: { type: "string" } },
          { name: "requestId", in: "query", schema: { type: "string" } },
          { name: "traceId", in: "query", schema: { type: "string" } },
          { name: "actor", in: "query", schema: { type: "string" } },
          { name: "modelId", in: "query", schema: { type: "string" } },
          { name: "tenantId", in: "query", schema: { type: "string" } },
          { name: "appId", in: "query", schema: { type: "string" } },
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "until", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "hasError", in: "query", schema: { type: "boolean" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "Paginated audit events",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: { type: "array", items: { $ref: "#/components/schemas/AuditEvent" } },
                    total: { type: "integer" },
                    hasMore: { type: "boolean" },
                    offset: { type: "integer" },
                    limit: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/metrics": {
      get: {
        summary: "System metrics",
        responses: {
          "200": { description: "Policy, audit, and system metrics" },
        },
      },
    },
    "/api/v1/memory/stats": {
      get: {
        summary: "Memory statistics",
        responses: {
          "200": { description: "Item counts by type and tenant" },
        },
      },
    },
    "/api/v1/memory": {
      get: {
        summary: "Retrieve memory items",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Search query" },
          { name: "tenantId", in: "query", schema: { type: "string" } },
          { name: "appId", in: "query", schema: { type: "string" } },
          { name: "userId", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: {
          "200": { description: "Memory items matching query and scope" },
        },
      },
    },
    "/api/v1/memory/{id}": {
      get: {
        summary: "Get a single memory item",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Memory item" },
          "404": { description: "Item not found" },
        },
      },
      delete: {
        summary: "Delete a memory item",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Item deleted" },
        },
      },
    },
    "/api/v1/memory/expire": {
      post: {
        summary: "Expire stale memory items",
        responses: {
          "200": { description: "Number of expired items" },
        },
      },
    },
    "/api/v1/checkpoints": {
      get: {
        summary: "List all checkpoints",
        responses: {
          "200": { description: "Checkpoints list" },
        },
      },
      post: {
        summary: "Create a checkpoint",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { description: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "201": { description: "Checkpoint created" },
        },
      },
    },
    "/api/v1/checkpoints/{id}/rollback": {
      post: {
        summary: "Rollback to a checkpoint",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Rolled back" },
          "404": { description: "Checkpoint not found" },
        },
      },
    },
    "/api/v1/checkpoints/{id}/verify": {
      get: {
        summary: "Verify checkpoint integrity",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Checkpoint is valid" },
          "409": { description: "Integrity check failed" },
        },
      },
    },
  },
  components: {
    schemas: {
      PolicyRule: {
        type: "object",
        required: ["id", "name", "permissions", "effect", "priority"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          permissions: {
            type: "array",
            items: {
              type: "string",
              enum: ["canInfer", "canRetrieve", "canRemember", "canAdapt", "canPlan", "canAct", "canRouteToCloud"],
            },
          },
          scopePattern: { type: "string" },
          modelPattern: { type: "string" },
          toolPattern: { type: "string" },
          effect: { type: "string", enum: ["allow", "deny", "require_approval"] },
          priority: { type: "integer" },
        },
      },
      AuditEvent: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          type: { type: "string" },
          requestId: { type: "string" },
          scope: { type: "object" },
          trustLevel: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          actor: { type: "string" },
          modelId: { type: "string" },
          route: { type: "string" },
          policyDecisions: { type: "array", items: { type: "string" } },
          error: { type: "string" },
          durationMs: { type: "number" },
        },
      },
    },
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
};

export function registerOpenApiRoutes(router: Router): void {
  router.get("/api/v1/openapi.json", async (_req, res) => {
    json(res, 200, OPENAPI_SPEC);
  });
}
