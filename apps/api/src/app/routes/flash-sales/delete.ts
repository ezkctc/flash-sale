import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type Params = { id: string };

export default async function (app: FastifyInstance) {
  app.delete<{ Params: Params }>(
    '/:id',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales'],
        summary: 'Delete flash sale',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        response: {
          200: { type: 'object', properties: { deleted: { type: 'number' } } },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply
    ) {
      try {
        const res = await flashSaleMongoModel.deleteOne({
          _id: request.params.id,
        });
        reply.code(200).send({ deleted: res.deletedCount ?? 0 });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to delete flash sale' });
      }
    }
  );
}
