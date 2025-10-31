/*
 Investigation script to check what might be deleting flash sales
 Run this to analyze potential deletion sources and database state
*/

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin';

async function investigateDeletions() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 Flash Sale Deletion Investigation');
    console.log('=' .repeat(50));
    
    // Check current flash sales
    const flashSales = await db.collection('flash_sales').find({}).sort({ createdAt: -1 }).toArray();
    console.log(`📊 Current flash sales in database: ${flashSales.length}`);
    
    if (flashSales.length > 0) {
      console.log('\n📋 Flash Sales Found:');
      flashSales.forEach((sale, index) => {
        console.log(`  ${index + 1}. ${sale.name} (${sale._id})`);
        console.log(`     Status: ${sale.status}`);
        console.log(`     Created: ${sale.createdAt}`);
        console.log(`     Period: ${sale.startsAt} → ${sale.endsAt}`);
        console.log(`     Inventory: ${sale.currentQuantity}/${sale.startingQuantity}`);
        console.log('');
      });
    } else {
      console.log('❌ No flash sales found in database!');
    }
    
    // Check for any deletion logs or patterns
    console.log('\n🔍 Checking for potential deletion sources...');
    
    // Check if there are any orders referencing deleted sales
    const orders = await db.collection('orders').find({}).toArray();
    console.log(`📦 Orders in database: ${orders.length}`);
    
    if (orders.length > 0) {
      const uniqueSaleIds = [...new Set(orders.map(o => o.flashSaleId?.toString()).filter(Boolean))];
      console.log(`🎯 Unique flash sale IDs referenced in orders: ${uniqueSaleIds.length}`);
      
      // Check which sale IDs in orders don't have corresponding flash sales
      const currentSaleIds = new Set(flashSales.map(s => s._id.toString()));
      const orphanedOrderSaleIds = uniqueSaleIds.filter(id => !currentSaleIds.has(id));
      
      if (orphanedOrderSaleIds.length > 0) {
        console.log('⚠️  Found orders referencing deleted flash sales:');
        orphanedOrderSaleIds.forEach(id => {
          const orderCount = orders.filter(o => o.flashSaleId?.toString() === id).length;
          console.log(`   - Sale ID ${id}: ${orderCount} orders`);
        });
      }
    }
    
    // Check database collections
    const collections = await db.listCollections().toArray();
    console.log('\n📚 Database Collections:');
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`   - ${col.name}: ${count} documents`);
    }
    
    // Check for any indexes that might cause issues
    const indexes = await db.collection('flash_sales').indexes();
    console.log('\n🔍 Flash Sales Collection Indexes:');
    indexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
  } catch (error) {
    console.error('❌ Error investigating deletions:', error.message);
  } finally {
    await client.close();
  }
}

// Run if called directly
if (require.main === module) {
  investigateDeletions().catch(console.error);
}

module.exports = { investigateDeletions };