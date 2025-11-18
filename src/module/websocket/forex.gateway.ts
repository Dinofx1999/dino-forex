/* eslint-disable */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Public } from '../../../src/auth/decorators/public.decorator';
import { Server, WebSocket } from 'ws';
import e from 'express';
const { log, colors, time, getTimeGMT7, formatString, truncateString } = require('../helper/text.format');
const { MESS_SERVER } = require('../constants/mess.server');
const { publish, subscribe } = require('../resdis/redis.pub_sub');
const { removeSpaces } = require('../jobs/func.helper');
const {
  saveBrokerData,
  updateBrokerStatus,
  checkBrokerExists,
  findBrokerByIndex,
  clearBroker,
  getPriceSymbol,
  clearBroker_Reset
} = require('../resdis/redis.store');

// ============================================================================
// INTERFACES & TYPES
// ============================================================================
interface BrokerConnection {
  ws: WebSocket;
  broker: string;
  connectedAt: Date;
  lastActivity: number;
  heartbeatInterval?: NodeJS.Timeout;
  idleCheckInterval?: NodeJS.Timeout;
  messageBuffer: Buffer;
}

interface MessageType {
  type: string;
  data: {
    broker?: string;
    broker_?: string;
    symbol?: string;
    index?: string;
    Payload?: {
      mess?: string;
    };
  };
}

interface RedisResetData {
  broker: string;
  symbol: string;
}

interface RedisBroadcastData {
  symbol: string;
}

interface Metrics {
  totalConnections: number;
  totalMessages: number;
  totalErrors: number;
  startTime: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const IDLE_CHECK_INTERVAL = 60000; // 1 minute
const METRICS_LOG_INTERVAL = 60000; // 1 minute

// ============================================================================
// UTILITIES
// ============================================================================
function ParseJSON(txt: string): any[] | null {
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

/**
 * Lấy broker key từ rawHeaders[13]
 */
function getBrokerKey(req: any): string | null {
  if (!req.rawHeaders || !Array.isArray(req.rawHeaders)) {
    console.error('rawHeaders không tồn tại hoặc không phải array');
    return null;
  }

  if (req.rawHeaders.length > 13 && req.rawHeaders[13]) {
    const brokerKey = req.rawHeaders[13].toString().trim();
    if (brokerKey.length > 0) {
      return brokerKey;
    }
  }

  console.error('Không thể lấy broker từ rawHeaders[13]');
  console.log('rawHeaders length:', req.rawHeaders?.length);
  console.log('rawHeaders[13]:', req.rawHeaders?.[13]);
  
  return null;
}

/**
 * Gửi message an toàn qua WebSocket
 * Kiểm tra state và wrap trong try-catch
 */
function safeSend(ws: WebSocket, message: string, brokerKey?: string): boolean {
  if (!ws) {
    console.error('safeSend: WebSocket is null');
    return false;
  }

  // Kiểm tra state trước khi send
  if (ws.readyState !== WebSocket.OPEN) {
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    console.warn(`safeSend: WebSocket not OPEN (state: ${states[ws.readyState]})${brokerKey ? ` for ${brokerKey}` : ''}`);
    return false;
  }

  try {
    ws.send(message);
    return true;
  } catch (error) {
    console.error(`safeSend error${brokerKey ? ` for ${brokerKey}` : ''}:`, error.message);
    return false;
  }
}

/**
 * Validate và parse JSON message
 */
function tryParseJSON(buffer: Buffer): { success: boolean; text?: string; error?: string } {
  try {
    const txt = buffer.toString('utf8').trim();
    
    if (!txt || txt.length === 0) {
      return { success: false, error: 'Empty message' };
    }

    // Quick check for valid JSON start
    if (!txt.startsWith('{') && !txt.startsWith('[') && txt !== 'ping') {
      return { success: false, error: 'Invalid JSON format' };
    }

    // For ping, return immediately
    if (txt === 'ping') {
      return { success: true, text: txt };
    }

    // Try parse JSON
    JSON.parse(txt);
    return { success: true, text: txt };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// DATA STORAGE
// ============================================================================
const DATA_SET = new Map<string, BrokerConnection>();

// ============================================================================
// METRICS
// ============================================================================
const metrics: Metrics = {
  totalConnections: 0,
  totalMessages: 0,
  totalErrors: 0,
  startTime: Date.now()
};

// ============================================================================
// REDIS SUBSCRIPTIONS
// ============================================================================

// REDIS SUBSCRIBE RESET
(async () => {
  try {
    await subscribe(`${process.env.CHANNEL_RESET}-${process.env.PORT}`, (data: RedisResetData) => {
      try {
        if (!data || !data.symbol) {
          console.error('Invalid data in CHANNEL_RESET:', data);
          return;
        }

        if (data.broker && data.symbol && DATA_SET.has(data.broker)) {
          const connection = DATA_SET.get(data.broker);
          if (connection?.ws) {
            const sent = safeSend(connection.ws, `RESET-${data.symbol}`, data.broker);
            if (sent) {
              console.log(`✅ Sent RESET to ${data.broker} for ${data.symbol}`);
            }
          }
        } else if (data.broker === 'ALL') {
          console.log(`📢 Broadcasting RESET-${data.symbol} to all connections (${DATA_SET.size})`);
          
          const promises: Promise<{ success: boolean; brokerKey: string }>[] = [];
          
          DATA_SET.forEach((connection, brokerKey) => {
            promises.push(
              new Promise((resolve) => {
                if (connection?.ws && connection.ws.readyState === WebSocket.OPEN) {
                  const sent = safeSend(connection.ws, `RESET-${data.symbol}`, brokerKey);
                  resolve({ success: sent, brokerKey });
                } else {
                  resolve({ success: false, brokerKey });
                }
              })
            );
          });

          Promise.allSettled(promises).then((results) => {
            const successCount = results.filter(
              r => r.status === 'fulfilled' && r.value.success
            ).length;
            const failCount = results.length - successCount;
            console.log(`📊 Broadcast result: Success=${successCount}, Failed=${failCount}`);
          });
        } else {
          console.log(`No active connection for Broker: ${data.broker}`);
        }
      } catch (error) {
        console.error('Error in CHANNEL_RESET subscription:', error);
      }
    });
  } catch (error) {
    console.error('Failed to subscribe to CHANNEL_RESET:', error);
  }
})();

// REDIS SUBSCRIBE RESET ALL SYMBOLS
(async () => {
  try {
    await subscribe(`${process.env.RESET_ALL_SYMBOLS}`, (data: RedisBroadcastData) => {
      try {
        if (!data || !data.symbol) {
          console.error('Invalid data in RESET_ALL_SYMBOLS:', data);
          return;
        }

        const symbol = String(data.symbol).trim();
        
        if (symbol === 'ALL') {
          console.log('⏭️ Skipping symbol "ALL" in RESET_ALL_SYMBOLS');
          return;
        }

        console.log(`📢 Broadcasting RESET-${symbol} to ${DATA_SET.size} connections`);
        
        const promises: Promise<{ success: boolean; brokerKey: string }>[] = [];
        
        DATA_SET.forEach((connection, brokerKey) => {
          promises.push(
            new Promise((resolve) => {
              if (connection?.ws && connection.ws.readyState === WebSocket.OPEN) {
                const sent = safeSend(connection.ws, `RESET-${symbol}`, brokerKey);
                resolve({ success: sent, brokerKey });
              } else {
                resolve({ success: false, brokerKey });
              }
            })
          );
        });

        Promise.allSettled(promises).then((results) => {
          const successCount = results.filter(
            r => r.status === 'fulfilled' && r.value.success
          ).length;
          const failCount = results.length - successCount;
          
          console.log(`📊 Broadcast result: Success=${successCount}, Failed=${failCount}`);
          
          // Cleanup failed connections
          if (failCount > 0) {
            results.forEach((result) => {
              if (result.status === 'fulfilled' && !result.value.success) {
                const connection = DATA_SET.get(result.value.brokerKey);
                if (connection?.ws.readyState === WebSocket.CLOSED) {
                  setTimeout(() => {
                    if (DATA_SET.has(result.value.brokerKey)) {
                      DATA_SET.delete(result.value.brokerKey);
                      console.log(`🧹 Cleaned up closed connection: ${result.value.brokerKey}`);
                    }
                  }, 100);
                }
              }
            });
          }
        });
      } catch (error) {
        console.error('Error in RESET_ALL_SYMBOLS subscription:', error);
      }
    });
  } catch (error) {
    console.error('Failed to subscribe to RESET_ALL_SYMBOLS:', error);
  }
})();

// ============================================================================
// WEBSOCKET GATEWAY
// ============================================================================
@Public()
@WebSocketGateway({ 
  path: process.env.WS_PATH || '/connect',
  perMessageDeflate: false,
  maxPayload: MAX_BUFFER_SIZE,
  clientTracking: true,
})
export class SimpleGateway {
  @WebSocketServer() server!: Server;

  constructor() {
    // Metrics logging
    setInterval(() => {
      const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
      console.log(
        `[📊 Metrics] ${getTimeGMT7()} PID=${process.pid} PORT=${process.env.PORT} | ` +
        `Active=${DATA_SET.size}, Total=${metrics.totalConnections}, ` +
        `Messages=${metrics.totalMessages}, Errors=${metrics.totalErrors}, Uptime=${uptime}s`
      );
    }, METRICS_LOG_INTERVAL);

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown() {
    const shutdown = async () => {
      log(colors.yellow, '⚠️ Shutting down WebSocket server...');
      
      const closePromises = Array.from(DATA_SET.entries()).map(([key, conn]) => {
        return new Promise<void>((resolve) => {
          try {
            if (conn.ws.readyState === WebSocket.OPEN) {
              safeSend(conn.ws, 'SERVER_SHUTDOWN', key);
              conn.ws.close(1001, 'Server shutdown');
            }
            
            // Clear intervals
            if (conn.heartbeatInterval) clearInterval(conn.heartbeatInterval);
            if (conn.idleCheckInterval) clearInterval(conn.idleCheckInterval);
            
            resolve();
          } catch (error) {
            console.error(`Error closing connection for ${key}:`, error);
            resolve();
          }
        });
      });
      
      await Promise.allSettled(closePromises);
      DATA_SET.clear();
      
      log(colors.green, '✅ WebSocket server shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  private cleanupConnection(brokerKey: string) {
    const connection = DATA_SET.get(brokerKey);
    if (connection) {
      // Clear intervals
      if (connection.heartbeatInterval) {
        clearInterval(connection.heartbeatInterval);
      }
      if (connection.idleCheckInterval) {
        clearInterval(connection.idleCheckInterval);
      }
      
      // Clear buffer
      connection.messageBuffer = Buffer.alloc(0);
      
      // Delete from map
      DATA_SET.delete(brokerKey);
    }
  }


  private setupIdleTimeout(client: WebSocket, brokerKey: string) {
    const connection = DATA_SET.get(brokerKey);
    if (!connection) return;

    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const idleTime = now - connection.lastActivity;
      
      if (idleTime > IDLE_TIMEOUT) {
        log(colors.yellow, `⏱️ Closing idle connection: ${brokerKey} (idle for ${Math.floor(idleTime / 1000)}s)`);
        clearInterval(idleCheckInterval);
        
        try {
          safeSend(client, 'TIMEOUT: Connection idle', brokerKey);
          client.close(1000, 'Idle timeout');
        } catch (error) {
          console.error(`Error closing idle connection ${brokerKey}:`, error);
        }
        
        this.cleanupConnection(brokerKey);
      }
    }, IDLE_CHECK_INTERVAL);

    connection.idleCheckInterval = idleCheckInterval;
  }

  private async handleGetIndex(client: WebSocket, TYPE: MessageType, brokerKey: string) {
    if (!TYPE.data?.Payload?.mess) {
      safeSend(client, MESS_SERVER(process.env.TYPE_GET_INDEX, true, 'Missing index parameter'), brokerKey);
      return;
    }

    const index = TYPE.data.Payload.mess;
    const response = await findBrokerByIndex(index);

    if (response === null) {
      const message = MESS_SERVER(process.env.TYPE_GET_INDEX, true, `No data found for index ${index}`);
      safeSend(client, message, brokerKey);
      console.log(`${brokerKey} Success ${index}`);
    } else {
      const message = TYPE.data.broker === response
        ? MESS_SERVER(process.env.TYPE_GET_INDEX, true, `No data found for index ${index}`)
        : MESS_SERVER(process.env.TYPE_GET_INDEX, false, response);
      safeSend(client, message, brokerKey);
    }
  }

  private async handleSetData(client: WebSocket, TYPE: MessageType, brokerKey: string) {
    if (!TYPE.data?.broker_) {
      safeSend(client, 'ERROR: Missing broker_ parameter', brokerKey);
      return;
    }

    try {
      await saveBrokerData(TYPE.data.broker_, TYPE.data);
    } catch (error) {
      console.error('Error saving broker data:', error);
      safeSend(client, 'ERROR: Failed to save data', brokerKey);
      metrics.totalErrors++;
    }
  }

  private async handleResetData(client: WebSocket, TYPE: MessageType, brokerKey: string) {
    if (!TYPE.data?.symbol || !TYPE.data?.broker) {
      safeSend(client, 'ERROR: Missing symbol or broker parameter', brokerKey);
      return;
    }

    try {
      const Info = await getPriceSymbol(TYPE.data.symbol);
      
      await updateBrokerStatus(
        `${formatString(TYPE.data.broker)}`,
        `[${TYPE.data.Payload?.mess || 'N/A'}] - ${truncateString(TYPE.data.symbol)}`
      );

      let responseData: any;
      let logColor: any;

      if (Info) {
        responseData = {
          ...Info,
          Index: TYPE.data.index,
          Type: TYPE.type
        };
        logColor = colors.green;
      } else {
        responseData = {
          Symbol: TYPE.data.symbol,
          Broker: TYPE.data.broker,
          Bid: 'null',
          Digit: 'null',
          Time: 'null',
          Index: TYPE.data.index,
          Type: TYPE.type
        };
        logColor = colors.yellow;
      }

      log(
        logColor,
        `${process.env.TYPE_RESET_DATA}`,
        colors.reset,
        `Broker ${TYPE.data.broker} -> Symbol: ${TYPE.data.symbol} - [${TYPE.data.Payload?.mess || 'N/A'}] <=> Broker Check: ${responseData.Broker}`
      );

      // Validate Index
      if (responseData.Index && responseData.Index !== 'N/A' && responseData.Index !== null && responseData.Index !== 0) {
        safeSend(client, JSON.stringify(responseData), brokerKey);
      } else {
        safeSend(client, 'ERROR: Invalid Index value', brokerKey);
      }
    } catch (error) {
      console.error('Error in RESET_DATA:', error);
      safeSend(client, 'ERROR: Failed to process reset', brokerKey);
      metrics.totalErrors++;
    }
  }

  handleConnection(client: WebSocket, req: any) {
    // ========================================================================
    // 1. LẤY BROKER KEY
    // ========================================================================
    const brokerKey = getBrokerKey(req);
    
    if (!brokerKey) {
      log(colors.red, `${process.env.ICON_WARNING_LOG} Connection rejected: Missing broker identifier`);
      safeSend(client, 'ERROR: Missing broker identifier from rawHeaders[13]');
      setTimeout(() => client.close(1008, 'Missing broker identifier'), 100);
      return;
    }

    // Validate WebSocket state
    try {
      if (client.readyState !== WebSocket.OPEN) {
        log(colors.yellow, `Connection not open for ${brokerKey}, current state: ${client.readyState}`);
        return;
      }
    } catch (error) {
      console.error(`Invalid connection state for ${brokerKey}:`, error);
      return;
    }

    // ========================================================================
    // 2. ĐÓNG CONNECTION CŨ
    // ========================================================================
    const existingConnection = DATA_SET.get(brokerKey);
    if (existingConnection?.ws) {
      try {
        safeSend(existingConnection.ws, 'DISCONNECTED: New connection established', brokerKey);
        existingConnection.ws.close(1000, 'Replaced by new connection');
        this.cleanupConnection(brokerKey);
      } catch (error) {
        console.error('Error closing existing connection:', error);
      }
    }

    // ========================================================================
    // 3. LƯU CONNECTION MỚI
    // ========================================================================
    DATA_SET.set(brokerKey, {
      ws: client,
      broker: brokerKey,
      connectedAt: new Date(),
      lastActivity: Date.now(),
      messageBuffer: Buffer.alloc(0)
    });

    metrics.totalConnections++;

    safeSend(client, `Connected to Server-${getTimeGMT7()}`, brokerKey);

    log(
      colors.green,
      `${process.env.ICON_CONNECT_LOG} NEW CONNECTION`,
      colors.cyan,
      ` ${brokerKey} | PID=${process.pid} | PORT=${process.env.PORT} | Active: ${DATA_SET.size}`
    );

    // Setup heartbeat và idle timeout
    this.setupIdleTimeout(client, brokerKey);

    // ========================================================================
    // 4. XỬ LÝ MESSAGE TỪ CLIENT
    // ========================================================================
    client.on('message', async (raw: Buffer) => {
      try {
        const connection = DATA_SET.get(brokerKey);
        if (!connection) return;

        // Update last activity
        connection.lastActivity = Date.now();
        metrics.totalMessages++;

        // Validate buffer
        if (!Buffer.isBuffer(raw)) {
          console.error(`Invalid data type from ${brokerKey}`);
          metrics.totalErrors++;
          return;
        }

        if (raw.length === 0) {
          console.warn(`Empty message from ${brokerKey}`);
          return;
        }

        // Check buffer overflow
        if (connection.messageBuffer.length + raw.length > MAX_BUFFER_SIZE) {
          console.error(`Message buffer overflow from ${brokerKey}: ${connection.messageBuffer.length + raw.length} bytes`);
          connection.messageBuffer = Buffer.alloc(0);
          safeSend(client, 'ERROR: Message too large, buffer cleared', brokerKey);
          metrics.totalErrors++;
          return;
        }

        // Append to buffer (handle fragmented messages)
        connection.messageBuffer = Buffer.concat([connection.messageBuffer, raw]);

        // Try parse
        const parseResult = tryParseJSON(connection.messageBuffer);

        if (!parseResult.success) {
          // Check if buffer is getting too large
          if (connection.messageBuffer.length >= MAX_BUFFER_SIZE) {
            console.error(`Parse error from ${brokerKey}: ${parseResult.error}, buffer cleared`);
            connection.messageBuffer = Buffer.alloc(0);
            safeSend(client, 'ERROR: Invalid message format', brokerKey);
            metrics.totalErrors++;
          }
          // Otherwise wait for more data
          return;
        }

        const txt = parseResult.text!;
        
        // Clear buffer after successful parse
        connection.messageBuffer = Buffer.alloc(0);

        // Quick response for ping
        if (txt === 'ping') {
          safeSend(client, 'pong', brokerKey);
          return;
        }

        // Parse JSON
        const parsed = ParseJSON(txt);
        if (!parsed || parsed.length === 0 || !parsed[0]) {
          safeSend(client, 'ERROR: Invalid message format', brokerKey);
          metrics.totalErrors++;
          return;
        }

        const TYPE: MessageType = parsed[0];

        if (!TYPE.type) {
          safeSend(client, 'ERROR: Message type is required', brokerKey);
          metrics.totalErrors++;
          return;
        }

        // ====================================================================
        // SWITCH CASE XỬ LÝ CÁC LOẠI MESSAGE
        // ====================================================================
        switch (TYPE.type) {
          case process.env.TYPE_GET_INDEX: {
            await this.handleGetIndex(client, TYPE, brokerKey);
            break;
          }

          case process.env.TYPE_SET_DATA: {
            await this.handleSetData(client, TYPE, brokerKey);
            break;
          }

          case process.env.TYPE_RESET_DATA: {
            await this.handleResetData(client, TYPE, brokerKey);
            break;
          }

          default: {
            const errorMessage = `ERROR: Unknown message type: ${TYPE.type}`;
            safeSend(client, errorMessage, brokerKey);
            log(colors.yellow, `${process.env.ICON_WARNING_LOG} Unknown message type:`, TYPE.type, 'from', brokerKey);
            metrics.totalErrors++;
            break;
          }
        }
      } catch (error) {
        console.error(`${process.env.ICON_WARNING_LOG} Message handling error for ${brokerKey}:`, error);
        
        // Clear buffer on error
        const connection = DATA_SET.get(brokerKey);
        if (connection) {
          connection.messageBuffer = Buffer.alloc(0);
        }
        
        safeSend(client, `ERROR: ${error instanceof Error ? error.message : 'Internal server error'}`, brokerKey);
        metrics.totalErrors++;
      }
    });

    // ========================================================================
    // 5. XỬ LÝ ĐÓNG KẾT NỐI
    // ========================================================================
    client.on('close', async (code, reason) => {
      const remainingCount = DATA_SET.size - 1; // Calculate before deletion
      
      log(
        colors.red,
        `${process.env.ICON_DISCONNECT_LOG} DISCONNECTION`,
        colors.cyan,
        ` ${brokerKey} | Code: ${code} | Reason: ${reason || 'N/A'} | PID=${process.pid} | Remaining: ${remainingCount}`
      );

      try {
        await clearBroker(removeSpaces(brokerKey, '-'));
      } catch (error) {
        console.error(`Error clearing broker ${brokerKey}:`, error);
      }

      this.cleanupConnection(brokerKey);
    });

    // ========================================================================
    // 6. XỬ LÝ LỖI WEBSOCKET
    // ========================================================================
    client.on('error', (err: any) => {
      console.error(
        `${process.env.ICON_WARNING_LOG} WebSocket error | Broker: ${brokerKey} | PID=${process.pid}`
      );
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        name: err.name
      });

      // Log specific error types
      if (err.code === 'WS_ERR_INVALID_OPCODE') {
        console.error(`⚠️ Invalid WebSocket frame from ${brokerKey} - possible fragmented/corrupt message`);
      }

      metrics.totalErrors++;

      // Clear buffer
      const connection = DATA_SET.get(brokerKey);
      if (connection) {
        connection.messageBuffer = Buffer.alloc(0);
      }

      // Close connection
      try {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(1002, 'Protocol error');
        }
      } catch (e) {
        console.error('Error closing client on error:', e);
      }

      this.cleanupConnection(brokerKey);
    });
  }
}