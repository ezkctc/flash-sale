import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';

type Query = { flashSaleId: string; head?: number; intervalMs?: number };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });

  app.get<{ Querystring: Query }>(
    '/admin/queue/stream',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Admin', 'Queue', 'Orders'],
        summary: 'Admin: live SSE stream of queue metrics & head preview',
        querystring: {
          type: 'object',
          required: ['flashSaleId'],
          properties: {
            flashSaleId: { type: 'string' },
            head: { type: 'number', minimum: 1, maximum: 200, default: 10 },
            intervalMs: {
              type: 'number',
              minimum: 250,
              maximum: 10000,
              default: 1000,
            },
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      const { flashSaleId } = request.query;
      const head = Math.min(200, Math.max(1, Number(request.query.head ?? 10)));
      const intervalMs = Math.min(
        10000,
        Math.max(250, Number(request.query.intervalMs ?? 1000))
      );

      // SSE headers
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache, no-transform');
      reply.header('Connection', 'keep-alive');
      reply.raw.flushHeaders?.();

      let timer: NodeJS.Timeout | null = null;
      let closed = false;

      const send = (data: any) => {
        if (closed) return;
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const tick = async () => {
        try {
          const [jobCounts, lineSize, headEntries] = await Promise.all([
            queue.getJobCounts(
              'waiting',
              'active',
              'completed',
              'failed',
              'delayed',
              'paused'
            ),
            redis.zcard(zsetKey(flashSaleId)),
            redis.zrange(zsetKey(flashSaleId), 0, head - 1, 'WITHSCORES'),
          ]);

          const items: Array<{
            email: string;
            position: number;
            score: number;
            holdTtlSec: number;
          }> = [];
          for (let i = 0; i < headEntries.length; i += 2) {
            const email = headEntries[i]!;
            const score = Number(headEntries[i + 1]!);
            items.push({ email, position: i / 2 + 1, score, holdTtlSec: 0 });
          }

          if (items.length > 0) {
            const pipe = redis.pipeline();
            for (const it of items) pipe.ttl(holdKey(flashSaleId, it.email));
            const res = await pipe.exec();
            res?.forEach((r, idx) => {
              const ttl = Array.isArray(r) ? Number(r[1]) : -2;
              items[idx].holdTtlSec = Math.max(ttl, 0);
            });
          }

          send({
            ts: Date.now(),
            flashSaleId,
            counts: jobCounts,
            lineSize,
            head: items,
          });
        } catch (err) {
          request.log.error({ err }, 'SSE tick failed');
          send({ error: 'tick_failed', ts: Date.now() });
        }
      };

      // first push then interval
      await tick();
      timer = setInterval(tick, intervalMs);

      // close handling
      request.raw.on('close', () => {
        closed = true;
        if (timer) clearInterval(timer);
      });
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}

//Fend usage
// const es = new EventSource(`/admin/queue/stream?flashSaleId=${id}&head=25&intervalMs=1000`);
// es.onmessage = (e) => {
//   const data = JSON.parse(e.data);
//   // update dashboard cards and head-of-line table
// };
