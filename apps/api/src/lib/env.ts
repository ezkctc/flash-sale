import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BEND_HOST: z.string().default('localhost'),
  BEND_PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string(),
  MONGO_DB: z.string().default('flashsale'),
  JWT_SECRET: z.string().default('local-secret'),
  REDIS_URL: z.string().default('redis://:redispass@localhost:6379'),
});

function deriveFromMongoUrl(mongoUrl?: string) {
  if (!mongoUrl) return {} as any;
  try {
    const u = new URL(mongoUrl);
    const db = (u.pathname || '').replace(/^\//, '') || 'flashsale';
    return { MONGODB_URI: mongoUrl, MONGO_DB: db };
  } catch {
    return {} as any;
  }
}

export const env = schema.parse({
  ...process.env,
  ...deriveFromMongoUrl(process.env.MONGO_URL),
});
