/*
 Reset Better Auth data in MongoDB.
 - Clears users, sessions, verifications, accounts, rate limits (singular/plural variants).
 - Uses MONGODB_URL if provided; otherwise MONGODB_URI + MONGO_DB.
*/

const { MongoClient } = require('mongodb');

(async () => {
  const mongoUrl =
    process.env.MONGODB_URL ||
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017';
  const dbName =
    process.env.MONGO_DB ||
    (process.env.MONGODB_URL
      ? new URL(process.env.MONGODB_URL).pathname.replace(/^\//, '') ||
        'flash_sale_db'
      : 'flash_sale_db');

  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const db = client.db(dbName);

    const candidates = [
      'user',
      'users',
      'session',
      'sessions',
      'verification',
      'verifications',
      'account',
      'accounts',
      'rateLimit',
      'rateLimits',
      'rate_limit',
      'rate_limits',
    ];

    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    let totalDeleted = 0;
    for (const name of candidates) {
      if (!existingNames.has(name)) continue;
      const res = await db.collection(name).deleteMany({});
      console.log(
        `[auth:reset] cleared collection '${name}': ${res.deletedCount} docs`
      );
      totalDeleted += res.deletedCount || 0;
    }

    if (totalDeleted === 0) {
      console.log(
        '[auth:reset] no Better Auth collections found or already empty.'
      );
    } else {
      console.log(`[auth:reset] done. total deleted: ${totalDeleted}`);
    }
  } catch (err) {
    console.error('[auth:reset] error:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
