import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { MongoClient, Db } from 'mongodb';
import { env } from '../lib/env';

declare module 'fastify' {
  interface FastifyInstance {
    mongo: {
      client: MongoClient;
      db: Db;
    };
  }
}

async function mongoPlugin(fastify: FastifyInstance) {
  const client = new MongoClient(env.MONGODB_URI);
  await client.connect();

  const db = client.db(env.MONGO_DB);
  fastify.log.info(`Connected to MongoDB: ${env.MONGO_DB}`);

  fastify.decorate('mongo', { client, db });

  // Ensure TTL index for token sessions
  fastify.addHook('onReady', async () => {
    try {
      await db
        .collection('sessions')
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      fastify.log.info('Ensured TTL index on sessions.expiresAt');
    } catch (e) {
      fastify.log.error(e as any, 'Failed creating TTL index on sessions');
    }
  });

  fastify.addHook('onClose', async (app) => {
    await app.mongo.client.close();
  });
}

export default fp(mongoPlugin, { name: 'mongo' });
