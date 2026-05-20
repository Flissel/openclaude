# OpenClaude Service — Full Claude Code with Multi-Provider support
# Build: docker build -t flissel/openclaude-service .

FROM oven/bun:1.3-slim AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime ---
FROM oven/bun:1.3-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/serve.ts ./

# Entrypoint for secret loading
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Phase 11.W (2026-05-20): serve.ts spawns the openclaude CLI with
# --dangerously-skip-permissions, which the CLI refuses to honor under
# root/sudo for security reasons ("cannot be used with root/sudo
# privileges"). The oven/bun:1.3-slim base runs as root but already has
# a `bun` user at UID 1000, so we re-use it (instead of creating a new
# clashing UID). /workspace is the volume mount used by the service for
# generated code — make it owned by the bun user.
RUN mkdir -p /workspace \
    && chown -R bun:bun /app /workspace
USER bun

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8091/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "serve.ts"]
