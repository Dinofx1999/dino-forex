/* eslint-disable */
const { getDB } = require('./mongodb');
const { log, colors } = require('../module/helper/text.format');

/**
 * Định nghĩa schemas cho collections
 */
const schemas = {
  // Schema cho symbol_config
  symbol_config: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['Symbol', 'Spread_STD', 'Spread_ECN', 'Sydney', 'Tokyo', 'London', 'NewYork'],
        properties: {
          Symbol: {
            bsonType: 'string',
            description: 'Symbol name - required'
          },
          Spread_STD: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'Standard spread'
          },
          Spread_ECN: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'ECN spread'
          },
          Sydney: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'Sydney session multiplier'
          },
          Tokyo: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'Tokyo session multiplier'
          },
          London: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'London session multiplier'
          },
          NewYork: {
            bsonType: ['int', 'double'],
            minimum: 0,
            description: 'New York session multiplier'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Creation timestamp'
          },
          updatedAt: {
            bsonType: 'date',
            description: 'Last update timestamp'
          }
        }
      }
    },
    validationLevel: 'strict',
    validationAction: 'error'
  },
  //Analystics
  analysis: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['Broker', 'TimeStart', 'TimeCurrent', 'Symbol', 'Messenger', 'Broker_Main','IsStable'],
        properties: {
          Broker: {
            bsonType: 'string',
            description: 'Broker name - required'
          },
          TimeStart: {
            bsonType: 'string',
            pattern: '^\\d{4}\\.\\d{2}\\.\\d{2} \\d{2}:\\d{2}:\\d{2}$',
            description: 'Start time (YYYY.MM.DD HH:MM:SS) - required'
          },
          TimeCurrent: {
            bsonType: 'string',
            pattern: '^\\d{4}\\.\\d{2}\\.\\d{2} \\d{2}:\\d{2}:\\d{2}$',
            description: 'Current time (YYYY.MM.DD HH:MM:SS) - required'
          },
          Symbol: {
            bsonType: 'string',
            description: 'Trading symbol - required'
          },
          Count: {
            bsonType: ['string', 'int'],
            description: 'Count value'
          },
          Messenger: {
            bsonType: 'string',
            enum: ['BUY', 'SELL', 'CLOSE', 'HOLD', 'PENDING'],
            description: 'Trade signal - required'
          },
          Broker_Main: {
            bsonType: 'string',
            description: 'Main broker name - required'
          },
          KhoangCach: {
            bsonType: ['string', 'double', 'int'],
            description: 'Distance/spread difference'
          },
          Symbol_Raw: {
            bsonType: 'string',
            description: 'Raw symbol name'
          },
          Spread_main: {
            bsonType: ['string', 'double'],
            description: 'Main spread value'
          },
          IsStable: {
            bsonType: 'bool',
            description: 'Is the symbol stable?',
          },
          createdAt: {
            bsonType: 'date',
            description: 'Record creation timestamp'
          },
          updatedAt: {
            bsonType: 'date',
            description: 'Last update timestamp'
          }
        }
      }
    },
    validationLevel: 'moderate',  // Cho phép linh hoạt hơn
    validationAction: 'warn'       // Warning thay vì reject
  },

   users: {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['username', 'email', 'password', 'role'],
        properties: {
          username: {
            bsonType: 'string',
            minLength: 3,
            maxLength: 50,
            description: 'Username - required, unique'
          },
          fullname: {
            bsonType: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Full name - required, unique'
          },
          email: {
            bsonType: 'string',
            pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
            description: 'Email address - required, unique'
          },
          password: {
            bsonType: 'string',
            description: 'Hashed password - required'
          },
          role: {
            bsonType: 'string',
            enum: ['admin', 'user', 'trader', 'viewer'],
            description: 'User role - required'
          },
          isActive: {
            bsonType: 'bool',
            description: 'Account active status'
          },
          lastLogin: {
            bsonType: 'date',
            description: 'Last login timestamp'
          },
          refreshToken: {
            bsonType: 'string',
            description: 'JWT refresh token'
          },
          createdAt: {
            bsonType: 'date',
            description: 'Account creation timestamp'
          },
          updatedAt: {
            bsonType: 'date',
            description: 'Last update timestamp'
          }
        }
      }
    },
    validationLevel: 'strict',
    validationAction: 'error'
  }
};

/**
 * Setup tất cả schemas
 */
async function setupSchemas() {
  try {
    const db = getDB();
    
    for (const [collectionName, schema] of Object.entries(schemas)) {
      try {
        const collections = await db.listCollections({ name: collectionName }).toArray();
        
        if (collections.length === 0) {
          // Tạo collection mới với schema
          await db.createCollection(collectionName, schema);
          log(colors.green, `✅ Created collection: ${collectionName}`);
        } else {
          // Update schema cho collection đã tồn tại
          await db.command({
            collMod: collectionName,
            ...schema
          });
          log(colors.blue, `✅ Updated schema: ${collectionName}`);
        }
      } catch (error) {
        log(colors.red, `❌ Error setting up ${collectionName}:`, error.message);
      }
    }
    
  } catch (error) {
    log(colors.red, '❌ setupSchemas error:', error.message);
    throw error;
  }
}

module.exports = {
  schemas,
  setupSchemas,
};