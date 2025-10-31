import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { zsetKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';

type Query = { flashSaleId: string };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });

  // helper: count keys by SCAN without loading all
  async function countKeysByPattern(
    pattern: string,
    batch = 500
  ): Promise<number> {
    let cursor = '0';
    let total = 0;
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        String(batch)
      );
      cursor = next;
      total += keys.length;
    } while (cursor !== '0');
    return total;
  }

  app.get<{ Querystring: Query }>(
    '/admin/queue/overview',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Admin', 'Queue', 'Orders'],
        summary: 'Admin: BullMQ + Redis overview (totals only)',
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['flashSaleId'],
          properties: { flashSaleId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              queueName: { type: 'string' },
              redisUrl: { type: 'string' },
              flashSaleId: { type: 'string' },
              isPaused: { type: 'boolean' },
              jobCounts: { type: 'object' },
              zsetKey: { type: 'string' },
              lineSize: { type: 'number' },
              activeHolds: { type: 'number' },
              ts: { type: 'number' },
            },
            required: [
              'queueName',
              'redisUrl',
              'flashSaleId',
              'isPaused',
              'jobCounts',
              'zsetKey',
              'lineSize',
              'activeHolds',
              'ts',
            ],
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        const { flashSaleId } = request.query;
        const qKey = zsetKey(flashSaleId);

        const [jobCounts, isPaused, lineSize, activeHolds] = await Promise.all([
          queue.getJobCounts(), // { waiting, active, completed, failed, delayed, paused, ... }
          queue.isPaused(), // boolean
          redis.zcard(qKey), // number of members in fsq:<saleId>
          countKeysByPattern(`fsh:${flashSaleId}:*`), // number of active holds
        ]);

        return reply.code(200).send({
          queueName: QUEUE_NAME,
          redisUrl: REDIS_URL,
          flashSaleId,
          isPaused,
          jobCounts,
          zsetKey: qKey,
          lineSize,
          activeHolds,
          ts: Date.now(),
        });
      } catch (err) {
        request.log.error(err);
        return reply
          .code(500)
          .send({ message: 'Failed to fetch queue overview' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
