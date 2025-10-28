import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import type { Db } from 'mongodb';
import { env } from './env';

// Factory to create a Better Auth instance using an existing MongoDB Db
export function createAuth(db: Db) {
  const selfOrigin = `http://${env.HOST}:${env.PORT}`;
  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
    },
    // Allow local frontend and server-origin calls (e.g., seed scripts)
    trustedOrigins: ['http://localhost:3000', selfOrigin],
  });
}
