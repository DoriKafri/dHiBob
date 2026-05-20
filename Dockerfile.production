# =============================================================================
# Stage 1: Dependencies — install node_modules (cached unless package*.json changes)
# =============================================================================
FROM node:20-alpine AS deps

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# =============================================================================
# Stage 2: Build — compile Next.js + generate Prisma client
# =============================================================================
FROM node:20-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy Prisma schema first (changes less often than source → better cache)
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest of the source
COPY . .

# Build Next.js with standalone output. Bump heap for memory-tight hosts.
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =============================================================================
# Stage 3: Production — minimal runtime image
# =============================================================================
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl netcat-openbsd

WORKDIR /app

# Run as non-root for security
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

# Copy the standalone server + static assets from the build
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Copy Prisma artifacts needed at runtime (client + migrations)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma

# Copy scripts needed at runtime (seed, migrations, etc.)
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules/tsx ./node_modules/tsx
COPY --from=build /app/node_modules/@esbuild-kit ./node_modules/@esbuild-kit 2>/dev/null || true

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set ownership
RUN chown -R appuser:appgroup /app

# Runtime config
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Health check — matches the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

USER appuser

ENTRYPOINT ["/docker-entrypoint.sh"]
