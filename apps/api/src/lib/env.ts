import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  BEND_HOST: z.string().default('localhost'),
  BEND_PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string(),
  MONGO_DB: z.string().default('flashsale'),
  JWT_SECRET: z.string().default('local-secret'),
});

export const env = schema.parse({
  ...process.env,
  // Support legacy variable names if present
  BEND_HOST: process.env.BEND_HOST ?? process.env.BEND_HOST,
  BEND_PORT: process.env.BEND_PORT ?? process.env.BEND_PORT,
});
