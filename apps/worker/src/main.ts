import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import mongoose, { Types } from 'mongoose';
import { flashSaleMongoModel, FlashSaleStatus } from '@flash-sale/shared-types';
import { zsetKey, holdKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const BULL_PREFIX = process.env.BULLMQ_PREFIX ?? 'flashsale';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);
const NOT_FIRST_DELAY_MS = Number(process.env.NOT_FIRST_DELAY_MS ?? 1500); // poll frequency for head-of-line
const NOT_YET_ACTIVE_DELAY_MS = Number(
  process.env.NOT_YET_ACTIVE_DELAY_MS ?? 3000
);

const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`;

async function bootstrap() {
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
      const qKey = zsetKey(flashSaleId);

      // ---- 1) Load sale meta (short cache) ---------------------------------
      let saleMeta = JSON.parse(
        (await redis.get(saleCacheKey(flashSaleId))) ?? 'null'
      );

      if (!saleMeta) {
        let queryResult = null;

        if (Types.ObjectId.isValid(flashSaleId)) {
          queryResult = await flashSaleMongoModel
            .findById(new Types.ObjectId(flashSaleId), {
              status: 1,
              startsAt: 1,
              endsAt: 1,
              currentQuantity: 1,
            })
            .lean();
        }

        if (!queryResult) {
          queryResult = await flashSaleMongoModel
            .findOne(
              { _id: flashSaleId },
              {
                status: 1,
                startsAt: 1,
                endsAt: 1,
                currentQuantity: 1,
              }
            )
            .lean();
        }

        saleMeta = queryResult;

        if (!saleMeta) {
          await redis.zrem(zsetKey(flashSaleId), email);
          throw new Error('flash_sale_not_found');
        }

        // Cache for 30s to reduce Mongo load
        await redis.set(
          saleCacheKey(flashSaleId),
          JSON.stringify(saleMeta),
          'EX',
          30
        );
      }

      const startsAt = new Date(saleMeta.startsAt);
      const endsAt = new Date(saleMeta.endsAt);
      const isOnSchedule = saleMeta.status === FlashSaleStatus.OnSchedule;
      const isActiveWindow = isOnSchedule && startsAt <= now && now < endsAt;

      // ---- 2) Head-of-line check -------------------------------------------
      const rank = await redis.zrank(qKey, email); // null = not in ZSET (maybe already processed)
      const isFirst = rank === 0;

      // If sale ended or cancelled → cleanup and fail (no retries)
      if (!isOnSchedule || now >= endsAt) {
        await redis.zrem(qKey, email);
        throw new Error('sale_inactive_or_ended');
      }

      // If sale not yet started → delay and try again
      if (!isActiveWindow) {
        await job.moveToDelayed(Date.now() + NOT_YET_ACTIVE_DELAY_MS);
        return; // keep job for later
      }

      // If not first in ZSET → delay and try again
      if (!isFirst) {
        await job.moveToDelayed(Date.now() + NOT_FIRST_DELAY_MS);
        return; // keep job for later
      }

      // Optional: if you want to prevent tons of holds when stock is near 0, you can

      if ((saleMeta.currentQuantity ?? 0) <= 0) {
        await job.moveToDelayed(Date.now() + NOT_FIRST_DELAY_MS);
        return;
      }

      // ---- 3) Grant hold + remove from visible queue (atomic) ---------------
      const holdTime = Math.max(1, Number(holdTtlSec) || HOLD_TTL_SECONDS);
      const multi = redis.multi();
      multi.set(holdKey(flashSaleId, email), '1', 'EX', holdTime);
      multi.zrem(qKey, email);
      await multi.exec();

      // Done: job completes successfully; user now has an active hold
      return { ok: true, holdTime };
    },
    {
      connection: { url: REDIS_URL },
      prefix: BULL_PREFIX,
      concurrency: 8,
      // (optional) blockUntilReady: true
    }
  );

  // Helpful logs
  worker.on('active', (j) =>
    console.log(
      '[worker active]',
      j.id,
      j.name,
      j.data?.email,
      j.data?.flashSaleId
    )
  );
  worker.on('completed', (j, r) => console.log('[worker done]', j.id, r));
  worker.on('failed', (j, e) =>
    console.error('[worker fail]', j?.id, e?.message)
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
  console.error('[worker boot error]', e);
  process.exit(1);
});
