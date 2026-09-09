FROM node:24.18.1-bookworm-slim AS build
RUN npm install --global pnpm@11.24.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN pnpm --filter @it-project-console/web install --frozen-lockfile
COPY web/ web/
ENV VITE_APP_MODE=production VITE_API_URL=/api VITE_BASE_URL=/
RUN pnpm --filter @it-project-console/web build

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health/ready || exit 1
