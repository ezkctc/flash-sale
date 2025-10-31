/*
 Redis Display - Simple script to show all Redis cache data
 Lightweight version for quick inspection
*/

const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://:redispass@localhost:6379';

async function displayRedisData() {
  const redis = new IORedis(REDIS_URL);
  
  try {
    console.log('🔍 Redis Cache Contents');
    console.log('=' .repeat(50));
    
    // Test connection
    await redis.ping();
    console.log('✅ Connected to Redis\n');
    
    // Get all keys
    const keys = await redis.keys('*');
    
    if (keys.length === 0) {
      console.log('📭 Redis is empty - no keys found');
      return;
    }

    console.log(`📊 Found ${keys.length} keys\n`);

    // Sort keys for better readability
    keys.sort();

    for (const key of keys) {
      try {
        const type = await redis.type(key);
        const ttl = await redis.ttl(key);
        
        let value;
        switch (type) {
          case 'string':
            value = await redis.get(key);
            break;
          case 'hash':
            value = await redis.hgetall(key);
            break;
          case 'list':
            const length = await redis.llen(key);
            value = `[List with ${length} items]`;
            break;
          case 'set':
            const size = await redis.scard(key);
            value = `{Set with ${size} members}`;
            break;
          case 'zset':
            const zsize = await redis.zcard(key);
            const sample = await redis.zrange(key, 0, 2, 'WITHSCORES');
            value = `[ZSet with ${zsize} members] Sample: ${JSON.stringify(sample)}`;
            break;
          default:
            value = `<${type}>`;
        }

        const ttlInfo = ttl > 0 ? ` (expires in ${ttl}s)` : ttl === -1 ? ' (no expiry)' : ' (expired)';
        
        console.log(`🔑 ${key}${ttlInfo}`);
        console.log(`   Type: ${type}`);
        
        if (typeof value === 'string' && value.length > 200) {
          console.log(`   Value: ${value.substring(0, 200)}...`);
        } else if (typeof value === 'object') {
          console.log(`   Value: ${JSON.stringify(value, null, 2)}`);
        } else {
          console.log(`   Value: ${value}`);
        }
        console.log('');
        
      } catch (error) {
        console.log(`❌ Error reading ${key}: ${error.message}\n`);
      }
    }

    console.log('='.repeat(50));
    console.log(`📈 Total: ${keys.length} keys`);
    
  } catch (error) {
    console.error('❌ Error connecting to Redis:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// Run if called directly
if (require.main === module) {
  displayRedisData().catch(console.error);
}

module.exports = { displayRedisData };