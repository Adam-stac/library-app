# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/web/Dockerfile .

# ---- Stage 1: build the static files ----
FROM node:24-alpine AS build
# Keep in step with your local pnpm version (pnpm -v)
ARG PNPM_VERSION=12.14.0
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
# --frozen-lockfile: install exactly what the lockfile says; --ignore-scripts: run no package install scripts
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --filter @library-app/web
COPY apps/web/ apps/web/
RUN pnpm --filter @library-app/web build

# ---- Stage 2: serve with nginx, running as a non-root user ----
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
