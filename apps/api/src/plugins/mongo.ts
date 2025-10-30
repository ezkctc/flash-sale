import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { Db, MongoClient } from 'mongodb';
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
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGO_DB });

  const connection = mongoose.connection;

  const client = connection.getClient();
  const db = connection.db;

  if (!db) {
    fastify.log.error(
      'Mongoose connected but failed to retrieve the underlying native Db object.'
    );
    throw new Error('Failed to initialize MongoDB database object.');
  }

  fastify.log.info(`Connected to MongoDB: ${db.databaseName}`);
  fastify.decorate('mongo', { client, db });

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

  fastify.addHook('onClose', async () => {
    await mongoose.disconnect();
    fastify.log.info('Disconnected from MongoDB.');
  });
}

export default fp(mongoPlugin, { name: 'mongo' });
