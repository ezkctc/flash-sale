import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

export default async function (app: FastifyInstance) {
  app.get(
    '/',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales', 'Admin'],
        summary: 'List flash sales',
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object' } },
              total: { type: 'number' },
            },
            required: ['items', 'total'],
          },
        },
      },
    },
    async function (_request: FastifyRequest, reply: FastifyReply) {
      try {
        const items = await flashSaleMongoModel
          .find({})
          .sort({ createdAt: -1 })
          .lean();
        const total = await flashSaleMongoModel.countDocuments({});
        reply.code(200).send({ items, total });
      } catch (error) {
        _request.log.error(error);
        reply.code(500).send({ message: 'Failed to list flash sales' });
      }
    }
  );
}
