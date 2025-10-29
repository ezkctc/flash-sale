import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuth } from '../lib/auth';
import { env } from '../lib/env';

declare module 'fastify' {
  interface FastifyInstance {
    auth: ReturnType<typeof createAuth>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  const apiOrigin = `http://${env.BEND_HOST}:${env.BEND_PORT}`;
  const clientOrigins = (
    process.env.CLIENT_ORIGINS ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const auth = createAuth({
    db: fastify.mongo.db,
    apiOrigin,
    clientOrigins,
    secureCookies: apiOrigin.startsWith('https://'),
  });

  fastify.decorate('auth', auth);
}

export default fp(authPlugin, { name: 'auth', dependencies: ['mongo'] });
