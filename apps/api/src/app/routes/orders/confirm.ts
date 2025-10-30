import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { flashSaleMongoModel, orderMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus } from '@flash-sale/shared-types';
import IORedis from 'ioredis';
import mongoose from 'mongoose';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`;
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`;

type ConfirmBody = {
  email: string;
  flashSaleId: string; // string ObjectId fine for Mongoose
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
          'Confirm purchase (requires active hold), decrements inventory atomically',
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
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: ConfirmBody }>,
      reply: FastifyReply
    ) => {
      const session = await mongoose.startSession();
      try {
        const email = request.body.email?.trim().toLowerCase();
        const flashSaleId = request.body.flashSaleId;
        const totalAmount = request.body.totalAmount ?? 0;

        if (!email || !flashSaleId) {
          return reply
            .code(400)
            .send({ message: 'Email and flashSaleId are required' });
        }

        // Must have an active hold
        const pttl = await redis.pttl(holdKey(flashSaleId, email));
        if (pttl <= 0 && pttl !== -1) {
          return reply.code(409).send({ message: 'Hold expired or not found' });
        }

        const now = new Date();

        // Atomically decrement inventory with guards (status/time/qty)
        session.startTransaction();

        const updated = await flashSaleMongoModel.findOneAndUpdate(
          {
            _id: flashSaleId,
            status: FlashSaleStatus.OnSchedule,
            startsAt: { $lte: now },
            endsAt: { $gt: now },
            currentQuantity: { $gt: 0 },
          },
          { $inc: { currentQuantity: -1 } },
          { new: true, session, projection: { currentQuantity: 1 } }
        );

        if (!updated) {
          await session.abortTransaction();
          return reply
            .code(409)
            .send({ message: 'Out of stock or not active' });
        }

        // Create order document (adjust to your schema)
        const order = await orderMongoModel.create(
          [
            {
              email,
              flashSaleId,
              totalAmount,
              status: 'paid', // or 'confirmed'
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session }
        );

        await session.commitTransaction();

        // Cleanup: delete hold and visible queue entry
        await Promise.all([
          redis.del(holdKey(flashSaleId, email)),
          redis.zrem(zsetKey(flashSaleId), email),
        ]);

        return reply.code(200).send({
          ok: true,
          orderId: String(order[0]!._id),
          inventoryLeft: updated.currentQuantity ?? undefined,
        });
      } catch (err) {
        await session.abortTransaction().catch(() => {});
        request.log.error(err);
        return reply.code(500).send({ message: 'Failed to confirm order' });
      } finally {
        session.endSession();
      }
    }
  );

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}
