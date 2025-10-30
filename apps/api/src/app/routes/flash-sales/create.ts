import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus, FlashSaleShape } from '@flash-sale/shared-types'; // adjust path if different

export default async function (app: FastifyInstance) {
  app.post<{ Body: FlashSaleShape }>(
    '/',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Flash Sales', 'Admin'],
        summary: 'Create flash sale',
        body: {
          type: 'object',
          required: [
            'startsAt',
            'endsAt',
            'startingQuantity',
            'currentQuantity',
          ],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },

            // strictly positive numbers
            startingQuantity: { type: 'number', exclusiveMinimum: 0 },
            currentQuantity: { type: 'number', exclusiveMinimum: 0 },

            productId: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(FlashSaleStatus),
              default: FlashSaleStatus.OnSchedule,
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
          400: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
          409: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: FlashSaleShape }>,
      reply: FastifyReply
    ) {
      try {
        const body = request.body;

        // Parse & validate dates
        const startsAt = new Date(body.startsAt);
        const endsAt = new Date(body.endsAt);
        if (
          Number.isNaN(startsAt.getTime()) ||
          Number.isNaN(endsAt.getTime())
        ) {
          return reply.code(400).send({ message: 'Invalid startsAt/endsAt' });
        }
        if (endsAt <= startsAt) {
          return reply
            .code(400)
            .send({ message: 'endsAt must be after startsAt' });
        }

        // Enforce strictly positive quantities (defense-in-depth vs AJV)
        const startingQuantity = body.startingQuantity ?? 0;
        const currentQuantity = body.currentQuantity ?? startingQuantity;
        if (startingQuantity <= 0 || currentQuantity <= 0) {
          return reply.code(400).send({ message: 'Quantities must be > 0' });
        }

        // Determine status (default OnSchedule)
        const status = body.status ?? FlashSaleStatus.OnSchedule;

        // Block overlaps with existing OnSchedule flash sales.
        // Overlap rule: existing.startsAt < new.endsAt AND existing.endsAt > new.startsAt
        if (status === FlashSaleStatus.OnSchedule) {
          const overlapFilter: Record<string, any> = {
            status: FlashSaleStatus.OnSchedule,
            startsAt: { $lt: endsAt },
            endsAt: { $gt: startsAt },
          };
          // If productId is provided, scope overlap to the same product
          if (body.productId) overlapFilter.productId = body.productId;

          const existsOverlap = await flashSaleMongoModel.exists(overlapFilter);
          if (existsOverlap) {
            return reply.code(409).send({
              message:
                'Overlapping OnSchedule flash sale exists for the given time range' +
                (body.productId ? ' (same product)' : ''),
            });
          }
        }

        const created = await flashSaleMongoModel.create({
          name: body.name,
          description: body.description,
          startsAt,
          endsAt,
          startingQuantity,
          currentQuantity,
          productId: body.productId,
          status,
        });

        return reply.code(201).send({ id: String(created._id) });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Failed to create flash sale' });
      }
    }
  );
}
