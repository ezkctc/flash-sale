import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  HOST: z.string().default('localhost'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string(),
  MONGO_DB: z.string().default('flashsale'),
  JWT_SECRET: z.string().default('local-secret'),
});

export const env = schema.parse({
  ...process.env,
  // Support legacy variable names if present
  HOST: process.env.BEND_HOST ?? process.env.HOST,
  PORT: process.env.BEND_PORT ?? process.env.PORT,
});
