import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { flashSaleMongoModel, orderMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus } from '@flash-sale/shared-types';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900); // 15 mins

type ConfirmBody = {
  email: string;
  flashSaleId: string;
  totalAmount?: number;
};

const claimKey = (flashSaleId: string, email: string) =>
  `fshc:${flashSaleId}:${email}`;

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
          additionalProperties: false,
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
            additionalProperties: false,
            properties: {
              ok: { type: 'boolean' },
              orderId: { type: 'string' },
              inventoryLeft: { type: 'number', nullable: true },
            },
            required: ['ok', 'orderId'],
          },
          403: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
          409: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: ConfirmBody }>,
      reply: FastifyReply
    ) => {
      const email = request.body.email?.trim().toLowerCase();
      const flashSaleId = request.body.flashSaleId?.trim();
      const totalAmount = request.body.totalAmount ?? 0;
      const now = new Date();

      if (!email || !flashSaleId) {
        return reply
          .code(400)
          .send({ message: 'Email and flashSaleId are required' });
      }

      try {
        // 1) Verify active hold (treat -1 as active defensively)
        const pttl = await redis.pttl(holdKey(flashSaleId, email)); // -2 no key, -1 no expiry, >=0 ms
        const holdActive = pttl > 0 || pttl === -1;
        if (!holdActive) {
          return reply
            .code(403)
            .send({ message: 'No active hold found or hold has expired' });
        }

        // 2) Claim this hold exactly once (idempotency)
        //    If another confirm already proceeded, this will fail.
        const seconds = Math.max(60, Math.min(300, HOLD_TTL_SECONDS));
        const claim = await redis.set(
          claimKey(flashSaleId, email),
          '1',
          'EX',
          seconds,
          'NX'
        );
        if (claim !== 'OK') {
          return reply
            .code(409)
            .send({ message: 'Order already being confirmed' });
        }

        // 3) Transactionally decrement inventory and create order
        const session = await mongoose.startSession();
        try {
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
            {
              session,
              projection: { currentQuantity: 1 },
              returnDocument: 'after',
            }
          );

          if (!updated) {
            await session.abortTransaction();
            return reply
              .code(409)
              .send({ message: 'Out of stock or not active' });
          }

          const [order] = await orderMongoModel.create(
            [
              {
                email,
                flashSaleId,
                totalAmount,
                paymentStatus: 'paid',
                createdAt: now,
                updatedAt: now,
              },
            ],
            { session }
          );

          await session.commitTransaction();

          // 4) Best-effort cleanup (outside txn)
          await Promise.allSettled([
            redis.del(holdKey(flashSaleId, email)), // consume hold
            redis.zrem(zsetKey(flashSaleId), email), // remove from visible queue if still present
          ]);

          return reply.code(200).send({
            ok: true,
            orderId: String(order._id),
            inventoryLeft: updated.currentQuantity ?? undefined,
          });
        } catch (e) {
          // Abort only if a transaction is active
          if (session.inTransaction()) {
            try {
              await session.abortTransaction();
            } catch {
              // ignore
            }
          }
          request.log.error(e);
          return reply.code(500).send({ message: 'Failed to confirm order' });
        } finally {
          try {
            await session.endSession();
          } catch {
            // ignore
          }
        }
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ message: 'Failed to confirm order' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}
