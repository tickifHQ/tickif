# Tickif media worker — BullMQ consumer processing image jobs via sharp.
#
# Memory note: peak ≈ MEDIA_WORKER_CONCURRENCY × MEDIA_MAX_IMAGE_PIXELS × 4 bytes
# e.g. 4 × 40M × 4 ≈ 640 MB at defaults (plus ~100 MB Node overhead). Size the
# container memory limit accordingly, or lower MEDIA_WORKER_CONCURRENCY.
#
# Debian slim (not alpine): sharp's prebuilt libvips binaries target glibc.
# Follow-up: slim the runtime image with `pnpm deploy`/turbo prune once stabilized.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/worker... build

FROM node:22-slim AS runtime
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -u 1001 app
COPY --from=build --chown=app:app /app /app
USER app
ENV NODE_ENV=production
EXPOSE 3002
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3002/livez || exit 1
CMD ["node", "apps/worker/dist/index.js"]
