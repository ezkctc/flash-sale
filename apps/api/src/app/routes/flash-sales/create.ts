import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import { flashSaleMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus, FlashSaleShape } from '@flash-sale/shared-types'; // adjust path if different
import { Types } from 'mongoose';

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
          required: ['startsAt', 'endsAt'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time' },

            // New schema fields
            startingQuantity: { type: 'number' },
            currentQuantity: { type: 'number' },

            // Back-compat block
            inventory: {
              type: 'object',
              additionalProperties: false,
              properties: {
                start: { type: 'number' },
                current: { type: 'number' },
              },
              required: ['start', 'current'],
            },

            productId: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(FlashSaleStatus),
            },
          },
          oneOf: [
            // Allow either new fields…
            { required: ['startingQuantity', 'currentQuantity'] },
            // …or legacy inventory
            { required: ['inventory'] },
          ],
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

        // Map quantities: prefer new fields, fallback to legacy inventory
        const startingQuantity = body.startingQuantity ?? 0;

        const currentQuantity = body.currentQuantity ?? startingQuantity ?? 0;

        if (startingQuantity < 0 || currentQuantity < 0) {
          return reply.code(400).send({ message: 'Quantities must be >= 0' });
        }

        // Validate status if provided against enum
        let status: FlashSaleStatus | undefined;
        if (body.status !== undefined) {
          const val = String(body.status) as FlashSaleStatus;
          if (!Object.values(FlashSaleStatus).includes(val)) {
            return reply.code(400).send({ message: 'Invalid status' });
          }
          status = val;
        }

        const created = await flashSaleMongoModel.create({
          name: body.name, // Mongoose will default if missing
          description: body.description, // Mongoose will default if missing
          startsAt,
          endsAt,
          startingQuantity,
          currentQuantity,
          status, // let Mongoose default if undefined
        });

        return reply.code(201).send({ id: String(created._id) });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Failed to create flash sale' });
      }
    }
  );
}
