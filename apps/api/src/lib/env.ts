import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BEND_HOST: z.string().default('localhost'),
  BEND_PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string(),
  MONGO_DB: z.string().default('flash_sale_db'),
  JWT_SECRET: z.string().default('local-secret'),
  REDIS_URL: z.string().default('redis://:redispass@localhost:6379'),
  HOLD_TTL_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).default(900)
  ),
});

function deriveFromMongoUrl(mongoUrl?: string) {
  if (!mongoUrl) return {} as any;
  try {
    const u = new URL(mongoUrl);
    const db = (u.pathname || '').replace(/^\//, '') || 'flash_sale_db';
    return { MONGODB_URI: mongoUrl, MONGO_DB: db };
  } catch {
    return {} as any;
  }
}

export const env = schema.parse({
  ...process.env,
  // Prefer MONGO_URL (includes credentials + db) when provided
  ...deriveFromMongoUrl(process.env.MONGO_URL),
});
