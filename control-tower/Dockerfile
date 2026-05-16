# =============================================================================
#  LaunchOps Control Tower — Dockerfile
#  Multi-stage build: build client assets + server bundle, then run lean.
# =============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build: Vite client + esbuild server bundle
RUN pnpm build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install Docker CLI only (no daemon — we talk to the host socket)
RUN apk add --no-cache docker-cli

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Non-root user for everything except Docker socket access
# The docker group GID must match the host's docker group (typically 999 or 998)
# We add the node user to group 999 at runtime via entrypoint if needed.
RUN addgroup -g 999 docker 2>/dev/null || true && \
    adduser -D -G docker node 2>/dev/null || true

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
