/*
 Redis Monitor - Display all cache data and monitor changes in real-time
 Shows current state and watches for live updates
*/

const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://:redispass@localhost:6379';

class RedisMonitor {
  constructor() {
    this.redis = new IORedis(REDIS_URL);
    this.monitor = new IORedis(REDIS_URL);
    this.isMonitoring = false;
  }

  async displayAllData() {
    try {
      console.log('🔍 Redis Cache Inspector');
      console.log('=' .repeat(50));
      
      // Get all keys
      const allKeys = await this.redis.keys('*');
      
      if (allKeys.length === 0) {
        console.log('📭 Redis is empty - no keys found');
        return;
      }

      console.log(`📊 Found ${allKeys.length} keys total\n`);

      // Group keys by pattern
      const keyGroups = this.groupKeys(allKeys);

      for (const [pattern, keys] of Object.entries(keyGroups)) {
        await this.displayKeyGroup(pattern, keys);
      }

      console.log('\n' + '='.repeat(50));
      console.log(`📈 Total keys: ${allKeys.length}`);
      
    } catch (error) {
      console.error('❌ Error displaying Redis data:', error.message);
    }
  }

  groupKeys(keys) {
    const groups = {
      'BullMQ Jobs': [],
      'Flash Sale Queues (fsq)': [],
      'Hold Keys (fsh)': [],
      'Sale Metadata (fsmeta)': [],
      'Other Flash Sale': [],
      'System/Other': []
    };

    keys.forEach(key => {
      if (key.startsWith('bull:')) {
        groups['BullMQ Jobs'].push(key);
      } else if (key.startsWith('fsq:')) {
        groups['Flash Sale Queues (fsq)'].push(key);
      } else if (key.startsWith('fsh:')) {
        groups['Hold Keys (fsh)'].push(key);
      } else if (key.startsWith('fsmeta:')) {
        groups['Sale Metadata (fsmeta)'].push(key);
      } else if (key.startsWith('fs:') || key.startsWith('flashsale:') || key.startsWith('sale:')) {
        groups['Other Flash Sale'].push(key);
      } else {
        groups['System/Other'].push(key);
      }
    });

    // Remove empty groups
    Object.keys(groups).forEach(group => {
      if (groups[group].length === 0) {
        delete groups[group];
      }
    });

    return groups;
  }

  async displayKeyGroup(groupName, keys) {
    console.log(`\n🏷️  ${groupName} (${keys.length} keys)`);
    console.log('-'.repeat(40));

    for (const key of keys.slice(0, 10)) { // Limit to first 10 keys per group
      await this.displayKeyValue(key);
    }

    if (keys.length > 10) {
      console.log(`   ... and ${keys.length - 10} more keys`);
    }
  }

  async displayKeyValue(key) {
    try {
      const type = await this.redis.type(key);
      const ttl = await this.redis.ttl(key);
      
      let value;
      let displayValue;

      switch (type) {
        case 'string':
          value = await this.redis.get(key);
          displayValue = this.formatValue(value);
          break;
        case 'hash':
          value = await this.redis.hgetall(key);
          displayValue = JSON.stringify(value, null, 2);
          break;
        case 'list':
          const listLength = await this.redis.llen(key);
          value = await this.redis.lrange(key, 0, 4); // First 5 items
          displayValue = `[${listLength} items] ${JSON.stringify(value)}`;
          if (listLength > 5) displayValue += ` ...and ${listLength - 5} more`;
          break;
        case 'set':
          const setSize = await this.redis.scard(key);
          value = await this.redis.smembers(key);
          displayValue = `{${setSize} members} ${JSON.stringify(value.slice(0, 5))}`;
          if (setSize > 5) displayValue += ` ...and ${setSize - 5} more`;
          break;
        case 'zset':
          const zsetSize = await this.redis.zcard(key);
          value = await this.redis.zrange(key, 0, 4, 'WITHSCORES');
          const pairs = [];
          for (let i = 0; i < value.length; i += 2) {
            pairs.push(`${value[i]}:${value[i + 1]}`);
          }
          displayValue = `[${zsetSize} members] ${JSON.stringify(pairs)}`;
          if (zsetSize > 5) displayValue += ` ...and ${zsetSize - 5} more`;
          break;
        default:
          displayValue = `<${type}>`;
      }

      const ttlInfo = ttl > 0 ? ` (TTL: ${ttl}s)` : ttl === -1 ? ' (no expiry)' : ' (expired)';
      
      console.log(`   📝 ${key}${ttlInfo}`);
      console.log(`      Type: ${type} | Value: ${displayValue}`);
      
    } catch (error) {
      console.log(`   ❌ ${key} - Error: ${error.message}`);
    }
  }

  formatValue(value) {
    if (!value) return 'null';
    if (value.length > 100) return value.substring(0, 100) + '...';
    
    // Try to parse as JSON for better display
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️  Already monitoring');
      return;
    }

    console.log('\n🔄 Starting Redis monitor...');
    console.log('Press Ctrl+C to stop monitoring\n');
    
    this.isMonitoring = true;

    try {
      await this.monitor.monitor();
      
      this.monitor.on('monitor', (time, args, source, database) => {
        const timestamp = new Date(time * 1000).toISOString();
        const command = args.join(' ');
        
        // Filter out noisy commands
        const noisyCommands = ['ping', 'info', 'client'];
        const commandLower = args[0]?.toLowerCase() || '';
        
        if (!noisyCommands.includes(commandLower)) {
          console.log(`[${timestamp}] ${source} > ${command}`);
        }
      });

    } catch (error) {
      console.error('❌ Error starting monitor:', error.message);
      this.isMonitoring = false;
    }
  }

  async stopMonitoring() {
    if (this.isMonitoring) {
      console.log('\n🛑 Stopping monitor...');
      this.isMonitoring = false;
      await this.monitor.quit();
    }
  }

  async close() {
    await this.redis.quit();
    if (this.isMonitoring) {
      await this.stopMonitoring();
    }
  }
}

async function main() {
  const monitor = new RedisMonitor();
  
  try {
    // Test connection
    await monitor.redis.ping();
    console.log('✅ Connected to Redis\n');

    const args = process.argv.slice(2);
    const command = args[0] || 'display';

    switch (command) {
      case 'display':
      case 'show':
        await monitor.displayAllData();
        break;
        
      case 'monitor':
      case 'watch':
        await monitor.displayAllData();
        await monitor.startMonitoring();
        break;
        
      case 'help':
        console.log('Redis Monitor Commands:');
        console.log('  display|show  - Show all current Redis data');
        console.log('  monitor|watch - Show data + monitor live changes');
        console.log('  help          - Show this help');
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log('Use "help" to see available commands');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down...');
    await monitor.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await monitor.close();
    process.exit(0);
  });
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { RedisMonitor };