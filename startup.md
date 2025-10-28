# Startup

## Initialize MongoDB

The project uses Better Auth with the MongoDB adapter, which does not require SQL schema generation or migrations.

- Ensure MongoDB is running (use `npm run mongo:start`).
- Set `MONGODB_URI` and `MONGO_DB` in `.env` (see `env.sample`).
- Start the API: `npm run dev:api` or `npm run dev`.

Note: `@better-auth/cli generate` and `migrate` are only for SQL adapters (e.g., Drizzle/Prisma). They are not applicable for the MongoDB adapter and will error with “mongodb-adapter is not supported”.
