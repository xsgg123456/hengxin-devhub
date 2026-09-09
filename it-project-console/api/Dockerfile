FROM node:24.18.1-bookworm-slim AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.24.0
WORKDIR /workspace

FROM toolchain AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm --filter @it-project-console/api install --frozen-lockfile
COPY api/ api/
RUN pnpm --filter @it-project-console/api build \
    && rm -f /workspace/api/dist/db/seed.js \
    && pnpm --filter @it-project-console/api deploy --legacy /out

FROM toolchain AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4322
WORKDIR /app
# Deploy creates a self-contained node_modules; retain Prisma CLI for offline migration.
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/api/dist ./dist
COPY --from=build --chown=node:node /workspace/api/package.json /workspace/api/prisma.config.ts ./
COPY --from=build --chown=node:node /workspace/api/prisma/*.prisma ./prisma/
COPY --from=build --chown=node:node /workspace/api/prisma/migrations ./prisma/migrations
USER node
EXPOSE 4322
CMD ["node", "dist/server.js"]
