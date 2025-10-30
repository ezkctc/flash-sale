import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { env } from '../lib/env';

declare module 'fastify' {
  interface FastifyInstance {
    saleQueue: Queue;
  }
}

async function queuePlugin(app: FastifyInstance) {
  const queue = new Queue('sale-processing-queue', {
    connection: { url: env.REDIS_URL },
  });
  app.log.info(`Connected to Redis: ${env.REDIS_URL}`);
  app.decorate('saleQueue', queue);

  app.addHook('onClose', async () => {
    await queue.close();
  });
}

export default fp(queuePlugin, { name: 'queue' });
