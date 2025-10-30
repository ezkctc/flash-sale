import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import { flashSaleMongoModel } from '@flash-sale/shared-types';
import { FlashSaleStatus } from '@flash-sale/shared-types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';

// Use environment variable for the hold duration, defaulting to 15 minutes (900 seconds)
const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);

const holdKey = (saleId: string, email: string) => `fsh:${saleId}:${email}`;
const zsetKey = (saleId: string) => `fsq:${saleId}`;
const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`; // optional meta cache

async function bootstrap() {
  // Connect Mongo (await before worker starts)
  await mongoose.connect(MONGODB_URI);

  const redis = new IORedis(REDIS_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name !== 'reserve') return;

      const {
        email: rawEmail,
        flashSaleId,
        holdTtlSec,
      } = job.data as {
        email: string;
        flashSaleId: string;
        holdTtlSec: number;
      };
      const email = rawEmail.trim().toLowerCase();
      const now = new Date();

      // 1. Check sale status and inventory (use a brief Redis cache)
      let saleMeta = JSON.parse(
        (await redis.get(saleCacheKey(flashSaleId))) ?? 'null'
      );

      if (!saleMeta) {
        saleMeta = await flashSaleMongoModel
          .findById(flashSaleId, {
            status: 1,
            startsAt: 1,
            endsAt: 1,
            currentQuantity: 1,
          })
          .lean();

        if (!saleMeta) {
          await redis.zrem(zsetKey(flashSaleId), email);
          throw new Error('Flash sale not found');
        }

        // Cache the metadata for a short time (e.g., 30 seconds)
        await redis.set(
          saleCacheKey(flashSaleId),
          JSON.stringify(saleMeta),
          'EX',
          30
        );
      }

      const isActive =
        saleMeta.status === FlashSaleStatus.OnSchedule &&
        new Date(saleMeta.startsAt) <= now &&
        now < new Date(saleMeta.endsAt);

      // Enforce FIFO: proceed only if this user is at the head of the queue
      const rank = await redis.zrank(zsetKey(flashSaleId), email);
      const isFirst = rank === 0;

      if (!isActive || saleMeta.currentQuantity <= 0 || !isFirst) {
        // Not ready yet (window not active, sold out, or not first). Keep user in the visible queue.
        // No hold is set; simply return to allow retry via subsequent triggers.
        return { ok: false, reason: 'not_ready' } as any;
      }

      // 2. SUCCESS: Set/refresh the hold with an expiration, then remove from queue.
      const holdTime = Math.max(1, Number(holdTtlSec) || HOLD_TTL_SECONDS);
      const multi = redis.multi();
      multi.set(holdKey(flashSaleId, email), '1', 'EX', holdTime);
      multi.zrem(zsetKey(flashSaleId), email);
      await multi.exec();

      // The job completes successfully, and the user now has a time-limited hold.
      return { ok: true, holdTime: holdTime };
    },
    { connection: { url: REDIS_URL }, concurrency: 8 }
  );

  worker.on('completed', (job) => {
    // optional logging
  });
  worker.on('failed', (job, err) => {
    // optional logging
  });

  const shutdown = async () => {
    await worker.close();
    await redis.quit();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(console.error);
