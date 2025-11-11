/* eslint-disable */
const Redis = require('ioredis');
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
});

const { log, colors } = require('../helper/text.format');

// ============= BROKER DATA MANAGEMENT =============
//Update broker data =>  await updateBrokerData('broker_key', { status: 'False', broker: 'XYZ' });
async function updateBrokerStatus(broker, newStatus) {
  try {
    // console.log(`Updating broker: ${broker}, newStatus: ${newStatus}`);
    const key = `Broker:${broker}`; // ← Key phải match với getPortBroker
    
    const raw = await redis.get(key);
    if (raw) {
      const data = JSON.parse(raw);
    
    // Update status
    data.status = newStatus; // "True" hoặc "False"
    data.timeUpdated = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    // Lưu lại
    await redis.set(key, JSON.stringify(data));
    
    // console.log(`✓ Đã update ${broker} status thành: ${newStatus}`);
    return data;
    }
    
    
  } catch (error) {
    console.error('Lỗi update status:', error.message);
    throw error;
  }
}

/**
 * Lưu data của broker vào Redis
 * Key format: Broker:{broker_name}
 */
async function saveBrokerData(broker, data) {
  const key = `Broker:${broker}`;
  await redis.set(key, JSON.stringify(data));
  // console.log(`✅ Saved data for broker: ${broker}`);
}

async function saveAnalysis(Analysis, data) {
  const key = `Analysis:${Analysis}`;
  await redis.set(key, JSON.stringify(data));
}
async function getAnalysis() {
  const keys = await redis.keys('Analysis:*');
  const result = {};
  for (const key of keys) {
    const raw = await redis.get(key);
    try {
      result[key.replace('Analysis:', '')] = JSON.parse(raw);
    } catch {
      result[key.replace('Analysis:', '')] = raw;
    }
  }
  return result;
}
/**
 * Lấy data của một broker cụ thể
 */
async function getBrokerData(broker) {
  const key = `Broker:${broker}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Lấy port của broker
 */
async function getPortBroker(broker) {
  const key = `Broker:${broker}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  const data = JSON.parse(raw);
  return {
    port: data.port,
    broker: data.broker
  };
}

/**
 * Kiểm tra broker có tồn tại không
 */
async function checkBrokerExists(broker) {
  const key = `Broker:${broker}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Lấy tất cả brokers (object format)
 */
async function getAllBrokers() {
  const keys = await redis.keys('Broker:*');
  const result = {};
  for (const key of keys) {
    const raw = await redis.get(key);
    try {
      result[key.replace('Broker:', '')] = JSON.parse(raw);
    } catch {
      result[key.replace('Broker:', '')] = raw;
    }
  }
  return result;
}

/**
 * Lấy tất cả brokers và sort theo index (array format)
 */
async function getAllBrokersSorted() {
  const keys = await redis.keys('Broker:*');
  if (!keys.length) return [];

  const pipeline = redis.pipeline();
  keys.forEach(k => pipeline.get(k));
  const results = await pipeline.exec();

  return results
    .map(([, raw]) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.index) - Number(b.index));
}


async function getBrokerResetting() {
  const keys = await redis.keys('Broker:*');
  if (!keys.length) return [];
  
  const pipeline = redis.pipeline();
  keys.forEach(k => pipeline.get(k));
  const results = await pipeline.exec();
  
  return results
    .map(([, raw]) => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    // ✅ Chỉ lấy status !== "True"
    .filter(broker => broker.status !== "True")
    .sort((a, b) => Number(a.index) - Number(b.index));
}
/**
 * Tìm broker theo index
 */
async function findBrokerByIndex(index) {
  const keys = await redis.keys('Broker:*');
  for (const key of keys) {
    const raw = await redis.get(key);
    try {
      const data = JSON.parse(raw);
      if (String(data.index) === String(index)) {
        return key.replace('Broker:', '');
      }
    } catch {}
  }
  return null;
}

/**
 * Xóa tất cả broker data
 */
async function clearBrokerData() {
  try {
    const keys = await redis.keys('Broker:*');
    if (keys.length === 0) {
      log(colors.yellow, `${process.env.ICON_WARNING_LOG} Redis`, colors.cyan, `Không có key Broker nào trong Redis [clearBrokerData]`);
      return;
    }
    await redis.del(keys);
    log(colors.green, `${process.env.ICON_ACCESS_LOG} Redis`, colors.cyan, `🧹 Đã xóa ${keys.length} key Broker:* khỏi Redis`);
  } catch (err) {
    log(colors.red, "Redis", colors.cyan, `❌ Lỗi khi xóa Redis: ${err.message}`);
  }
}

/**
 * Xóa một broker cụ thể
 */
async function clearBroker(broker) {
  try {
    const key = `Broker:${broker}`;
    const result = await redis.del(key);
    
    if (result === 0) {
      log(colors.yellow, `${process.env.ICON_WARNING_LOG} Redis`, colors.cyan, `Không tìm thấy Broker:${broker}`);
      return;
    }
    
    log(colors.green, `${process.env.ICON_ACCESS_LOG} Redis`, colors.cyan, `🧹 Đã xóa Broker:${broker} khỏi Redis`);
  } catch (err) {
    log(colors.red, "Redis", colors.cyan, `❌ Lỗi khi xóa Redis: ${err.message}`);
  }
}

async function clearBroker_Reset(broker) {
  try {
    const key = `Broker:${broker}`;
    const result = await redis.del(key);
    
    if (result === 0) {
      // log(colors.yellow, `${process.env.ICON_WARNING_LOG} Redis`, colors.cyan, `Không tìm thấy Broker:${broker}`);
      return;
    }
    
    log(colors.green, `${process.env.ICON_ACCESS_LOG} Redis`, colors.cyan, `🧹 Đã xóa Broker:${broker} khỏi Redis`);
  } catch (err) {
    log(colors.red, "Redis", colors.cyan, `❌ Lỗi khi xóa Redis: ${err.message}`);
  }
}

// ============= PRICE QUERIES =============

/**
 * Lấy price của một symbol từ broker có index nhỏ nhất
 * @param {string} symbol - Tên symbol
 * @returns {Object|null} - Price info hoặc null
 */

function normSym(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

async function scanAllBrokerKeys(redis, pattern = 'Broker:*', count = 200) {
  let cursor = '0';
  const keys = [];
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = next;
    if (batch?.length) keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}
/* Hàm chính: lấy giá từ broker có index thấp nhất mà có symbol */
async function getPriceSymbol(symbol) {
  const target = normSym(symbol);
  const keys = await scanAllBrokerKeys(redis, 'Broker:*', 200);
  if (!keys.length) return null;

  // Pipeline GET tất cả brokers
  const pipe = redis.pipeline();
  for (const k of keys) pipe.get(k);
  const results = await pipe.exec();

  // Parse + chỉ giữ broker có chứa symbol, sau đó chọn index nhỏ nhất
  let best = null; // {idx, brokerObj, match}
  for (const [, raw] of results) {
    if (!raw) continue;
    let b;
    try { b = JSON.parse(raw); } catch { continue; }

    // b có dạng object với OHLC_Symbols (theo data bạn cung cấp)
    const list = Array.isArray(b?.OHLC_Symbols) ? b.OHLC_Symbols : null;
    if (!list) continue;

    // Tìm symbol khớp (so cả symbol_raw)
    const match = list.find(s =>
      (normSym(s?.symbol) === target || normSym(s?.symbol_raw) === target)
      && String(s?.trade).trim().toUpperCase() === "TRUE"
    );
    if (!match) continue;

    // Lấy index (ưu tiên số; nếu thiếu -> Infinity)
    const idx = Number.isFinite(Number(b?.index)) ? Number(b.index) : Infinity;

    if (!best || idx < best.idx) {
      best = { idx, brokerObj: b, match };
    }
  }

  if (!best) return null;

  const { brokerObj: b, match } = best;
  return {
    Symbol: match.symbol,
    Broker: b.broker,
    Bid: match.bid,
    Digit: match.digit,
    Time: match.timecurrent,
  };
}

// async function getPriceSymbol(symbol) {
//   const keys = await redis.keys('Broker:*');
//   if (!keys.length) return null;

//   const pipeline = redis.pipeline();
//   keys.forEach(k => pipeline.get(k));
//   const results = await pipeline.exec();

//   const brokers = results
//     .map(([, raw]) => {
//       try {
//         return JSON.parse(raw);
//       } catch {
//         return null;
//       }
//     })
//     .filter(Boolean)
//     .sort((a, b) => Number(a.index) - Number(b.index));

//   for (const b of brokers) {
//     if (!b.OHLC_Symbols || !Array.isArray(b.OHLC_Symbols)) continue;
//     console.log(b);
//     const match = b.OHLC_Symbols.find(s => s.symbol === symbol);
//     if (match) {
//       return {
//         Symbol: match.symbol,
//         Broker: b.broker,
//         Bid: match.bid,
//         Digit: match.digit,
//         Time: match.timecurrent,
//       };
//     }
//   }

//   return null;
// }

/**
 * Lấy giá của một symbol từ TẤT CẢ brokers
 * @param {string} symbol - Tên symbol (vd: "EURUSD")
 * @returns {Promise<Array>} - Array chứa price info từ tất cả brokers
 */
async function getPrice(symbol) {
  try {
    const results = [];
    
    // ⚠️ FIX: Đổi từ 'broker:*' thành 'Broker:*' cho nhất quán
    const keys = await redis.keys('Broker:*');
    
    if (keys.length === 0) {
      log(colors.yellow, `⚠️ Redis`, colors.cyan, `Không có key Broker nào trong Redis [Get Price]`);
      return results;
    }

    // Tối ưu hóa bằng pipeline
    const pipeline = redis.pipeline();
    keys.forEach(k => pipeline.get(k));
    const rawResults = await pipeline.exec();

    // Parse và filter
    for (let i = 0; i < rawResults.length; i++) {
      const [err, data] = rawResults[i];
      if (err || !data) continue;

      try {
        const brokerData = JSON.parse(data);
        
        if (brokerData.OHLC_Symbols && Array.isArray(brokerData.OHLC_Symbols)) {
          const symbolData = brokerData.OHLC_Symbols.find(
            (s) => s.symbol && s.symbol.toUpperCase() === symbol.toUpperCase()
          );

          if (symbolData) {
            results.push({
              broker: brokerData.broker || 'Unknown',
              broker_: brokerData.broker_ || keys[i].replace('Broker:', ''),
              port: brokerData.port || 'N/A',
              index: brokerData.index || 'N/A',
              version: brokerData.version || 'N/A',
              timeUpdated: brokerData.timeUpdated || brokerData.timecurent || 'N/A',
              ...symbolData,
            });
          }
        }
      } catch (parseError) {
        console.error(`Error parsing data for key ${keys[i]}:`, parseError.message);
      }
    }

    // 👇 SẮP XẾP THEO INDEX TỪ THẤP ĐẾN CAO
    results.sort((a, b) => {
      const indexA = Number(a.index);
      const indexB = Number(b.index);
      
      // Xử lý trường hợp index không hợp lệ (NaN)
      if (isNaN(indexA)) return 1;  // Đưa về cuối
      if (isNaN(indexB)) return -1; // Đưa về cuối
      
      return indexA - indexB; // Sắp xếp tăng dần
    });
    return results;

  } catch (error) {
    console.error('❌ Error in getPrice:', error.message);
    throw error;
  }
}

async function getPriceSymbollAllBroker(symbol) {
  try {
    const results = [];
    
    // ⚠️ FIX: Đổi từ 'broker:*' thành 'Broker:*' cho nhất quán
    const keys = await redis.keys('Broker:*');
    
    if (keys.length === 0) {
      // log(colors.yellow, `⚠️ Redis`, colors.cyan, `Không có key Broker nào trong Redis [getPriceSymbollAllBroker]`);
      return results;
    }

    // Tối ưu hóa bằng pipeline
    const pipeline = redis.pipeline();
    keys.forEach(k => pipeline.get(k));
    const rawResults = await pipeline.exec();

    // Parse và filter
    for (let i = 0; i < rawResults.length; i++) {
      const [err, data] = rawResults[i];
      if (err || !data) continue;

      try {
        const brokerData = JSON.parse(data);
        
        if (brokerData.OHLC_Symbols && Array.isArray(brokerData.OHLC_Symbols)&&brokerData.status === "True") {
          const symbolData = brokerData.OHLC_Symbols.find(
              (s) => 
                s.symbol && 
                String(s.symbol).trim().toUpperCase() === String(symbol).trim().toUpperCase() && 
                String(s.trade).trim().toUpperCase() === "TRUE"&&
                s.timetrade?.some((t) => t.status === "true")  // ✅ s.timetrade, không phải brokerData.OHLC_Symbols.timetrade
            );
 
          if (symbolData) {
            results.push({
              symbol: symbolData.symbol,
              symbol_raw: symbolData.symbol_raw,
              broker: brokerData.broker || 'Unknown',
              index: brokerData.index || 'N/A',
              typeaccount: brokerData.typeaccount || 'N/A',
              timeCrr: brokerData.timecurent || 'N/A',
              bid: symbolData.bid,
              ask: symbolData.ask,
              bid_mdf: symbolData.bid_mdf,
              ask_mdf: symbolData.ask_mdf,
              spread: symbolData.spread,
              digit: symbolData.digit,
              longcandle: symbolData.longcandle,
              timetrade: symbolData.timetrade,
            });
          }
        }
      } catch (parseError) {
        console.error(`Error parsing data for key ${keys[i]}:`, parseError.message);
      }
    }

    // 👇 SẮP XẾP THEO INDEX TỪ THẤP ĐẾN CAO
    results.sort((a, b) => {
      const indexA = Number(a.index);
      const indexB = Number(b.index);
      
      // Xử lý trường hợp index không hợp lệ (NaN)
      if (isNaN(indexA)) return 1;  // Đưa về cuối
      if (isNaN(indexB)) return -1; // Đưa về cuối
      
      return indexA - indexB; // Sắp xếp tăng dần
    });
    return results;

  } catch (error) {
    console.error('❌ Error in getPrice:', error.message);
    throw error;
  }
}

/**
 * Lấy danh sách tất cả brokers với thông tin cơ bản
 * @returns {Promise<Array>} - Array chứa info của tất cả brokers
 */
async function getBroker() {
  try {
    const results = [];
    const keys = await redis.keys('Broker:*');
    
    if (keys.length === 0) {
      // log(colors.yellow, `⚠️ Redis`, colors.cyan, `Không có key Broker nào trong Redis `);
      return results;
    }

    // Tối ưu hóa bằng pipeline
    const pipeline = redis.pipeline();
    keys.forEach(k => pipeline.get(k));
    const rawResults = await pipeline.exec();

    for (let i = 0; i < rawResults.length; i++) {
      const [err, data] = rawResults[i];
      if (err || !data) continue;

      try {
        const brokerData = JSON.parse(data);
        
        results.push({
          broker: brokerData.broker || 'Unknown',
          broker_: brokerData.broker_ || keys[i].replace('Broker:', ''),
          port: brokerData.port || 'N/A',
          index: brokerData.index || 'N/A',
          version: brokerData.version || 'N/A',
          totalsymbol: brokerData.totalsymbol || '0',
          timecurent: brokerData.timecurent || 'N/A',
          timeUpdated: brokerData.timeUpdated || 'N/A',
          typeaccount: brokerData.typeaccount || 'N/A',
          status: brokerData.status || 'N/A',
          symbolCount: brokerData.OHLC_Symbols ? brokerData.OHLC_Symbols.length : 0,
        });

      } catch (parseError) {
        console.error(`Error parsing data for key ${keys[i]}:`, parseError.message);
      }
    }

    // Sort theo index
    results.sort((a, b) => Number(a.index) - Number(b.index));

    // console.log(`📋 Found ${results.length} broker(s)`);
    return results;

  } catch (error) {
    console.error('❌ Error in getBroker:', error.message);
    throw error;
  }
}

/**
 * Lấy tất cả symbols từ một broker cụ thể
 * @param {string} brokerName - Tên broker hoặc broker_
 * @returns {Promise<Array>} - Array chứa tất cả symbols
 */
async function getBrokerSymbols(brokerName) {
  try {
    const keys = await redis.keys('Broker:*');
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (!data) continue;

      const brokerData = JSON.parse(data);
      
      if (
        brokerData.broker === brokerName || 
        brokerData.broker_ === brokerName ||
        key === `Broker:${brokerName}`
      ) {
        return brokerData.OHLC_Symbols || [];
      }
    }

    console.log(`⚠️ Broker not found: ${brokerName}`);
    return [];

  } catch (error) {
    console.error('❌ Error in getBrokerSymbols:', error.message);
    throw error;
  }
}

/**
 * Lấy giá của symbol từ broker cụ thể
 * @param {string} brokerName - Tên broker
 * @param {string} symbol - Tên symbol
 * @returns {Promise<Object|null>} - Price data hoặc null
 */
async function getBrokerPrice(brokerName, symbol) {
  try {
    const keys = await redis.keys('Broker:*');
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (!data) continue;

      const brokerData = JSON.parse(data);
      
      if (
        brokerData.broker === brokerName || 
        brokerData.broker_ === brokerName ||
        key === `Broker:${brokerName}`
      ) {
        if (brokerData.OHLC_Symbols && Array.isArray(brokerData.OHLC_Symbols)) {
          const symbolData = brokerData.OHLC_Symbols.find(
            (s) => s.symbol && s.symbol.toUpperCase() === symbol.toUpperCase()
          );

          if (symbolData) {
            return {
              broker: brokerData.broker,
              broker_: brokerData.broker_,
              port: brokerData.port,
              timeUpdated: brokerData.timeUpdated,
              ...symbolData,
            };
          }
        }
        break;
      }
    }

    console.log(`⚠️ Symbol ${symbol} not found for broker ${brokerName}`);
    return null;

  } catch (error) {
    console.error('❌ Error in getBrokerPrice:', error.message);
    throw error;
  }
}

/**
 * Lấy tất cả symbols unique từ tất cả brokers
 * @returns {Promise<Array>} - Array symbols
 */
async function getAllSymbols() {
  try {
    const symbolsSet = new Set();
    const keys = await redis.keys('Broker:*');
    
    const pipeline = redis.pipeline();
    keys.forEach(k => pipeline.get(k));
    const results = await pipeline.exec();

    for (const [err, data] of results) {
      if (err || !data) continue;

      try {
        const brokerData = JSON.parse(data);
        
        if (brokerData.OHLC_Symbols && Array.isArray(brokerData.OHLC_Symbols)) {
          brokerData.OHLC_Symbols.forEach((symbolData) => {
            if (symbolData.symbol) {
              symbolsSet.add(symbolData.symbol);
            }
          });
        }
      } catch {}
    }

    const symbols = Array.from(symbolsSet).sort();
    console.log(`📊 Found ${symbols.length} unique symbol(s)`);
    return symbols;

  } catch (error) {
    console.error('❌ Error in getAllSymbols:', error.message);
    throw error;
  }
}

/**
 * So sánh giá của symbol giữa các brokers
 * @param {string} symbol - Tên symbol
 * @returns {Promise<Object>} - Comparison result
 */
async function comparePrice(symbol) {
  try {
    const prices = await getPrice(symbol);
    
    if (prices.length === 0) {
      return {
        symbol: symbol,
        count: 0,
        prices: [],
      };
    }

    const bids = prices.map(p => parseFloat(p.bid)).filter(b => !isNaN(b));
    const asks = prices.map(p => parseFloat(p.ask)).filter(a => !isNaN(a));

    const bestBid = Math.max(...bids);
    const bestAsk = Math.min(...asks);
    const avgBid = bids.reduce((a, b) => a + b, 0) / bids.length;
    const avgAsk = asks.reduce((a, b) => a + b, 0) / asks.length;

    return {
      symbol: symbol,
      count: prices.length,
      bestBid: bestBid,
      bestAsk: bestAsk,
      avgBid: avgBid,
      avgAsk: avgAsk,
      spread: bestAsk - bestBid,
      prices: prices.map(p => ({
        broker: p.broker,
        broker_: p.broker_,
        index: p.index,
        bid: parseFloat(p.bid),
        ask: parseFloat(p.ask),
        spread: parseInt(p.spread),
        digit: p.digit,
        isBestBid: parseFloat(p.bid) === bestBid,
        isBestAsk: parseFloat(p.ask) === bestAsk,
        timeUpdated: p.timeUpdated,
      })).sort((a, b) => Number(a.index) - Number(b.index)),
    };

  } catch (error) {
    console.error('❌ Error in comparePrice:', error.message);
    throw error;
  }
}

async function getAllSymbolsFromRedis() {
  // const keys = await scanKeys('Broker:*');
  const keys = await scanKeys('Broker:*', 200);
  const uniqueSymbols = new Set();

  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
     
      if (data && typeof data === 'object' && Array.isArray(data.OHLC_Symbols)) {
        data.OHLC_Symbols.forEach(symbolInfo => {
          if (symbolInfo.symbol) uniqueSymbols.add(symbolInfo.symbol);
        });
      }
    } catch (err) {
      console.error(`❌ JSON parse error for key: ${key}`, err);
    }
  }

  return Array.from(uniqueSymbols);
}

async function scanKeys(pattern) {
  let cursor = '0';
  let keys = [];
  
  do {
    const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = reply[0];
    keys = keys.concat(reply[1]);
  } while (cursor !== '0');
  
  return keys;
}




// ============= EXPORTS =============

module.exports = {
  // Broker Management
  saveBrokerData,
  saveAnalysis,
  getBrokerData,
  getPortBroker,
  checkBrokerExists,
  getAllBrokers,
  getAllBrokersSorted,
  findBrokerByIndex,
  clearBrokerData,
  clearBroker,
  clearBroker_Reset,
  updateBrokerStatus,
  
  // Price Queries
  getPriceSymbol,      // Lấy price từ broker đầu tiên (index nhỏ nhất)
  getPrice,            // Lấy price từ TẤT CẢ brokers
  getBroker,           // Lấy danh sách brokers
  getBrokerSymbols,    // Lấy symbols của 1 broker
  getBrokerPrice,      // Lấy price từ broker cụ thể
  getAllSymbols,       // Lấy tất cả symbols unique
  comparePrice,        // So sánh price giữa brokers
  scanKeys,            // Quét keys theo pattern
  getAllSymbolsFromRedis,
  getPriceSymbollAllBroker,
  getAnalysis,
  getBrokerResetting,
  // Redis client
  redis,
};