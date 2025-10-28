import type { FastifyInstance } from 'fastify';

async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness probe',
        description: 'Checks if the API is up',
        security: [],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
            },
            required: ['status'],
          },
        },
      },
    },
    async () => ({ status: 'ok' })
  );
}

export default healthRoutes as any;
