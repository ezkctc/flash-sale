import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';

// Redis keys
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`; // visible queue
const holdKey = (flashSaleId: string, email: string) =>
  `fsh:${flashSaleId}:${email}`; // TTL hold (worker sets)
export const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900); // 15 mins

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
            required: [
              'queued',
              'position',
              'size',
              'hasActiveHold',
              'holdTtlSec',
            ],
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: BuyBody }>, reply: FastifyReply) => {
      try {
        const email = request.body.email?.trim().toLowerCase();
        const flashSaleId = request.body.flashSaleId;
        if (!email || !flashSaleId) {
          return reply
            .code(400)
            .send({ message: 'Email and flashSaleId are required' });
        }

        const nowMs = Date.now();

        // Check hold status precisely (ms). pttl returns: > 0 (ms), -1 (no expire), -2 (not found)
        const pttl = await redis.pttl(holdKey(flashSaleId, email));

        // --- Calculate Hold Status and TTL for response ---
        let holdTtlSec = 0;
        let hasActiveHold = false;
        if (pttl > 0) {
          hasActiveHold = true;
          holdTtlSec = Math.ceil(pttl / 1000);
        }
        // Note: If pttl is -1 (stale hold with no expiration set) or 0 (just expired), hasActiveHold remains false and holdTtlSec remains 0.
        // Given the worker sets 'EX', pttl should generally only be > 0 or -2 after the job runs.

        // Enqueue reserve job (worker will validate and set/refresh the hold)
        // Idempotent job id per (sale,email)
        const jobId = `${flashSaleId}:${email}:reserve`;
        const job = await queue
          .add(
            'reserve',
            {
              email,
              flashSaleId,
              enqueuedAt: nowMs,
              holdTtlSec: HOLD_TTL_SECONDS,
            },
            { jobId, removeOnComplete: true, removeOnFail: true }
          )
          .catch(() => null);

        // Track visible position in ZSET (score = enqueue time); add if not present
        const qKey = zsetKey(flashSaleId);
        const rank = await redis.zrank(qKey, email);
        if (rank === null) {
          await redis.zadd(qKey, nowMs, email); // score=now
        }
        const [pos, size] = await Promise.all([
          redis.zrank(qKey, email).then((r) => (r ?? 0) + 1),
          redis.zcard(qKey),
        ]);

        return reply.code(200).send({
          queued: true,
          position: pos,
          size,
          hasActiveHold,
          holdTtlSec,
          jobId: job ? String(job.id) : jobId,
        });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ message: 'Failed to enqueue order' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
