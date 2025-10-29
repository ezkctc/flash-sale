import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

export default async function (app: FastifyInstance) {
  app.get(
    '/public/next',
    {
      schema: {
        tags: ['Flash Sales (Public)'],
        summary: 'Get current flash sale or the next upcoming',
        response: {
          200: {
            type: 'object',
            properties: { item: { type: 'object', nullable: true } },
            required: ['item'],
          },
        },
      },
    },
    async function (_request: FastifyRequest, reply: FastifyReply) {
      try {
        const now = new Date();

        let item =
          (await flashSaleMongoModel
            .findOne({
              startsAt: { $lte: now },
              endsAt: { $gte: now },
            })
            .sort({ startsAt: 1 })
            .lean()) || null;

        if (!item) {
          item =
            (await flashSaleMongoModel
              .findOne({ startsAt: { $gt: now } })
              .sort({ startsAt: 1 })
              .lean()) || null;
        }

        reply.code(200).send({ item });
      } catch (error) {
        _request.log.error(error);
        reply.code(500).send({ message: 'Failed to fetch public flash sale' });
      }
    }
  );
}
