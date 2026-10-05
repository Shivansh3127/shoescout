FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests + .npmrc first for layer caching
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter @shoescout/api

COPY apps/api/ ./apps/api/
RUN pnpm --filter @shoescout/api build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter @shoescout/api --prod

# Compiled API
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Frontend static files (served by express.static)
COPY apps/web ./apps/web

# Non-root for security
RUN addgroup -S shoescout && adduser -S shoescout -G shoescout
USER shoescout

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
