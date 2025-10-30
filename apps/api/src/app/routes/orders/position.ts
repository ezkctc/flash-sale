import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`;
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`;

type Query = {
  email: string;
  flashSaleId: string;
};

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(process.env.QUEUE_NAME ?? 'sale-processing-queue', {
    connection: { url: REDIS_URL },
  });

  app.get<{ Querystring: Query }>(
    '/position',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Get live queue position and hold TTL (if any)',
        querystring: {
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
              status: { type: 'string', enum: ['queued', 'ready', 'none'] },
              position: { type: 'number', nullable: true }, // when queued
              size: { type: 'number' },
              hasActiveHold: { type: 'boolean' },
              holdTtlSec: { type: 'number' },
            },
            required: [
              'status',
              'position',
              'size',
              'hasActiveHold',
              'holdTtlSec',
            ],
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) => {
      try {
        const email = request.query.email.trim().toLowerCase();
        const flashSaleId = request.query.flashSaleId;

        const [rank, size, pttl] = await Promise.all([
          redis.zrank(zsetKey(flashSaleId), email),
          redis.zcard(zsetKey(flashSaleId)),
          redis.pttl(holdKey(flashSaleId, email)), // -2 no key, -1 no expire, >=0 ms
        ]);

        let hasActiveHold = false;
        let holdTtlSec = 0;
        if (pttl > 0) {
          hasActiveHold = true;
          holdTtlSec = Math.ceil(pttl / 1000);
        } else if (pttl === -1) {
          // key exists with no expiry (shouldn’t happen if worker sets EX) – treat as active
          hasActiveHold = true;
          holdTtlSec = HOLD_TTL_SECONDS;
        }

        // If user has a hold, they’re "ready" even if not in ZSET (worker removes them)
        if (hasActiveHold) {
          return reply.code(200).send({
            status: 'ready',
            position: 1, // UX: at the front / ready to checkout
            size, // others still in queue
            hasActiveHold,
            holdTtlSec,
          });
        }

        // Not holding: they might still be queued, or not present at all
        if (rank !== null) {
          return reply.code(200).send({
            status: 'queued',
            position: rank + 1,
            size,
            hasActiveHold: false,
            holdTtlSec: 0,
          });
        }

        // Neither in queue nor holding
        return reply.code(200).send({
          status: 'none',
          position: null,
          size,
          hasActiveHold: false,
          holdTtlSec: 0,
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ message: 'Failed to retrieve position' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
