import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import IORedis from 'ioredis';

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

  app.get<{ Querystring: Query }>(
    '/position',
    {
      schema: {
        tags: ['Orders'],
        summary: 'Get live queue position and hold TTL (if any)',
        querystring: {
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
              position: { type: 'number', nullable: true },
              size: { type: 'number' },
              holdTtlSec: { type: 'number' },
              hasActiveHold: { type: 'boolean' },
            },
            required: ['size', 'hasActiveHold', 'holdTtlSec'],
          },
        },
      },
    },
    async function (
      request: FastifyRequest<{ Querystring: Query }>,
      reply: FastifyReply
    ) {
      try {
        const { email, flashSaleId } = request.query;
        const [rank, size, ttl] = await Promise.all([
          redis.zrank(zsetKey(flashSaleId), email),
          redis.zcard(zsetKey(flashSaleId)),
          redis.ttl(holdKey(flashSaleId, email)),
        ]);

        reply.code(200).send({
          position: rank === null ? null : rank + 1,
          size,
          holdTtlSec: Math.max(ttl, 0),
          hasActiveHold: ttl > 0,
        });
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ message: 'Failed to fetch position' });
      }
    }
  );

  app.addHook('onClose', async () => {
    await redis.quit();
  });
}
