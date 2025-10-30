import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { flashSaleMongoModel, orderMongoModel } from '@flash-sale/shared-types';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`;
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`;

type ConfirmBody = {
  email: string;
  flashSaleId: string; // string ObjectId is fine with Mongoose
  totalAmount?: number;
};

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);

  app.post<{ Body: ConfirmBody }>(
    '/confirm',
    {
      schema: {
        tags: ['Orders'],
        summary:
          'Confirm payment → atomic decrement, create order, clear hold (within sale window only)',
        body: {
          type: 'object',
          required: ['email', 'flashSaleId'],
          properties: {
            email: { type: 'string', format: 'email' },
            flashSaleId: { type: 'string' },
            totalAmount: { type: 'number' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              orderId: { type: 'string' },
              inventoryLeft: { type: 'number' },
            },
            required: ['ok', 'orderId'],
          },
          410: { type: 'object', properties: { message: { type: 'string' } } }, // reservation expired
          409: { type: 'object', properties: { message: { type: 'string' } } }, // sold out / outside window / duplicate
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: ConfirmBody }>,
      reply: FastifyReply
    ) {
      try {
        const { email, flashSaleId, totalAmount = 0 } = request.body;
        const now = new Date();

        // 1) Require active hold
        const ttl = await redis.ttl(holdKey(flashSaleId, email));
        if (ttl <= 0) {
          return reply
            .code(410)
            .send({ message: 'Reservation expired or not found' });
        }

        // 2) Idempotency: already paid?
        const existingPaid = await orderMongoModel
          .findOne({
            userEmail: email,
            flashSaleId,
            paymentStatus: 'paid',
          })
          .lean();

        if (existingPaid) {
          return reply.code(200).send({
            ok: true,
            orderId: String(existingPaid._id),
            inventoryLeft: undefined,
          });
        }

        // 3) Pre-check: sale must exist AND be within window
        const sale = await flashSaleMongoModel
          .findOne(
            { _id: flashSaleId },
            { startsAt: 1, endsAt: 1, currentQuantity: 1 }
          )
          .lean();

        if (!sale) {
          return reply.code(409).send({ message: 'Sale not found' });
        }
        if (!(sale.startsAt <= now && now <= sale.endsAt)) {
          return reply
            .code(409)
            .send({ message: 'Purchase not allowed outside sale window' });
        }

        // 4) Atomic decrement of currentQuantity if > 0 AND still within window (race-safe)
        const updated = await flashSaleMongoModel
          .findOneAndUpdate(
            {
              _id: flashSaleId,
              currentQuantity: { $gt: 0 },
              startsAt: { $lte: now },
              endsAt: { $gte: now },
            },
            { $inc: { currentQuantity: -1 }, $set: { updatedAt: new Date() } },
            { new: true, projection: { currentQuantity: 1 } }
          )
          .lean();

        if (!updated) {
          // Either sold out or window closed between checks
          return reply.code(409).send({ message: 'Sold out or window closed' });
        }

        // 5) Upsert/mark order as PAID (unique on {userEmail, flashSaleId})
        const order = await orderMongoModel
          .findOneAndUpdate(
            { userEmail: email, flashSaleId },
            {
              $setOnInsert: {
                userEmail: email,
                flashSaleId,
                createdAt: new Date(),
              },
              $set: {
                paymentStatus: 'paid',
                totalAmount,
                updatedAt: new Date(),
              },
            },
            { upsert: true, new: true }
          )
          .lean();

        // 6) Clear hold + remove from queue zset (best-effort)
        await redis
          .multi()
          .del(holdKey(flashSaleId, email))
          .zrem(zsetKey(flashSaleId), email)
          .exec();

        reply.code(200).send({
          ok: true,
          orderId: String(order!._id),
          inventoryLeft: updated.currentQuantity ?? undefined,
        });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to confirm order' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}
