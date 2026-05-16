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

# Docker socket access: add node user to docker group.
# The host docker group GID varies (999, 998, 1001, etc.).
# We use an entrypoint script that reads the actual socket GID at runtime
# and adds node to that group before exec-ing the server.
COPY --chown=root:root <<'EOF' /entrypoint.sh
#!/bin/sh
set -e
# Detect the GID of the Docker socket at runtime
SOCKET_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo 999)
# Create the group with that GID if it doesn't exist, then add node to it
addgroup -g "$SOCKET_GID" dockerhost 2>/dev/null || true
addgroup node dockerhost 2>/dev/null || true
exec "$@"
EOF
RUN chmod +x /entrypoint.sh

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
