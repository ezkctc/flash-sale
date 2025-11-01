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
# Build just the API app
RUN npx nx build @flash-sale/api 
# Create a minimal dependency set for runtime
RUN npx nx prune --project=@flash-sale/api

# ---------- 3) Runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install production dependencies using root manifest
COPY --from=deps /app/package*.json ./
RUN npm ci --omit=dev

# Copy the built API dist (Nx outputs to apps/api/dist)
COPY --from=build /app/apps/api/dist ./dist/apps/api

# Run the Fastify app
CMD ["node", "dist/apps/api/main.js"]
