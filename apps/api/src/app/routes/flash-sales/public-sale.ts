import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type Query = {
  flashSaleId?: string; // optional: if provided, check that specific sale's status
};

function computeStatus(doc: any, now = new Date()) {
  if (!doc) return { status: 'not_found' as const };
  const startsAt = new Date(doc.startsAt);
  const endsAt = new Date(doc.endsAt);

  let status: 'ongoing' | 'upcoming' | 'ended';
  if (startsAt <= now && now <= endsAt) status = 'ongoing';
  else if (now < startsAt) status = 'upcoming';
  else status = 'ended';

  const starting = Number(doc.startingQuantity ?? 0);
  const current = Number(doc.currentQuantity ?? 0);
  const soldOut = current <= 0;
  const progress =
    starting > 0
      ? { remaining: current, starting, ratio: current / starting }
      : undefined;

  return {
    status,
    soldOut,
    progress,
    startsAt,
    endsAt,
  };
}

export default async function (app: FastifyInstance) {
  app.get<{ Querystring: Query }>(
    '/public/sale',
    {
      schema: {
        tags: ['Flash Sales (Public)'],
        summary:
          'Get sale + computed status. If flashSaleId is provided, checks that sale; otherwise returns current or next upcoming.',
        querystring: {
          type: 'object',
          properties: {
            flashSaleId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              item: { type: 'object', nullable: true },
              meta: {
                type: 'object',
                properties: {
                  status: { type: 'string' }, // ongoing | upcoming | ended | not_found
                  soldOut: { type: 'boolean', nullable: true },
                  progress: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      remaining: { type: 'number' },
                      starting: { type: 'number' },
                      ratio: { type: 'number' },
                    },
                  },
                  startsAt: { type: 'string', nullable: true },
                  endsAt: { type: 'string', nullable: true },
                },
                required: ['status'],
              },
            },
            required: ['item', 'meta'],
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        const now = new Date();
        const { flashSaleId } = request.query;

        // Fields we actually need for status
        const projection = {
          name: 1,
          description: 1,
          startsAt: 1,
          endsAt: 1,
          currentQuantity: 1,
          startingQuantity: 1,
          status: 1,
          productId: 1,
        } as const;

        let item: any = null;

        if (flashSaleId) {
          item = await flashSaleMongoModel
            .findById(flashSaleId, projection)
            .lean();
          const meta = computeStatus(item, now);
          return reply.code(200).send({ item, meta });
        }

        // No id provided → current first, else next upcoming (your original logic)
        item =
          (await flashSaleMongoModel
            .findOne(
              { startsAt: { $lte: now }, endsAt: { $gte: now } },
              projection
            )
            .sort({ startsAt: 1 })
            .lean()) || null;

        if (!item) {
          item =
            (await flashSaleMongoModel
              .findOne({ startsAt: { $gt: now } }, projection)
              .sort({ startsAt: 1 })
              .lean()) || null;
        }

        const meta = computeStatus(item, now);
        reply.code(200).send({ item, meta });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to fetch sale status' });
      }
    }
  );
}
