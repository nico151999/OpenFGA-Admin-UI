# Stage 1: Build
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/gateway/package.json packages/gateway/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY biome.json ./
RUN bun run build

# Stage 2: Production
FROM oven/bun:1-slim AS production

WORKDIR /app

# Copy workspace structure needed at runtime
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/gateway/package.json packages/gateway/
COPY --from=builder /app/packages/ui/package.json packages/ui/

# Copy node_modules from builder
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/packages/shared/node_modules packages/shared/node_modules/
COPY --from=builder /app/packages/gateway/node_modules packages/gateway/node_modules/
COPY --from=builder /app/packages/ui/node_modules packages/ui/node_modules/

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/gateway/dist packages/gateway/dist/
COPY --from=builder /app/packages/ui/dist packages/ui/dist/

# Copy source files (gateway runs from source, shared types needed for resolution)
COPY --from=builder /app/packages/gateway/src packages/gateway/src/
COPY --from=builder /app/packages/shared/src packages/shared/src/
COPY --from=builder /app/tsconfig.base.json ./

# Non-root user
RUN groupadd --system --gid 1001 app && \
    useradd --system --uid 1001 --gid app --create-home app && \
    mkdir -p /home/app/.openfga-admin && chown -R app:app /home/app
USER app

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:4000/health'); process.exit(r.ok ? 0 : 1)"

WORKDIR /app/packages/gateway

CMD ["bun", "run", "start"]
