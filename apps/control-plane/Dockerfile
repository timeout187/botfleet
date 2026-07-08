# Build context is the repo root (see docker-compose.yml's `build.context: ..`),
# because this is an npm workspace - node_modules is hoisted to the repo root,
# and package-lock.json only exists there.
FROM node:20-slim AS deps
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# Every workspace package.json the control-plane build touches must be
# present before `npm ci`, or npm installs none of that workspace's
# dependencies and creates no node_modules/@botfleet/* symlink for it.
# The control-plane only depends on these three workspaces (not the
# runtime-sdk or the discord.js/eris adapters), so only these are copied.
COPY package.json package-lock.json ./
COPY apps/control-plane/package.json apps/control-plane/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/scheduler/package.json packages/scheduler/package.json
COPY packages/workload-spec/package.json packages/workload-spec/package.json
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed by prisma generate to resolve the datasource
# provider, not to connect - migrations run separately at container start.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate --schema apps/control-plane/prisma/schema.prisma
# Build only the three workspace packages the control-plane imports (by
# their built dist/ output, which is gitignored and doesn't exist yet in
# the image), then the control-plane itself. A bare `npm run build` would
# also build the discord.js/eris adapters, whose dependencies were never
# installed above - the control-plane image has no use for them.
RUN npm run build --workspace @botfleet/protocol \
  && npm run build --workspace @botfleet/workload-spec \
  && npm run build --workspace @botfleet/scheduler \
  && npm run build --workspace @botfleet/control-plane

FROM node:20-slim AS runner
WORKDIR /repo/apps/control-plane
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
  && groupadd -r botfleet && useradd -r -g botfleet botfleet
ENV NODE_ENV=production
COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/apps/control-plane/public ./public
COPY --from=builder /repo/apps/control-plane/.next ./.next
COPY --from=builder /repo/apps/control-plane/package.json ./package.json
COPY --from=builder /repo/apps/control-plane/prisma ./prisma
COPY --from=builder /repo/apps/control-plane/app/generated ./app/generated
COPY --from=builder /repo/apps/control-plane/prisma.config.ts ./prisma.config.ts
COPY --from=builder /repo/apps/control-plane/worker-runtime ./worker-runtime
# lib/ is needed at runtime (not just build time) because `npm run worker:ai`
# runs lib/queue/ai-worker.ts directly via tsx, not a bundled/compiled output.
COPY --from=builder /repo/apps/control-plane/lib ./lib
USER botfleet
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
