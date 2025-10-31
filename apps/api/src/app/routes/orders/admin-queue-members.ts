import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authGuard } from '../auth/auth-guard';
import IORedis from 'ioredis';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';

type Query = { flashSaleId: string; page?: number; limit?: number };

export default async function (app: FastifyInstance) {
  const redis = new IORedis(REDIS_URL);

  app.get<{ Querystring: Query }>(
    '/admin/queue/members',
    {
      preHandler: authGuard(app),
      schema: {
        tags: ['Admin', 'Queue', 'Orders'],
        summary: 'Admin: paginate through queue members (latest FIFO by score)',
        querystring: {
          type: 'object',
          required: ['flashSaleId'],
          properties: {
            flashSaleId: { type: 'string' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
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
        const page = Math.max(1, Number(request.query.page ?? 1));
        const rawLimit = Number(request.query.limit ?? 50);
        const limit = Math.min(200, Math.max(1, rawLimit));

        const start = (page - 1) * limit;
        const stop = start + limit - 1;

        // We want: email + score for the page; also total size
        const [entries, total] = await Promise.all([
          redis.zrange(zsetKey(flashSaleId), start, stop, 'WITHSCORES'),
          redis.zcard(zsetKey(flashSaleId)),
        ]);

        // entries is like [email1, score1, email2, score2, ...]
        const items: Array<{
          email: string;
          position: number;
          score: number;
          holdTtlSec: number;
        }> = [];
        for (let i = 0; i < entries.length; i += 2) {
          const email = entries[i]!;
          const score = Number(entries[i + 1]!); // ms since epoch
          // compute position from page math
          const position = start + i / 2 + 1;

          // fetch TTL for each (pipeline for perf)
          items.push({ email, position, score, holdTtlSec: 0 });
        }

        // resolve TTLs in one pipeline
        if (items.length > 0) {
          const pipe = redis.pipeline();
          for (const it of items) pipe.ttl(holdKey(flashSaleId, it.email));
          const res = await pipe.exec();
          res?.forEach((r, idx) => {
            const ttl = Array.isArray(r) ? Number(r[1]) : -2;
            items[idx].holdTtlSec = Math.max(ttl, 0);
          });
        }

        reply.code(200).send({
          items,
          total,
          page,
          limit,
        });
      } catch (err) {
        request.log.error(err);
        reply.code(500).send({ message: 'Failed to fetch queue members' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}
