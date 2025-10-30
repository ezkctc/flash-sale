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

      const email = rawEmail?.trim().toLowerCase();
      if (!email || !flashSaleId) {
        throw new Error('Missing email or flashSaleId');
      }

      // Validate sale window & status (read-through cache -> Mongo)
      const now = new Date();
      let saleMeta: any | null = null;
      const cached = await redis.get(saleCacheKey(flashSaleId));
      if (cached) {
        try {
          saleMeta = JSON.parse(cached);
        } catch {}
      }
      if (!saleMeta) {
        saleMeta = await flashSaleMongoModel
          .findById(flashSaleId, { startsAt: 1, endsAt: 1, status: 1 })
          .lean()
          .exec();
        if (!saleMeta) throw new Error('Flash sale not found');
        // cache briefly (30s)
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

      if (!isActive) {
        // Just drop from the visible queue and exit; API will reflect position shrink on next poll
        await redis.zrem(zsetKey(flashSaleId), email);
        throw new Error('Flash sale not active');
      }

      // Set/refresh the hold (EX in seconds). Only mark the hold; do NOT decrement inventory here.
      await redis.set(
        holdKey(flashSaleId, email),
        '1',
        'EX',
        Math.max(1, Number(holdTtlSec) || 900)
      );

      // Remove user from visible queue ZSET after worker processed their turn
      await redis.zrem(zsetKey(flashSaleId), email);

      return { ok: true };
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

bootstrap().catch((e) => {
  console.error('[worker] fatal', e);
  process.exit(1);
});
