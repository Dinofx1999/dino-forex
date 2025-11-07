/* eslint-disable */

// redis.sub.js
const Redis = require('ioredis');

// Khởi tạo subscriber
const sub = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  reconnectOnError: true,
});

sub.on('connect', () => console.log('✅ Redis Subscriber connected'));
sub.on('error', (err) => console.error('❌ Redis Subscriber error:', err.message));

/**
 * Đăng ký lắng nghe channel
 * @param {string} channel 
 * @param {(channel:string, message:string|object)=>void} handler 
 */
function subscribeChannel(channel, handler) {
  sub.subscribe(channel, (err, count) => {
    if (err) return console.error('❌ Subscribe failed:', err.message);
    console.log(`👂 Subscribed to [${channel}] (${count} total)`);
  });

  sub.on('message', (chan, msg) => {
    try {
      const parsed = JSON.parse(msg);
      handler(chan, parsed);
    } catch {
      handler(chan, msg);
    }
  });
}

module.exports = { sub, subscribeChannel };

