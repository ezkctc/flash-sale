import type { FastifyInstance } from 'fastify';

const flashSalesRoutes = async (app: FastifyInstance) => {
  app.get(
    '/',
    {
      schema: {
        tags: ['Flash Sales'],
        summary: 'List flash sales',
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
        tags: ['Flash Sales'],
        summary: 'Create flash sale',
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
    async () => ({ id: 'new-flash-sale-id' })
  );
};

export default flashSalesRoutes;
