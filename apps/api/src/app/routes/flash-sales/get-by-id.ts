import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type Params = { id: string };

export default async function (app: FastifyInstance) {
  app.get<{ Params: Params }>(
    '/:id',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales', 'Admin'],
        summary: 'Get flash sale by id',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { message: { type: 'string' } } },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply
    ) {
      try {
        const doc = await flashSaleMongoModel
          .findById(request.params.id)
          .lean();
        if (!doc) return reply.code(404).send({ message: 'Not found' });
        reply.code(200).send(doc);
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to get flash sale' });
      }
    }
  );
}
