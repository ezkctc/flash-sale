import type { FastifyInstance } from 'fastify';

const ordersRoutes = async (app: FastifyInstance) => {
  app.get(
    '/',
    {
      schema: {
        tags: ['Orders'],
        summary: 'List orders',
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              page: { type: 'number' },
              pageSize: { type: 'number' },
              total: { type: 'number' },
            },
            required: ['items', 'page', 'pageSize', 'total'],
          },
        },
      },
    },
    async () => ({ items: [], page: 1, pageSize: 50, total: 0 })
  );

  app.post(
    '/',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Create order',
        body: { type: 'object', additionalProperties: true },
        response: {
          200: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    },
    async () => ({ id: 'new-order-id' })
  );
};

export default ordersRoutes;
