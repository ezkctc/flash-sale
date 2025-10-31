import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { orderMongoModel } from '@flash-sale/shared-types';

type Query = {
  email: string; // required
  page?: number; // default 1
  limit?: number; // default 20, max 100
};

export default async function (app: FastifyInstance) {
  app.get<{ Querystring: Query }>(
    '/by-email',
    {
      schema: {
        tags: ['Orders'],
        summary: 'User: get orders by email (paginated, latest first)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        // normalize email for consistent querying
        const email = decodeURIComponent(request.query.email).trim();
        const page = Math.max(1, Number(request.query.page ?? 1));
        const raw = Number(request.query.limit ?? 20);
        const limit = Math.min(100, Math.max(1, raw));
        const skip = (page - 1) * limit;

        const filter = { userEmail: email };

        const items = await orderMongoModel
          .find(filter)
          .sort({ createdAt: -1 }) // latest first
          .skip(skip)
          .limit(limit)
          .lean();
        const total = await orderMongoModel.countDocuments(filter);

        return reply.code(200).send({ items, total, page, limit });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Failed to fetch user orders' });
      }
    }
  );
}
