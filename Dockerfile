FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH:/root/.cargo/bin:/root/.nio/bin:/root/.local/bin"
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends curl bash ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install nio CLI
RUN curl -fsSL https://raw.githubusercontent.com/nio-labs/nio/main/install.sh | bash || true

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN pnpm approve-builds --all && pnpm install --frozen-lockfile || pnpm install

# Build all workspaces
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/openguru.db

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]
