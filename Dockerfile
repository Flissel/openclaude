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

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:8091/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "serve.ts"]
