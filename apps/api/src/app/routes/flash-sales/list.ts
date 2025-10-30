import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type ListQuery = {
  page?: number; // 1-based
  pageSize?: number; // 1..200
  q?: string; // name search
  status?: string; // exact match
  from?: string; // ISO date; filter startsAt >= from
  to?: string; // ISO date; filter endsAt   <= to
  sort?: 'createdAt' | 'startsAt' | 'endsAt' | 'name' | 'status';
  order?: 'asc' | 'desc';
};

export default async function (app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    '/',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales', 'Admin'],
        summary: 'List flash sales',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: {
              type: 'integer',
              minimum: 1,
              maximum: 200,
              default: 20,
            },
            q: { type: 'string' },
            status: { type: 'string' },
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            sort: {
              type: 'string',
              enum: ['createdAt', 'startsAt', 'endsAt', 'name', 'status'],
              default: 'createdAt',
            },
            order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: ListQuery }>,
      reply: FastifyReply
    ) {
      try {
        const {
          page = 1,
          pageSize = 20,
          q,
          status,
          from,
          to,
          sort = 'createdAt',
          order = 'desc',
        } = request.query || {};

        // Build filter
        const filter: Record<string, any> = {};
        if (q) filter.name = { $regex: q, $options: 'i' };
        if (status) filter.status = status;

        // Date window (optional)
        // If only 'from' is given, filter by startsAt >= from
        // If only 'to' is given, filter by endsAt   <= to
        // If both, apply both
        const fromDate = from ? new Date(from) : undefined;
        const toDate = to ? new Date(to) : undefined;

        if (fromDate && Number.isNaN(fromDate.getTime())) {
          return reply.code(400).send({ message: 'Invalid `from` date-time' });
        }
        if (toDate && Number.isNaN(toDate.getTime())) {
          return reply.code(400).send({ message: 'Invalid `to` date-time' });
        }

        if (fromDate) {
          filter.startsAt = { ...(filter.startsAt || {}), $gte: fromDate };
        }
        if (toDate) {
          filter.endsAt = { ...(filter.endsAt || {}), $lte: toDate };
        }

        const limit = Math.min(Math.max(pageSize, 1), 200);
        const skip = (Math.max(page, 1) - 1) * limit;

        const sortSpec: Record<string, 1 | -1> = {
          [sort]: order === 'asc' ? 1 : -1,
        };

        console.log('filter', filter);

        const [items, total] = await Promise.all([
          flashSaleMongoModel
            .find(filter)
            .sort(sortSpec)
            .skip(skip)
            .limit(limit)
            .lean(),
          flashSaleMongoModel.countDocuments(filter),
        ]);

        return reply.code(200).send({
          items,
          total,
          page: Math.max(page, 1),
          pageSize: limit,
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Failed to list flash sales' });
      }
    }
  );
}
