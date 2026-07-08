# Build context is the repo root (see docker-compose.yml's `build.context: ..`),
# because this is an npm workspace - node_modules is hoisted to the repo root,
# and package-lock.json only exists there.
#
# Unlike apps/control-plane, this image has no separate compile step: the
# agent runs directly via `tsx` at container start, the same way
# `npm run agent:dev` does locally - there's no bundler/build output to
# copy in, just source + node_modules.
FROM node:20-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/agent/package.json apps/agent/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/runtime-sdk/package.json packages/runtime-sdk/package.json
COPY packages/workload-spec/package.json packages/workload-spec/package.json
RUN npm ci

# @botfleet/protocol, @botfleet/runtime-sdk, and @botfleet/workload-spec
# are each resolved by their built dist/ output (see their package.json
# "main" fields) - that output is gitignored, so it has to be built here
# rather than just copied in from source like apps/agent itself.
FROM node:20-slim AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY packages/protocol packages/protocol
COPY packages/runtime-sdk packages/runtime-sdk
COPY packages/workload-spec packages/workload-spec
RUN npm run build --workspace @botfleet/protocol \
  && npm run build --workspace @botfleet/workload-spec \
  && npm run build --workspace @botfleet/runtime-sdk

FROM node:20-slim AS runner
WORKDIR /repo
RUN groupadd -r botfleet && useradd -r -g botfleet botfleet
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/protocol packages/protocol
COPY --from=builder /repo/packages/runtime-sdk packages/runtime-sdk
COPY --from=builder /repo/packages/workload-spec packages/workload-spec
COPY apps/agent apps/agent
WORKDIR /repo/apps/agent
USER botfleet
# No inbound port - this agent only ever connects outbound to a control
# plane's agent-gateway (BOTFLEET_CONTROL_PLANE_WS_URL). See
# docs/agent-installation.md for required environment variables.
CMD ["npx", "tsx", "src/index.ts"]
