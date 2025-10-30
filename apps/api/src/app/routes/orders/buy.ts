import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';

// redis keys
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`; // sorted set line
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`; // TTL hold (set by worker)
const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900); // 15 mins

type BuyBody = {
  email: string;
  flashSaleId: string;
};

export default async function (app: FastifyInstance) {
  // share redis + queue (simple singletons per process)
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
        const { email, flashSaleId } = request.body;
        const nowMs = Date.now();

        // If user already has an active hold (worker already processed), inform them
        const ttlRemaining = await redis.ttl(holdKey(flashSaleId, email));
        const hasActiveHold = ttlRemaining > 0;

        // Add to queue (FIFO fairness is enforced by BullMQ workers)
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

        // Track visible position immediately (UX): add to ZSET with score = now
        // Only add if not already present (NX semantics via ZADD with XX/NX is not in ioredis helper, so do a check)
        const alreadyIn = await redis.zrank(zsetKey(flashSaleId), email);
        if (alreadyIn === null) {
          await redis.zadd(zsetKey(flashSaleId), nowMs, email);
        }

        const rank = await redis.zrank(zsetKey(flashSaleId), email);
        const size = await redis.zcard(zsetKey(flashSaleId));

        reply.code(200).send({
          queued: true,
          position: (rank ?? 0) + 1, // 1-based
          size,
          hasActiveHold,
          holdTtlSec: hasActiveHold ? ttlRemaining : 0,
          jobId: String(job.id),
        });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to enqueue order' });
      }
    }
  );

  // graceful shutdown hooks (optional)
  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
