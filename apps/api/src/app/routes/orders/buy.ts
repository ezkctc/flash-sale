import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';
import { orderMongoModel } from '@flash-sale/shared-types';

const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_PREFIX = process.env.BULLMQ_PREFIX ?? 'flashsale';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900); // 15 minutes

type BuyBody = { email: string; flashSaleId: string };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, {
    connection: { url: REDIS_URL },
    prefix: QUEUE_PREFIX,
  });

  app.post<{ Body: BuyBody }>(
    '/buy',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Queue a purchase attempt and return live queue position',
        body: {
          type: 'object',
          required: ['email', 'flashSaleId'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email' },
            flashSaleId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              queued: { type: 'boolean' },
              position: { type: 'number' },
              size: { type: 'number' },
              hasActiveHold: { type: 'boolean' },
              holdTtlSec: { type: 'number' },
              jobId: { type: 'string' },
              email: { type: 'string' },
              flashSaleId: { type: 'string' },
              queueName: { type: 'string' },
              queuePrefix: { type: 'string' },
              redisUrl: { type: 'string' },
              zsetKey: { type: 'string' },
            },
            required: [
              'queued',
              'position',
              'size',
              'hasActiveHold',
              'holdTtlSec',
              'email',
              'flashSaleId',
              'queueName',
              'queuePrefix',
              'redisUrl',
              'zsetKey',
            ],
          },
          409: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              orderId: { type: 'string' },
            },
            required: ['message'],
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BuyBody }>, reply: FastifyReply) => {
      const email = request.body.email?.trim().toLowerCase();
      const flashSaleId = request.body.flashSaleId?.trim();
      if (!email || !flashSaleId) {
        return reply
          .code(400)
          .send({ message: 'Email and flashSaleId are required' });
      }

      const nowMs = Date.now();
      const qKey = zsetKey(flashSaleId);

      // 🛡️ GUARD: Check if user already has a confirmed order for this flash sale
      try {
        const existingOrder = await orderMongoModel
          .findOne(
            { 
              userEmail: email, 
              flashSaleId: flashSaleId,
              paymentStatus: 'paid' 
            },
            { _id: 1 }
          )
          .lean();

        if (existingOrder) {
          return reply.code(409).send({
            message: 'You have already purchased this item',
            orderId: String(existingOrder._id),
          });
        }
      } catch (dbError) {
        request.log.error({ dbError, email, flashSaleId }, 'Failed to check existing order');
        // Continue with the flow - don't block on DB errors
      }
      // 1️⃣ Check if user already has an active hold
      const pttl = await redis.pttl(holdKey(flashSaleId, email));
      let hasActiveHold = false;
      let holdTtlSec = 0;
      if (pttl > 0) {
        hasActiveHold = true;
        holdTtlSec = Math.ceil(pttl / 1000);
      } else if (pttl === -1) {
        hasActiveHold = true;
        holdTtlSec = HOLD_TTL_SECONDS;
      }

      // 2️⃣ Add to visible queue (if not already present)
      const pipe = redis.multi();
      pipe.zadd(qKey, 'NX', nowMs, email);
      pipe.zrank(qKey, email);
      pipe.zcard(qKey);
      const [[, _add], [, rankVal], [, sizeVal]] = (await pipe.exec()) as [
        [null, number],
        [null, number | null],
        [null, number]
      ];
      const position = (rankVal ?? 0) + 1;
      const size = sizeVal;

      // 3️⃣ Only enqueue a reserve job if no active hold
      const jobId = `${flashSaleId}:${email}:reserve`;

      if (!hasActiveHold) {
        try {
          await queue.add(
            'reserve',
            {
              email,
              flashSaleId,
              enqueuedAt: nowMs,
              holdTtlSec: HOLD_TTL_SECONDS,
            },
            {
              jobId,
              removeOnComplete: true,
              removeOnFail: true,
              attempts: 20,
              backoff: { type: 'exponential', delay: 2000 },
            }
          );
        } catch (err) {
          request.log.error({ err, flashSaleId, email }, 'queue.add failed');
          return reply
            .code(503)
            .send({ message: 'Queue unavailable. Please try again.' });
        }
      }

      // 4️⃣ Respond with queue info + debug fields
      return reply.code(200).send({
        queued: true,
        position,
        size,
        hasActiveHold,
        holdTtlSec,
        jobId,
        email,
        flashSaleId,
        queueName: QUEUE_NAME,
        queuePrefix: QUEUE_PREFIX,
        redisUrl: REDIS_URL,
        zsetKey: qKey,
      });
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
