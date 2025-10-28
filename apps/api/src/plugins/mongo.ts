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

  fastify.addHook('onClose', async (app) => {
    await app.mongo.client.close();
  });
}

export default fp(mongoPlugin, { name: 'mongo' });
