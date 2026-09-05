# Tickif media worker — BullMQ consumer processing image jobs via sharp.
#
# Memory note: peak ≈ MEDIA_WORKER_CONCURRENCY × MEDIA_MAX_IMAGE_PIXELS × 4 bytes
# e.g. 4 × 40M × 4 ≈ 640 MB at defaults (plus ~100 MB Node overhead). Size the
# container memory limit accordingly, or lower MEDIA_WORKER_CONCURRENCY.
#
# Debian slim (not alpine): sharp's prebuilt libvips binaries target glibc.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm --filter @repo/worker... install --frozen-lockfile
RUN pnpm --filter @repo/worker... build

FROM node:22-slim AS production-dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm --filter @repo/worker... install --prod --frozen-lockfile

FROM node:22-slim AS runtime
WORKDIR /app
RUN useradd -m -u 1001 app
COPY --from=production-dependencies --chown=app:app /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=app:app /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=production-dependencies --chown=app:app /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=app:app /app/apps/worker/dist ./apps/worker/dist
USER app
ENV NODE_ENV=production
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/worker/dist/index.js"]
