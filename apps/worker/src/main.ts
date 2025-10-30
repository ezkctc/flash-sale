import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { flashSaleMongoModel } from '@flash-sale/shared-types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';

const holdKey = (saleId: string, email: string) => `fsh:${saleId}:${email}`;
const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`; // small meta cache

async function bootstrap() {
  await mongoose.connect(MONGODB_URI);
  console.log('[worker] connected to Mongo');
  const redis = new IORedis(REDIS_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const {
        email,
        flashSaleId,
        holdTtlSec = 900, // hold order for 15min to allow payment gateway to process
      } = job.data as {
        email: string;
        flashSaleId: string;
        holdTtlSec?: number;
      };

      // --- fetch window metadata, cached for 10 min to avoid hammering Mongo ---
      let saleMeta = await redis.get(saleCacheKey(flashSaleId));
      if (!saleMeta) {
        const sale = await flashSaleMongoModel
          .findById(flashSaleId, { startsAt: 1, endsAt: 1 })
          .lean();
        if (!sale) return { ok: false, reason: 'sale_not_found' };

        saleMeta = JSON.stringify({
          startsAt: sale.startsAt.getTime(),
          endsAt: sale.endsAt.getTime(),
        });
        // cache for 10min — sale window doesn’t change often
        await redis.setex(saleCacheKey(flashSaleId), 600, saleMeta);
      }

      const { startsAt, endsAt } = JSON.parse(saleMeta) as {
        startsAt: number;
        endsAt: number;
      };
      const now = Date.now();
      if (!(startsAt <= now && now <= endsAt)) {
        return { ok: false, reason: 'outside_window' };
      }

      // --- idempotent hold grant ---
      const existsTtl = await redis.ttl(holdKey(flashSaleId, email));
      if (existsTtl > 0) {
        return { ok: true, reason: 'already_has_hold', ttl: existsTtl };
      }

      await redis.set(
        holdKey(flashSaleId, email),
        JSON.stringify({
          flashSaleId,
          email,
          grantedAt: Date.now(),
          ttlSec: holdTtlSec,
        }),
        'EX',
        holdTtlSec,
        'NX'
      );

      return { ok: true, granted: true, ttl: holdTtlSec };
    },
    {
      connection: { url: REDIS_URL },
      concurrency: 1,
      // optional: throttle to 50 holds/sec if needed
      limiter: { max: 50, duration: 1000 },
    }
  );

  worker.on('ready', () => console.log(`[worker] listening on ${QUEUE_NAME}`));
  worker.on('failed', (job, err) =>
    console.error('[worker] failed', job?.id, err)
  );

  const shutdown = async () => {
    await worker.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
