FROM node:24-alpine AS base
RUN npm install --global pnpm@10.13.1
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --no-frozen-lockfile

FROM dependencies AS development
COPY . .
WORKDIR /app/apps/worker
CMD ["pnpm", "dev"]

FROM dependencies AS build
COPY . .
RUN pnpm --filter @implantahub/worker build

FROM build AS production
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["pnpm", "start"]
