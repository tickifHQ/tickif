# Tickif API — Hono server (REST + OpenAPI + auth).
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm --filter @repo/api... install --frozen-lockfile
RUN pnpm --filter @repo/api... build

FROM node:22-slim AS production-dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm --filter @repo/api... install --prod --frozen-lockfile

FROM node:22-slim AS runtime
WORKDIR /app
RUN useradd -m -u 1001 app
COPY --from=production-dependencies --chown=app:app /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
USER app
ENV NODE_ENV=production
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
