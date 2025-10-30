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
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        const now = new Date();
        const { flashSaleId } = request.query;

        let item: any = null;

        if (flashSaleId) {
          item = await flashSaleMongoModel.findById(flashSaleId).lean();
          const meta = computeStatus(item, now);
          return reply.code(200).send({ item, meta });
        }

        // No id provided → current first, else next upcoming (your original logic)
        item = await flashSaleMongoModel
          .findOne({
            startsAt: { $lte: now },
            endsAt: { $gte: now },
            status: 'OnSchedule',
          })
          .sort({ startsAt: 1 })
          .lean();

        if (!item) {
          item = await flashSaleMongoModel
            .findOne({ startsAt: { $gt: now }, status: 'OnSchedule' })
            .sort({ startsAt: 1 })
            .lean();
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
