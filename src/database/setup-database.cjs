/* eslint-disable */
const { connectMongoDB, disconnectMongoDB, getDB } = require('./mongodb');
const { setupSchemas } = require('./schemas');
const { log, colors } = require('../module/helper/text.format');

async function setupDatabase() {
  try {
    log(colors.blue, '🔄 Setting up database...', colors.reset, '');
    
    await connectMongoDB();
    const db = getDB();
    
    await setupSchemas();
    
    log(colors.blue, '🔄 Creating indexes...', colors.reset, '');
    
    await db.collection('symbol_config').createIndexes([
      { key: { Symbol: 1 }, unique: true },
      { key: { createdAt: -1 } }
    ]);

    await db.collection('analysis').createIndexes([
      { key: { TimeCurrent: -1, Count: -1 } },
      { key: { createdAt: -1 } }
    ]);
    
    
    log(colors.green, '✅ Database setup completed!', colors.reset, '');
    
    await disconnectMongoDB();
    
    return true;
    
  } catch (error) {
    log(colors.red, '❌ Setup failed:', colors.reset, error.message);
    console.error(error);
    throw error;
  }
}

// ✅ EXPORT CommonJS style
module.exports = { setupDatabase };

// ✅ Nếu chạy trực tiếp (không import)
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}