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

# Docker socket access: entrypoint runs as root, detects the host docker
# group GID from the socket, adds node to that group, then drops to node.
# This is the only reliable way to handle variable GIDs across host OSes.
RUN printf '#!/bin/sh\nset -e\n# Detect GID of the Docker socket at runtime (root can stat it)\nSOCKET_GID=$(stat -c %%g /var/run/docker.sock 2>/dev/null || echo 999)\n# Create group with that GID and add node user to it\naddgroup -g "$SOCKET_GID" dockerhost 2>/dev/null || true\naddgroup node dockerhost 2>/dev/null || true\n# Drop to non-root node user and exec the server\nexec su-exec node "$@"\n' > /entrypoint.sh && chmod +x /entrypoint.sh

# su-exec is the Alpine equivalent of gosu — drops privileges cleanly
RUN apk add --no-cache su-exec

# Do NOT set USER here — entrypoint runs as root then drops to node
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Entrypoint runs as root (to addgroup), then drops to node via su-exec
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
