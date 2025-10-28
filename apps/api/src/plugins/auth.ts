import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuth } from '../lib/auth';

declare module 'fastify' {
  interface FastifyInstance {
    auth: ReturnType<typeof createAuth>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  const auth = createAuth(fastify.mongo.db);
  fastify.decorate('auth', auth);
}

export default fp(authPlugin, { name: 'auth', dependencies: ['mongo'] });

