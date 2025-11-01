# -------- Build stage --------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx nx build site-web

# -------- Runtime stage --------
FROM node:20-alpine
WORKDIR /app


COPY --from=builder /app/dist/apps/site-web ./

EXPOSE 3000

CMD ["node", "server.js"]
