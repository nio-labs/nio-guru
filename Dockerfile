FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH:/root/.cargo/bin:/root/.nio/bin:/root/.local/bin:/usr/local/bin"

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    bash \
    ca-certificates \
    python3 \
    make \
    g++ \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Nio CLI (native and npm fallback)
RUN curl -fsSL https://raw.githubusercontent.com/nio-labs/nio/main/install.sh | bash || true
RUN npm install -g @nio-labs/nio-ai || true

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY bin/ ./bin/

RUN pnpm approve-builds --all && (pnpm install --frozen-lockfile || pnpm install)

# Build all workspaces
RUN pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    RAILWAY_VOLUME_MOUNT_PATH=/data \
    DATABASE_PATH=/data/nioguru.db

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
