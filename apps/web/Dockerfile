FROM node:24-alpine AS base
RUN npm install --global pnpm@10.13.1
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --no-frozen-lockfile

FROM dependencies AS development
COPY . .
WORKDIR /app/apps/web
ENV NEXT_PUBLIC_API_URL=/api/v1
ENV API_INTERNAL_URL=http://api:3333
CMD ["pnpm", "dev"]

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG API_INTERNAL_URL=http://api:3333
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm --filter @implantahub/web build

FROM build AS production
ENV NODE_ENV=production
WORKDIR /app/apps/web
CMD ["pnpm", "start"]
