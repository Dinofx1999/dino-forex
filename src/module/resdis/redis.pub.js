/* eslint-disable */
// redis.pub.js
const Redis = require('ioredis');

// Khởi tạo publisher
const pub = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  reconnectOnError: true,
});

// Log khi kết nối thành công
pub.on('connect', () => console.log('✅ Redis Publisher connected'));
pub.on('error', (err) => console.error('❌ Redis Publisher error:', err.message));

/**
 * Publish message đến channel (ví dụ "broker-update")
 * @param {string} channel 
 * @param {object} data 
 */
function publishMessage(channel, data) {
  try {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    pub.publish(channel, msg);
    console.log(`📡 Redis PUB → [${channel}] (${msg.length} bytes)`);
    return true;
  } catch (err) {
    console.error('❌ Publish failed:', err.message);
    return false;
  }
}

module.exports = { pub, publishMessage };

