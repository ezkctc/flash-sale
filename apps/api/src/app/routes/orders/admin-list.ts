import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { orderMongoModel } from '@flash-sale/shared-types';

type Query = {
  page?: number; // default 1
  limit?: number; // default 20, max 100
  userEmail?: string; // optional filter
  flashSaleId?: string; // optional filter
};

export default async function (app: FastifyInstance) {
  app.get<{ Querystring: Query }>(
    '/admin/list-admin',
    {
      preHandler: authGuard(app), // protect admin list
      schema: {
        tags: ['Orders', 'Admin'],
        summary:
          'Admin: list orders (filter by userEmail, flashSaleId) with pagination',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            userEmail: { type: 'string' },
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
        const page = Math.max(1, Number(request.query.page ?? 1));
        const rawLimit = Number(request.query.limit ?? 20);
        const limit = Math.min(100, Math.max(1, rawLimit));
        const skip = (page - 1) * limit;

        const filter: Record<string, any> = {};
        if (request.query.userEmail) filter.userEmail = request.query.userEmail;
        if (request.query.flashSaleId)
          filter.flashSaleId = request.query.flashSaleId;

        const [items, total] = await Promise.all([
          orderMongoModel
            .find(filter)
            .sort({ createdAt: -1 }) // latest first
            .skip(skip)
            .limit(limit)
            .lean(),
          orderMongoModel.countDocuments(filter),
        ]);

        reply.code(200).send({ items, total, page, limit });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to list orders' });
      }
    }
  );
}
