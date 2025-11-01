# ---------- 1) Base deps/cache ----------
FROM node:20-alpine AS deps
WORKDIR /app

# Install root deps first to leverage layer cache
COPY package*.json ./
RUN npm ci

# Bring in the rest of the repo (sources, nx.json, tsconfig, etc.)
COPY . .

# ---------- 2) Build + prune (Nx) ----------
FROM deps AS build
# Build just the worker app
RUN npx nx build @flash-sale/worker

# Create a minimal dependency set for runtime (only what's needed by the worker)
# This generates /app/pruned/{package.json, package-lock.json}
RUN npx nx prune --project=@flash-sale/worker

# ---------- 3) Runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies (use root package.json from deps stage)
COPY --from=deps /app/package*.json ./
RUN npm ci --omit=dev

# Copy the built worker dist (Nx outputs to apps/worker/dist)
COPY --from=build /app/apps/worker/dist ./dist/apps/worker

# Run as non-root for safety
USER node

# IMPORTANT: use boot.js (not main.js) so tests don’t trigger worker on import
CMD ["node", "dist/apps/worker/boot.js"]
