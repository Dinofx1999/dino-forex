/* eslint-disable */
const Redis = require('ioredis');
const { log, colors } = require('../helper/text.format');

// Publisher Client
const redisPublisher = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Subscriber Client
const redisSubscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const channelHandlers = new Map();

// ===== EVENT LISTENERS =====
redisPublisher.on('connect', () => log(colors.green, 'Redis Pub/Sub', colors.reset, '✅ Redis Publisher Connected'));
redisPublisher.on('error', (err) => log(colors.red, 'Redis Pub/Sub', colors.reset, '❌ Publisher Error:', err.message));

redisSubscriber.on('connect', () => log(colors.green, 'Redis Pub/Sub', colors.reset, '✅ Redis Subscriber Connected'));
redisSubscriber.on('error', (err) => log(colors.red, 'Redis Pub/Sub', colors.reset, '❌ Subscriber Error:', err.message));

redisSubscriber.on('message', (channel, message) => {
  const handler = channelHandlers.get(channel);
  if (handler) {
    try {
      const data = JSON.parse(message);
      handler(data, channel);
    } catch {
      handler(message, channel);
    }
  }
});

// ===== PUBLISH =====
async function publish(channel, data) {
  try {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    const count = await redisPublisher.publish(channel, message);
    // console.log(`📤 Published to [${channel}] → ${count} subscriber(s)`);
    return true;
  } catch (error) {
    console.error(`❌ Publish failed:`, error.message);
    throw error;
  }
}

// ===== SUBSCRIBE =====
async function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    throw new Error('Callback must be a function');
  }

  channelHandlers.set(channel, callback);
  await redisSubscriber.subscribe(channel);
  log(colors.blue, 'Redis Pub/Sub', colors.reset, `📥 Subscribed to [${channel}]`);

  return {
    channel,
    unsubscribe: () => unsubscribe(channel),
  };
}

// ===== UNSUBSCRIBE =====
async function unsubscribe(channel) {
  await redisSubscriber.unsubscribe(channel);
  channelHandlers.delete(channel);
  log(colors.blue, 'Redis Pub/Sub', colors.reset, `🔄 Unsubscribed from [${channel}]`);
}

// ===== DISCONNECT =====
async function disconnect() {
  const channels = Array.from(channelHandlers.keys());
  if (channels.length > 0) {
    await redisSubscriber.unsubscribe(...channels);
  }
  await redisPublisher.quit();
  await redisSubscriber.quit();
  channelHandlers.clear();
  log(colors.green, 'Redis Pub/Sub', colors.reset, '✅ Redis Disconnected');
}

// Cleanup
process.on('SIGINT', async () => {
  await disconnect();
  process.exit(0);
});

module.exports = {
  publish,
  subscribe,
  unsubscribe,
  disconnect,
};