import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type Params = { id: string };
type UpdateBody = Record<string, any>;

export default async function (app: FastifyInstance) {
  app.put<{ Params: Params; Body: UpdateBody }>(
    '/:id',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales', 'Admin'],
        summary: 'Update flash sale',
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: { type: 'object', additionalProperties: true },
        response: {
          200: { type: 'object', properties: { updated: { type: 'number' } } },
          404: { type: 'object', properties: { message: { type: 'string' } } },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Params: Params; Body: UpdateBody }>,
      reply: FastifyReply
    ) {
      try {
        const update: any = { ...request.body, updatedAt: new Date() };
        if (update.startsAt) update.startsAt = new Date(update.startsAt);
        if (update.endsAt) update.endsAt = new Date(update.endsAt);

        const res = await flashSaleMongoModel.updateOne(
          { _id: request.params.id },
          { $set: update }
        );

        if (!res.matchedCount)
          return reply.code(404).send({ message: 'Not found' });
        reply.code(200).send({ updated: res.modifiedCount });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to update flash sale' });
      }
    }
  );
}
