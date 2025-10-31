import 'dotenv/config';
import { Worker, Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import mongoose, { Types } from 'mongoose';
import { flashSaleMongoModel, FlashSaleStatus } from '@flash-sale/shared-types';
import { zsetKey, holdKey, consumedKey } from '@flash-sale/shared-utils';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';
const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
const BULL_PREFIX = process.env.BULLMQ_PREFIX ?? 'flashsale';

const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);
const NOT_FIRST_DELAY_MS = Number(process.env.NOT_FIRST_DELAY_MS ?? 1500);
const NOT_YET_ACTIVE_DELAY_MS = Number(
  process.env.NOT_YET_ACTIVE_DELAY_MS ?? 3000
);

// when using "throw to retry", these are only labels (content doesn't matter)
const RETRY_NOT_YET_ACTIVE = new Error('RETRY_NOT_YET_ACTIVE');
const RETRY_NOT_FIRST = new Error('RETRY_NOT_FIRST');
const RETRY_NO_STOCK = new Error('RETRY_NO_STOCK');

const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`;
const invKey = (saleId: string) => `fsinv:${saleId}`;

async function bootstrap() {
  await mongoose.connect(MONGODB_URI);
  const redis = new IORedis(REDIS_URL);

  // queue is used to schedule release_hold
  const queue = new Queue(QUEUE_NAME, {
    connection: { url: REDIS_URL },
    prefix: BULL_PREFIX,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { name } = job;

      // -------------------------------
      // 1️⃣ RESERVE JOB
      // -------------------------------
      if (name === 'reserve') {
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

        // Short-circuit: if user already purchased once, never grant another hold.
        if (await redis.exists(consumedKey(flashSaleId, email))) {
          await redis.zrem(qKey, email);
          // Do NOT retry; just finish (no hold to grant)
          return { ok: false, reason: 'already_consumed' as const };
        }

        // ---- Load sale meta (short cache) ----
        let saleMeta = JSON.parse(
          (await redis.get(saleCacheKey(flashSaleId))) ?? 'null'
        );
        if (!saleMeta) {
          let doc = null;
          if (Types.ObjectId.isValid(flashSaleId)) {
            doc = await flashSaleMongoModel
              .findById(new Types.ObjectId(flashSaleId), {
                status: 1,
                startsAt: 1,
                endsAt: 1,
                currentQuantity: 1,
                startingQuantity: 1,
              })
              .lean();
          }
          if (!doc) {
            doc = await flashSaleMongoModel
              .findOne(
                { _id: flashSaleId },
                {
                  status: 1,
                  startsAt: 1,
                  endsAt: 1,
                  currentQuantity: 1,
                  startingQuantity: 1,
                }
              )
              .lean();
          }

          saleMeta = doc;

          if (!saleMeta) {
            await redis.zrem(qKey, email);
            // Do NOT retry; the sale truly doesn't exist
            throw new Error('flash_sale_not_found');
          }

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

        // If sale ended/cancelled → cleanup and stop (no retries)
        if (!isOnSchedule || now >= endsAt) {
          await redis.zrem(qKey, email);
          throw new Error('sale_inactive_or_ended');
        }

        // Must be sale window → else retry later (backoff handles the delay)
        if (!isActiveWindow) {
          throw RETRY_NOT_YET_ACTIVE;
        }

        // Must be head-of-line → else retry later
        const rank = await redis.zrank(qKey, email);
        const isFirst = rank === 0;
        if (!isFirst) {
          throw RETRY_NOT_FIRST;
        }

        // Ensure Redis inventory key exists (only once)
        // Use SETNX to avoid clobbering under races
        const initInv = saleMeta.startingQuantity ?? 0;
        await redis.set(invKey(flashSaleId), String(initInv), 'NX');

        // Atomic stock decrement
        const stockLeft = await redis.decr(invKey(flashSaleId));
        if (stockLeft < 0) {
          // Rollback and retry later (someone else got it)
          await redis.incr(invKey(flashSaleId));
          throw RETRY_NO_STOCK;
        }

        // Grant hold + remove from visible queue (atomic)
        const holdTime = Math.max(1, Number(holdTtlSec) || HOLD_TTL_SECONDS);
        const multi = redis.multi();
        multi.set(holdKey(flashSaleId, email), '1', 'EX', holdTime);
        multi.zrem(qKey, email);
        await multi.exec();

        // Schedule release_hold job after TTL (idempotent id)
        await queue.add(
          'release_hold',
          { flashSaleId, email },
          {
            delay: holdTime * 1000,
            jobId: `release:${flashSaleId}:${email}`,
            removeOnComplete: true,
            removeOnFail: true,
          }
        );

        return { ok: true, holdTime, stockLeft };
      }

      // -------------------------------
      // 2️⃣ RELEASE_HOLD JOB
      // -------------------------------
      if (name === 'release_hold') {
        const { flashSaleId, email } = job.data as {
          flashSaleId: string;
          email: string;
        };

        // Exec may return null per ioredis types — handle defensively
        const execRes = await redis
          .multi()
          .exists(holdKey(flashSaleId, email)) // -> 0/1
          .exists(consumedKey(flashSaleId, email)) // -> 0/1
          .exec();

        if (!execRes) {
          console.warn('[release_hold] MULTI.exec() returned null; skipping');
          return { ok: false, reason: 'exec_null' as const };
        }

        const isActive = Number(execRes[0]?.[1]) === 1;
        const isConsumed = Number(execRes[1]?.[1]) === 1;

        if (!isActive && !isConsumed) {
          // Hold expired and not purchased → return stock to Redis
          const newStock = await redis.incr(invKey(flashSaleId));
          console.log(
            `[release_hold] Restored 1 unit to ${flashSaleId} (now ${newStock})`
          );
        } else if (isConsumed) {
          console.log(
            `[release_hold] Skipping restore: purchase consumed for ${email}`
          );
        } else {
          console.log(
            `[release_hold] Hold still active for ${email}, skipping restore`
          );
        }
        return { ok: true };
      }

      return;
    },
    {
      connection: { url: REDIS_URL },
      prefix: BULL_PREFIX,
      concurrency: 8,
      // Make sure the lock outlives your processing and backoff jitter
      lockDuration: 30000, // 30s is plenty for this short handler
    }
  );

  // Logs
  worker.on('active', (j) =>
    console.log(
      '[worker active]',
      j.id,
      j.name,
      j.data?.email,
      j.data?.flashSaleId
    )
  );
  worker.on('completed', (j, r) =>
    console.log('[worker done]', j.id, j.name, r)
  );
  worker.on('failed', (j, e) =>
    console.error('[worker fail]', j?.id, j?.name, e?.message)
  );

  const shutdown = async () => {
    await worker.close();
    await queue.close();
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
