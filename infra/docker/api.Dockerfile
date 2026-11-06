# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @collabiz/types build && pnpm --filter @collabiz/api build \
 && pnpm --filter @collabiz/api deploy --prod --legacy /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/api/drizzle /app/drizzle
RUN useradd -r -u 10001 collabiz && mkdir -p /data/storage && chown -R collabiz /data
USER collabiz
EXPOSE 4000
HEALTHCHECK CMD node -e "fetch('http://localhost:4000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
