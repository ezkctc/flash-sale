# Local Development Setup

This repo runs MongoDB and Redis locally via Docker Compose and serves:

- Fastify API (Gatekeeper)
- BullMQ Worker (Consumer)

The Better Auth CLI schema steps are not applicable for MongoDB. Skip generate/migrate.

## Prerequisites

- Node.js + npm
- Docker + Docker Compose

## 1) Start Infra (MongoDB + Redis)

- `npm run infra:up`
  - Redis: `redis://:redispass@localhost:6379`
  - Mongo: `mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin`

## 2) Configure Environment

- See `.env` / `env.sample` for:
  - `MONGODB_URL`, `MONGODB_URI`, `MONGO_DB`
  - `REDIS_URL`
  - `BEND_HOST`, `BEND_PORT`
  - `QUEUE_NAME`

## 3) Run Services

- API (Gatekeeper): `npm run dev` (brings up infra then serves API)
- Worker (Consumer): `npm run dev:worker`

## 4) Seeding Admin User

- `npm run seed:admin` (email: admin@email.com, password: admin)

## Notes

- Auth endpoints are under `/auth/*` and documented in `/docs` (Swagger).
- Flash Sale CRUD routes require login.
