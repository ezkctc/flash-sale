import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const zsetKey = (flashSaleId: string) => `fsq:${flashSaleId}`;

type Query = { flashSaleId: string };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });

  app.get<{ Querystring: Query }>(
    '/admin/queue/overview',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Admin', 'Queue', 'Orders'],
        summary: 'Admin: BullMQ & Redis queue overview',
        querystring: {
          type: 'object',
          required: ['flashSaleId'],
          properties: { flashSaleId: { type: 'string' } },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        const { flashSaleId } = request.query;
        const [jobCounts, lineSize] = await Promise.all([
          queue.getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
            'paused'
          ),
          redis.zcard(zsetKey(flashSaleId)),
        ]);

        reply.code(200).send({
          queueName: QUEUE_NAME,
          jobCounts,
          lineSize,
          flashSaleId,
          ts: Date.now(),
        });
      } catch (err) {
        request.log.error(err);
        reply.code(500).send({ message: 'Failed to fetch queue overview' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
