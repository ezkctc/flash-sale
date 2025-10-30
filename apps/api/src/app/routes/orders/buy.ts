import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';

const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`;
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`;
const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);

type BuyBody = { email: string; flashSaleId: string };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });

  app.post<{ Body: BuyBody }>(
    '/buy',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Enqueue a purchase attempt (FIFO) and return queue position',
        body: {
          type: 'object',
          required: ['email', 'flashSaleId'],
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
            },
            required: ['queued', 'position', 'size', 'hasActiveHold'],
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Body: BuyBody }>,
      reply: FastifyReply
    ) {
      try {
        const rawEmail = request.body.email;
        const flashSaleId = request.body.flashSaleId;

        if (!rawEmail || !flashSaleId) {
          return reply
            .code(400)
            .send({ message: 'Email and flashSaleId are required' });
        }

        // Normalize to match worker’s keying convention (avoid mismatched keys)
        const email = rawEmail.trim().toLowerCase();

        // Check hold TTL precisely (ms) and convert to seconds
        const key = holdKey(flashSaleId, email);
        let pttl = await redis.pttl(key); // ms
        // pttl semantics: -2 = key does not exist; -1 = no expire; >=0 = ms remaining
        const hasActiveHold = pttl > 0 || pttl === -1;
        const holdTtlSec =
          pttl > 0
            ? Math.ceil(pttl / 1000) // avoid 0 when <1s remains
            : pttl === -1
            ? HOLD_TTL_SECONDS // fallback if worker forgot EX—treat as full window
            : 0; // no key

        // Enqueue work for the worker to grant/set the hold
        const nowMs = Date.now();
        const job = await queue.add(
          'reserve',
          {
            email,
            flashSaleId,
            enqueuedAt: nowMs,
            holdTtlSec: HOLD_TTL_SECONDS,
          },
          { removeOnComplete: true, removeOnFail: true }
        );

        // Track visible position in a ZSET (score = enqueue time)
        const qKey = zsetKey(flashSaleId);
        const alreadyIn = await redis.zrank(qKey, email);
        if (alreadyIn === null) {
          await redis.zadd(qKey, nowMs, email);
        }
        const rank = await redis.zrank(qKey, email);
        const size = await redis.zcard(qKey);

        return reply.code(200).send({
          queued: true,
          position: (rank ?? 0) + 1,
          size,
          hasActiveHold,
          holdTtlSec,
          jobId: String(job.id),
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: 'Failed to enqueue order' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
