# Lattice Kernel Control Plane
# Multi-stage build for minimal production image

# --- Build stage ---
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy all package.json files for dependency resolution
COPY packages/schemas/package.json packages/schemas/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/audit/package.json packages/audit/
COPY packages/crypto/package.json packages/crypto/
COPY packages/memory/package.json packages/memory/
COPY packages/runtime/package.json packages/runtime/
COPY packages/sdk/package.json packages/sdk/
COPY packages/tooling/package.json packages/tooling/
COPY packages/storage/package.json packages/storage/
COPY packages/adapters/adapter-local/package.json packages/adapters/adapter-local/
COPY packages/adapters/adapter-cloud/package.json packages/adapters/adapter-cloud/
COPY packages/adapters/adapter-web/package.json packages/adapters/adapter-web/
COPY apps/control-plane/package.json apps/control-plane/
COPY apps/sandbox-demo/package.json apps/sandbox-demo/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/ apps/
COPY vitest.config.ts ./
COPY eslint.config.js ./

# Build
RUN pnpm build

# --- Production stage ---
FROM node:22-slim AS production

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/control-plane ./apps/control-plane

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3100
ENV DB_PATH=/data/lattice.db

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r => process.exit(r.ok ? 0 : 1))"

CMD ["node", "apps/control-plane/dist/index.js"]
