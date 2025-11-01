import 'dotenv/config';
import { Worker, Queue, Job, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import mongoose, { Types } from 'mongoose';
import { flashSaleMongoModel, FlashSaleStatus } from '@flash-sale/shared-types';
import { zsetKey, holdKey, consumedKey } from '@flash-sale/shared-utils';
import { startMetricsServer } from './metrics-server';

export const REDIS_URL =
  process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
export const MONGODB_URI =
  process.env.MONGODB_URI ??
  'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';
export const QUEUE_NAME = process.env.QUEUE_NAME ?? 'sale-processing-queue';
export const BULL_PREFIX = process.env.BULLMQ_PREFIX ?? 'flashsale';
export const HOLD_TTL_SECONDS = Number(process.env.HOLD_TTL_SECONDS ?? 900);

export const RETRY_NOT_YET_ACTIVE = new Error('RETRY_NOT_YET_ACTIVE');
export const RETRY_NOT_FIRST = new Error('RETRY_NOT_FIRST');
export const RETRY_NO_STOCK = new Error('RETRY_NO_STOCK');

export const saleCacheKey = (saleId: string) => `fsmeta:${saleId}`;
export const invKey = (saleId: string) => `fsinv:${saleId}`;
export const lockKey = (saleId: string) => `fslock:${saleId}`;

export async function withLock<T>(
  redis: Redis,
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T | { ok: false; reason: 'lock_busy' }> {
  const token = `${Date.now()}:${Math.random()}`;
  const acquired = await (redis as any).set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') return { ok: false, reason: 'lock_busy' as const };
  try {
    return await fn();
  } finally {
    const val = await redis.get(key);
    if (val === token) await redis.del(key);
  }
}

export function createProcessors(redis: Redis, queue: Queue) {
  async function reserveJobProcessor(job: Job) {
    if (job.name !== 'reserve') return;
    const {
      email: rawEmail,
      flashSaleId,
      holdTtlSec,
    } = job.data as {
      email?: string;
      flashSaleId?: string;
      holdTtlSec?: number;
    };
    if (!rawEmail || !flashSaleId) {
      throw new Error('Missing required job data');
    }
    const email = rawEmail.trim().toLowerCase();
    const now = new Date();
    const qKey = zsetKey(flashSaleId);
    if (await redis.exists(consumedKey(flashSaleId, email))) {
      await redis.zrem(qKey, email);
      return { ok: false, reason: 'already_consumed' as const };
    }
    let saleMeta: any;
    const cached = await redis.get(saleCacheKey(flashSaleId));
    if (cached) {
      try {
        saleMeta = JSON.parse(cached);
      } catch {
        throw new Error('Invalid sale metadata');
      }
    } else {
      let doc: any = null;
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
      if (!doc) {
        await redis.zrem(qKey, email);
        throw new Error('flash_sale_not_found');
      }
      saleMeta = doc;
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
    if (!isOnSchedule || now >= endsAt) {
      await redis.zrem(qKey, email);
      throw new Error('sale_inactive_or_ended');
    }
    if (!isActiveWindow) throw RETRY_NOT_YET_ACTIVE;

    const lockRes = await withLock(
      redis,
      lockKey(flashSaleId),
      5000,
      async () => {
        const rank = await redis.zrank(qKey, email);
        if (rank !== 0) throw RETRY_NOT_FIRST;

        const initInv = Number(saleMeta.startingQuantity ?? 0);
        await (redis as any).set(invKey(flashSaleId), String(initInv), 'NX');
        const curStock = parseInt(
          (await redis.get(invKey(flashSaleId))) ?? '0',
          10
        );
        if (curStock <= 0) throw RETRY_NO_STOCK;

        await redis.decr(invKey(flashSaleId));
        const holdTime = Math.max(1, Number(holdTtlSec) || HOLD_TTL_SECONDS);

        await redis
          .multi()
          .set(holdKey(flashSaleId, email), '1', 'EX', holdTime)
          .zrem(qKey, email)
          .exec();

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

        return { ok: true as const, holdTime, stockLeft: curStock - 1 };
      }
    );

    if (
      (lockRes as any)?.ok === false &&
      (lockRes as any)?.reason === 'lock_busy'
    ) {
      throw RETRY_NOT_FIRST;
    }
    return lockRes;
  }

  async function releaseHoldJobProcessor(job: Job) {
    if (job.name !== 'release_hold') return;
    const { flashSaleId, email } = job.data as {
      flashSaleId?: string;
      email?: string;
    };
    if (!flashSaleId || !email) {
      throw new Error('Missing required job data');
    }
    const lockRes = await withLock(
      redis,
      lockKey(flashSaleId),
      5000,
      async () => {
        const hk = holdKey(flashSaleId, email);
        const ck = consumedKey(flashSaleId, email);
        const inv = invKey(flashSaleId);
        const qk = zsetKey(flashSaleId);

        const execRes = await redis.multi().exists(hk).exists(ck).exec();
        if (!execRes)
          return { ok: false as const, status: 'exec_null' as const };

        const holdExists = Number(execRes[0]?.[1]) === 1;
        const consumedExists = Number(execRes[1]?.[1]) === 1;

        if (consumedExists)
          return { ok: true as const, status: 'consumed' as const };
        if (holdExists) return { ok: true as const, status: 'active' as const };

        await redis.incr(inv);
        const popped = await (redis as any).zpopmin(qk, 1);
        if (!popped || popped.length < 2) {
          return { ok: true as const, status: 'restored' as const };
        }

        const nextEmail = String(popped[0]);
        const stockNow = parseInt((await redis.get(inv)) ?? '0', 10);
        if (stockNow > 0) {
          await redis.decr(inv);
          const nextHoldTtl = HOLD_TTL_SECONDS;

          await redis.set(
            holdKey(flashSaleId, nextEmail),
            '1',
            'EX',
            nextHoldTtl
          );
          await queue.add(
            'release_hold',
            { flashSaleId, email: nextEmail },
            {
              delay: nextHoldTtl * 1000,
              jobId: `release:${flashSaleId}:${nextEmail}`,
              removeOnComplete: true,
              removeOnFail: true,
            }
          );

          return { ok: true as const, status: 'assigned' as const, nextEmail };
        }

        return { ok: true as const, status: 'restored' as const };
      }
    );

    if (
      (lockRes as any)?.ok === false &&
      (lockRes as any)?.reason === 'lock_busy'
    ) {
      return { ok: false as const, status: 'lock_busy' as const };
    }
    return lockRes;
  }

  return { reserveJobProcessor, releaseHoldJobProcessor };
}

export async function startWorker() {
  await mongoose.connect(MONGODB_URI);
  const redis = new Redis(REDIS_URL);

  const queue = new Queue(QUEUE_NAME, {
    connection: { url: REDIS_URL },
    prefix: BULL_PREFIX,
  });

  const queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: { url: REDIS_URL },
    prefix: BULL_PREFIX,
  });
  await queueEvents.waitUntilReady();

  const { reserveJobProcessor, releaseHoldJobProcessor } = createProcessors(
    redis,
    queue
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'reserve') return reserveJobProcessor(job);
      if (job.name === 'release_hold') return releaseHoldJobProcessor(job);
      return;
    },
    {
      connection: { url: REDIS_URL },
      prefix: BULL_PREFIX,
      concurrency: 8,
      lockDuration: 30_000,
    }
  );

  await startMetricsServer();

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

  queueEvents.on('failed', ({ jobId, failedReason }) =>
    console.error('[events failed]', jobId, failedReason)
  );

  const stop = async () => {
    await worker.close();
    await queueEvents.close();
    await queue.close();
    await redis.quit();
    await mongoose.disconnect();
  };

  const sigHandler = async () => {
    await stop();
    process.exit(0);
  };
  process.on('SIGINT', sigHandler);
  process.on('SIGTERM', sigHandler);

  return { worker, queue, queueEvents, redis, stop };
}
