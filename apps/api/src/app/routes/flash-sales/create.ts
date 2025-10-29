import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

type CreateBody = {
  name: string;
  description?: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  inventory: { start: number; current: number };
  productId?: string;
  status?: string;
};

export default async function (app: FastifyInstance) {
  app.post<{ Body: CreateBody }>(
    '/',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales'],
        summary: 'Create flash sale',
        body: {
          type: 'object',
          required: ['name', 'startsAt', 'endsAt', 'inventory'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },
            inventory: {
              type: 'object',
              required: ['start', 'current'],
              properties: {
                start: { type: 'number' },
                current: { type: 'number' },
              },
            },
            productId: { type: 'string' },
            status: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: CreateBody }>,
      reply: FastifyReply
    ) {
      try {
        const body = request.body;
        const now = new Date();

        const created = await flashSaleMongoModel.create({
          ...body,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          createdAt: now,
          updatedAt: now,
        });

        reply.code(201).send({ id: String(created._id) });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to create flash sale' });
      }
    }
  );
}
