import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_PREFIX = process.env.BULLMQ_PREFIX ?? 'flashsale';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900); // 15 min

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
        summary: 'Enqueue a purchase attempt (FIFO) and return queue position',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'flashSaleId'],
          properties: {
            email: { type: 'string', format: 'email' },
            flashSaleId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
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
          503: {
            type: 'object',
            additionalProperties: false,
            properties: { message: { type: 'string' } },
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

      // 1) Fast path: if hold already active, don’t enqueue again
      const pttl = await redis.pttl(holdKey(flashSaleId, email)); // -2 no key, -1 no expiry, >0 ms
      let hasActiveHold = false;
      let holdTtlSec = 0;
      if (pttl > 0) {
        hasActiveHold = true;
        holdTtlSec = Math.ceil(pttl / 1000);
      } else if (pttl === -1) {
        // Treat as active to be safe (shouldn't happen if worker sets EX)
        hasActiveHold = true;
        holdTtlSec = HOLD_TTL_SECONDS;
      }

      // 2) Ensure presence in visible queue (NX so we never reset score)
      //    Read rank & size via pipeline to avoid extra roundtrips
      const pipe = redis.multi();
      pipe.zadd(qKey, 'NX', nowMs, email);
      pipe.zrank(qKey, email);
      pipe.zcard(qKey);
      const [[, added], [, rankVal], [, sizeVal]] = (await pipe.exec()) as [
        [null, number], // zadd result (1 added, 0 existed)
        [null, number | null],
        [null, number]
      ];
      const position = (rankVal ?? 0) + 1;
      const size = sizeVal;

      // 3) Only enqueue if we don’t already have an active hold
      let jobId = `${flashSaleId}:${email}:reserve`;
      if (!hasActiveHold) {
        try {
          const job = await queue.add(
            'reserve',
            {
              email,
              flashSaleId,
              enqueuedAt: nowMs,
              holdTtlSec: HOLD_TTL_SECONDS,
            },
            {
              jobId, // idempotent per (sale,email)
              removeOnComplete: true,
              removeOnFail: true,
              attempts: 3, // basic resiliency
              backoff: { type: 'exponential', delay: 2000 },
            }
          );
          jobId = String(job.id);
        } catch (e) {
          // Surface failure instead of silently returning queued:true with a null job
          request.log.error({ err: e, flashSaleId, email }, 'queue.add failed');
          return reply
            .code(503)
            .send({ message: 'Queue unavailable. Please try again.' });
        }
      }

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
