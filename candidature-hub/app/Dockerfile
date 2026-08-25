FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /opt/candidature-hub/app
COPY candidature-hub/app/package.json candidature-hub/app/pnpm-lock.yaml candidature-hub/app/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY candidature-hub/app/ ./
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma generate && pnpm build

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql16-client tar && corepack enable
WORKDIR /opt/candidature-hub/app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3031 HOSTNAME=0.0.0.0
COPY --from=build /opt/candidature-hub/app ./
COPY scripts /opt/candidature-hub/scripts
COPY docs /opt/candidature-hub/docs
RUN chmod +x /opt/candidature-hub/scripts/*.sh
EXPOSE 3031
CMD ["node", "node_modules/next/dist/bin/next", "start"]
