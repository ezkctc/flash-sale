import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { orderMongoModel, flashSaleMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus } from '@flash-sale/shared-types';
import { Redis } from 'ioredis';
import mongoose, { Types } from 'mongoose';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);

// Idempotent confirm gate (prevents double submit)
const claimKey = (flashSaleId: string, email: string) =>
  `fshc:${flashSaleId}:${email}`;

// Mark a hold as consumed (so release_hold won’t INCR Redis)
const consumedKey = (flashSaleId: string, email: string) =>
  `fshp:${flashSaleId}:${email}`;

type ConfirmBody = {
  email: string;
  flashSaleId: string;
  totalAmount?: number;
};

export default async function (app: FastifyInstance) {
  const redis = new Redis(REDIS_URL);

  app.post<{ Body: ConfirmBody }>(
    '/confirm',
    {
      schema: {
        tags: ['Orders'],
        summary:
          'Confirm purchase (requires active hold). Decrements Mongo currentQuantity; Redis was decremented at hold time.',
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
            additionalProperties: false,
            properties: {
              message: { type: 'string' },
              claimTtlSec: { type: 'number' },
              holdTtlSec: { type: 'number' },
              pttlRaw: { type: 'number' },
            },
            required: ['message'],
          },
          500: {
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

      // Prepare an _id filter that supports ObjectId or string schemas
      const isObjId = Types.ObjectId.isValid(flashSaleId);
      const flashSaleIdValue: any = isObjId
        ? new Types.ObjectId(flashSaleId)
        : flashSaleId;

      try {
        // 1) Must have an active hold
        const holdVal = await redis.get(holdKey(flashSaleId, email));
        if (!holdVal) {
          return reply
            .code(403)
            .send({ message: 'No active hold or it has expired' });
        }

        // 2) One purchase per user per sale (fast path)
        const existingOrder = await orderMongoModel
          .findOne({ email, flashSaleId: flashSaleIdValue }, { _id: 1 })
          .lean();
        if (existingOrder) {
          return reply
            .code(200)
            .send({ ok: true, orderId: String(existingOrder._id) });
        }

        // 3) Idempotent confirm gate (prevents double-click race)
        const claimTtlSec = Math.max(60, Math.min(300, HOLD_TTL_SECONDS));
        const claimSet = await redis.set(
          claimKey(flashSaleId, email),
          '1',
          'EX',
          claimTtlSec,
          'NX'
        );

        if (claimSet !== 'OK') {
          // If an order was already created in a parallel confirm, return it
          const orderNow = await orderMongoModel
            .findOne({ email, flashSaleId: flashSaleIdValue }, { _id: 1 })
            .lean();
          if (orderNow) {
            return reply
              .code(200)
              .send({ ok: true, orderId: String(orderNow._id) });
          }

          const claimPttl = await redis.pttl(claimKey(flashSaleId, email));
          const holdPttl = await redis.pttl(holdKey(flashSaleId, email));
          return reply.code(409).send({
            message: 'Order is already being confirmed',
            claimTtlSec: claimPttl > 0 ? Math.ceil(claimPttl / 1000) : 0,
            holdTtlSec: holdPttl > 0 ? Math.ceil(holdPttl / 1000) : 0,
            pttlRaw: holdPttl,
          });
        }

        // 4) Atomic stock decrement + order creation (no transactions; compensate on failure)
        let orderId: string | undefined;
        try {
          const updated = await flashSaleMongoModel.findOneAndUpdate(
            {
              _id: flashSaleIdValue,
              // status: FlashSaleStatus.OnSchedule,
              startsAt: { $lte: now },
              endsAt: { $gt: now },
              currentQuantity: { $gt: 0 },
            },
            { $inc: { currentQuantity: -1 } },
            {
              projection: { currentQuantity: 1 },
              returnDocument: 'after',
            }
          );

          if (!updated) {
            // Out of stock or not in schedule window
            await redis.del(claimKey(flashSaleId, email)); // allow retry
            return reply
              .code(409)
              .send({ message: 'Out of stock or sale not active' });
          }

          try {
            const created = await orderMongoModel.create({
              userEmail: email,
              flashSaleId: flashSaleIdValue,
              flashSaleName: updated.name,
              totalAmount,
              paymentStatus: 'paid',
              createdAt: now,
              updatedAt: now,
            });
            orderId = String(created._id);
          } catch (orderErr) {
            // Compensate inventory on failure
            await flashSaleMongoModel
              .updateOne(
                { _id: flashSaleIdValue },
                { $inc: { currentQuantity: 1 } }
              )
              .catch(() => {});
            await redis.del(claimKey(flashSaleId, email)); // allow retry
            request.log.error(orderErr);
            return reply.code(500).send({ message: 'Failed to confirm order' });
          }
        } catch (e) {
          await redis.del(claimKey(flashSaleId, email)); // allow retry
          request.log.error(e);
          return reply.code(500).send({ message: 'Failed to confirm order' });
        }

        // 5) Mark this hold as consumed so any delayed release job will NOT INCR Redis
        // ⚠️ IMPORTANT: keep consumed flag alive at least as long as the hold TTL (plus small buffer)
        await redis.set(
          consumedKey(flashSaleId, email),
          '1',
          'EX',
          HOLD_TTL_SECONDS + 120
        );

        // 6) Cleanup: remove hold; remove from visible queue if still present; drop claim lock
        await Promise.allSettled([
          redis.del(holdKey(flashSaleId, email)),
          redis.zrem(zsetKey(flashSaleId), email),
          redis.del(claimKey(flashSaleId, email)),
        ]);

        return reply.code(200).send({ ok: true, orderId: orderId! });
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
