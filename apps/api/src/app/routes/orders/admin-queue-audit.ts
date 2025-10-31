import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';

type Query = { flashSaleId: string; sample?: number };

async function scanKeys(redis: IORedis, pattern: string, max: number) {
  let cursor = '0';
  const out: string[] = [];
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = res[0] as string;
    const keys = res[1] as string[];
    for (const k of keys) {
      out.push(k);
      if (out.length >= max) return out;
    }
  } while (cursor !== '0');
  return out;
}

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);
  const queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } });

  app.get<{ Querystring: Query }>(
    '/admin/queue/audit',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Admin', 'Queue', 'Orders'],
        summary: 'Admin: in-depth audit of Redis/BullMQ queue + holds',
        querystring: {
          type: 'object',
          required: ['flashSaleId'],
          properties: {
            flashSaleId: { type: 'string' },
            sample: { type: 'number', minimum: 1, maximum: 500, default: 50 },
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
        const sample = Math.min(
          500,
          Math.max(1, Number(request.query.sample ?? 50))
        );

        // BullMQ counts
        const jobCounts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused'
        );

        // Line preview and TTLs for head
        const headEntries = await redis.zrange(
          zsetKey(flashSaleId),
          0,
          sample - 1,
          'WITHSCORES'
        );
        const line: Array<{
          email: string;
          position: number;
          score: number;
          holdTtlSec: number;
        }> = [];
        for (let i = 0; i < headEntries.length; i += 2) {
          line.push({
            email: headEntries[i]!,
            position: i / 2 + 1,
            score: Number(headEntries[i + 1]!),
            holdTtlSec: 0,
          });
        }
        if (line.length > 0) {
          const pipe = redis.pipeline();
          for (const it of line) pipe.pttl(holdKey(flashSaleId, it.email));
          const res = await pipe.exec();
          res?.forEach((r, idx) => {
            const ttlMs = Array.isArray(r) ? Number(r[1]) : -2;
            line[idx].holdTtlSec = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0;
          });
        }

        // Active holds for this sale (sampled)
        const holdKeys = await scanKeys(redis, `fsh:${flashSaleId}:*`, sample);
        const holds: Array<{
          key: string;
          email: string;
          ttlSec: number;
          inQueue: boolean;
        }> = [];
        if (holdKeys.length) {
          const pipe = redis.pipeline();
          for (const k of holdKeys)
            pipe
              .pttl(k)
              .zrank(zsetKey(flashSaleId), k.split(':').slice(-1)[0]!);
          const exec = await pipe.exec();
          for (let i = 0; i < holdKeys.length; i++) {
            const key = holdKeys[i]!;
            const email = key.split(':').slice(-1)[0]!;
            const ttlMs = Array.isArray(exec?.[i * 2])
              ? Number(exec?.[i * 2]?.[1])
              : -2;
            const rankRes = exec?.[i * 2 + 1] as any;
            const rankVal = Array.isArray(rankRes) ? Number(rankRes[1]) : null;
            holds.push({
              key,
              email,
              ttlSec: ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0,
              inQueue: rankVal !== null,
            });
          }
        }

        // Other queues present (different sale ids)
        const otherQueues: Array<{ saleId: string; size: number }> = [];
        const fsqKeys = await scanKeys(redis, 'fsq:*', 200);
        for (const k of fsqKeys) {
          const sale = k.substring('fsq:'.length);
          if (sale === flashSaleId) continue;
          const size = await redis.zcard(k);
          if (size > 0) otherQueues.push({ saleId: sale, size });
        }

        // Strays: queue entries that already have an active hold (should be 0)
        const strays = line.filter((it) => it.holdTtlSec > 0);

        reply.code(200).send({
          ts: Date.now(),
          queueName: QUEUE_NAME,
          jobCounts,
          flashSaleId,
          head: line,
          holds,
          otherQueues,
          strays,
        });
      } catch (err) {
        request.log.error(err);
        reply.code(500).send({ message: 'Failed to audit queue' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await queue.close();
    await redis.quit();
  });
}
