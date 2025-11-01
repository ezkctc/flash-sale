FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npx nx build admin-web

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist/apps/admin-web ./
EXPOSE 3000
CMD ["node", "server.js"]
