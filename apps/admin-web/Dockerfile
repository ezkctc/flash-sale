FROM node:20-alpine AS builder
WORKDIR /app
COPY . .

# Setting this environment variable can prevent hanging issues with Nx build workers in Docker.
ENV NX_ISOLATE_PLUGINS=false

# Run the memory-optimized and verbose build:
# --max-old-space-size=4096: Allocates 4GB of memory to the Node process to prevent out-of-memory errors during compilation.
# --verbose: Provides detailed output to help debug the build process.
RUN node --max-old-space-size=4096 ./node_modules/nx/bin/nx.js build admin-web --verbose

FROM node:20-alpine
WORKDIR /app

# Copy the built output from the builder stage
# NOTE: This assumes the build output for 'admin-web' includes necessary assets and production dependencies.
COPY --from=builder /app/dist/apps/admin-web ./

# Expose the port your server listens on (e.g., if it's an SSR app)
EXPOSE 3000

# Specify the entry point for your Node.js server
CMD ["node", "server.js"]