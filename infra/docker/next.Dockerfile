# syntax=docker/dockerfile:1
ARG APP=web
FROM node:22-bookworm-slim AS build
ARG APP
WORKDIR /repo
COPY . .
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    corepack enable && corepack prepare pnpm@10.28.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1
# Optional corporate/proxy CA: docker build --secret id=ca,src=/path/ca.crt (ignored when absent)
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile && pnpm --filter @collabiz/types build && pnpm --filter @collabiz/${APP} build

FROM node:22-bookworm-slim
ARG APP
ARG PORT=3000
ENV NODE_ENV=production PORT=${PORT} HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build /repo/apps/${APP}/public ./apps/${APP}/public
RUN useradd -r -u 10001 collabiz
USER collabiz
ENV APP_DIR=apps/${APP}
EXPOSE ${PORT}
CMD ["sh", "-c", "node $APP_DIR/server.js"]
