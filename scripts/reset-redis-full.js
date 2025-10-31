/*
 DANGER: Complete Redis reset - clears ALL data in Redis.
 Use with extreme caution! This will delete everything in the Redis database.
*/

const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://:redispass@localhost:6379';

async function resetRedisCompletely() {
  const redis = new IORedis(REDIS_URL);
  
  try {
    console.log('⚠️  WARNING: This will delete ALL data in Redis!');
    console.log('🔄 Connecting to Redis...');
    
    // Test connection
    await redis.ping();
    console.log('✅ Connected to Redis');
    
    // Get database info before clearing
    const info = await redis.info('keyspace');
    console.log('\n📊 Current Redis info:');
    console.log(info || 'No keyspace info available');
    
    // Count keys before deletion
    const keyCount = await redis.dbsize();
    console.log(`\n🔢 Total keys in database: ${keyCount}`);
    
    if (keyCount === 0) {
      console.log('ℹ️  Redis database is already empty');
      return;
    }
    
    // Clear everything
    console.log('\n💥 Executing FLUSHDB...');
    await redis.flushdb();
    
    // Verify it's empty
    const remainingKeys = await redis.dbsize();
    
    if (remainingKeys === 0) {
      console.log('✅ Redis database completely cleared!');
      console.log(`📊 Deleted ${keyCount} keys total`);
    } else {
      console.log(`⚠️  Warning: ${remainingKeys} keys still remain`);
    }
    
  } catch (error) {
    console.error('❌ Error clearing Redis:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
    console.log('🔌 Disconnected from Redis');
  }
}

// Run if called directly
if (require.main === module) {
  resetRedisCompletely().catch(console.error);
}

module.exports = { resetRedisCompletely };