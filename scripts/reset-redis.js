/*
 Reset Redis data for Flash Sale system.
 - Clears BullMQ queues (jobs, completed, failed, etc.)
 - Clears flash sale queues (fsq:*)
 - Clears hold keys (fsh:*)
 - Clears sale metadata cache (fsmeta:*)
 - Preserves other Redis data if any
*/

const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://:redispass@localhost:6379';
const QUEUE_NAME = process.env.QUEUE_NAME || 'sale-processing-queue';

async function resetRedis() {
  const redis = new IORedis(REDIS_URL);
  
  try {
    console.log('🔄 Connecting to Redis...');
    
    // Test connection
    await redis.ping();
    console.log('✅ Connected to Redis');
    
    let totalDeleted = 0;
    
    // 1. Clear BullMQ queue data
    console.log('\n📋 Clearing BullMQ queue data...');
    const queuePatterns = [
      `bull:${QUEUE_NAME}:*`,
      `bull:${QUEUE_NAME}:jobs:*`,
      `bull:${QUEUE_NAME}:events`,
      `bull:${QUEUE_NAME}:stalled`,
      `bull:${QUEUE_NAME}:waiting`,
      `bull:${QUEUE_NAME}:active`,
      `bull:${QUEUE_NAME}:completed`,
      `bull:${QUEUE_NAME}:failed`,
      `bull:${QUEUE_NAME}:delayed`,
      `bull:${QUEUE_NAME}:paused`,
      `bull:${QUEUE_NAME}:meta`,
    ];
    
    for (const pattern of queuePatterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        totalDeleted += deleted;
        console.log(`  - Deleted ${deleted} keys matching: ${pattern}`);
      }
    }
    
    // 2. Clear flash sale queue positions (fsq:*)
    console.log('\n🎯 Clearing flash sale queues...');
    const queueKeys = await redis.keys('fsq:*');
    if (queueKeys.length > 0) {
      const deleted = await redis.del(...queueKeys);
      totalDeleted += deleted;
      console.log(`  - Deleted ${deleted} flash sale queue keys`);
    }
    
    // 3. Clear hold keys (fsh:*)
    console.log('\n🔒 Clearing hold keys...');
    const holdKeys = await redis.keys('fsh:*');
    if (holdKeys.length > 0) {
      const deleted = await redis.del(...holdKeys);
      totalDeleted += deleted;
      console.log(`  - Deleted ${deleted} hold keys`);
    }
    
    // 4. Clear sale metadata cache (fsmeta:*)
    console.log('\n📊 Clearing sale metadata cache...');
    const metaKeys = await redis.keys('fsmeta:*');
    if (metaKeys.length > 0) {
      const deleted = await redis.del(...metaKeys);
      totalDeleted += deleted;
      console.log(`  - Deleted ${deleted} metadata cache keys`);
    }
    
    // 5. Clear any other flash sale related keys
    console.log('\n🧹 Clearing other flash sale keys...');
    const otherPatterns = [
      'fs:*',
      'flashsale:*',
      'sale:*',
    ];
    
    for (const pattern of otherPatterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        totalDeleted += deleted;
        console.log(`  - Deleted ${deleted} keys matching: ${pattern}`);
      }
    }
    
    console.log(`\n✅ Redis reset complete!`);
    console.log(`📊 Total keys deleted: ${totalDeleted}`);
    
    if (totalDeleted === 0) {
      console.log('ℹ️  No flash sale related keys found - Redis was already clean');
    }
    
  } catch (error) {
    console.error('❌ Error resetting Redis:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
    console.log('🔌 Disconnected from Redis');
  }
}

// Run if called directly
if (require.main === module) {
  resetRedis().catch(console.error);
}

module.exports = { resetRedis };