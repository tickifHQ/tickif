# Tickif web — Next.js standalone production server.
FROM node:22-slim AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY . .
RUN pnpm --filter @repo/web... install --frozen-lockfile

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_SCROLL_GATE_LIMIT=5
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_SCROLL_GATE_LIMIT=$NEXT_PUBLIC_SCROLL_GATE_LIMIT
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_WEB_URL"
RUN pnpm --filter @repo/web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN useradd --create-home --uid 1001 app
COPY --from=build --chown=app:app /app/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
