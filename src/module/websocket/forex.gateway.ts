/* eslint-disable */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Public } from '../../../src/auth/decorators/public.decorator';
import { Server, WebSocket } from 'ws';

const {
  log,
  colors,
  time,
  getTimeGMT7,
  formatString,
  truncateString
} = require('../helper/text.format');
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
}

interface MessageType {
  type: string;
  data: {
    broker?: string;
    broker_?: string;
    symbol?: string;
    index?: string | number;
    Payload?: {
      mess?: string;
    };
  };
}

// ============================================================================
// UTILITIES
// ============================================================================
function ParseJSON<T = any>(txt: string): T[] | null {
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as T[]) : [parsed as T];
  } catch {
    return null;
  }
}

/**
 * Lấy broker key từ rawHeaders[13]
 * Lưu ý: phụ thuộc client gửi header cố định
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

  if (ws.readyState !== WebSocket.OPEN) {
    const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
    console.warn(
      `safeSend: WebSocket not OPEN (state: ${states[ws.readyState] || ws.readyState})${
        brokerKey ? ` for ${brokerKey}` : ''
      }`
    );
    return false;
  }

  try {
    ws.send(message);
    return true;
  } catch (error: any) {
    console.error(`safeSend error${brokerKey ? ` for ${brokerKey}` : ''}:`, error?.message || error);
    return false;
  }
}

// ============================================================================
// DATA STORAGE
// ============================================================================
const DATA_SET = new Map<string, BrokerConnection>();

// ============================================================================
// REDIS SUBSCRIPTIONS
// ============================================================================

// REDIS SUBSCRIBE RESET (theo broker + port)
(async () => {
  try {
    await subscribe(`${process.env.CHANNEL_RESET}-${process.env.PORT}`, (data: any) => {
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
          let successCount = 0;
          let failCount = 0;
          DATA_SET.forEach((connection, brokerKey) => {
            if (connection?.ws) {
              const sent = safeSend(connection.ws, `RESET-${data.symbol}`, brokerKey);
              if (sent) {
                successCount++;
              } else {
                failCount++;
              }
            }
          });

          console.log(`📊 Broadcast result: Success=${successCount}, Failed=${failCount}`);
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
    await subscribe(`${process.env.RESET_ALL_SYMBOLS}`, (data: any) => {
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
        let successCount = 0;
        let failCount = 0;

        DATA_SET.forEach((connection, brokerKey) => {
          if (connection?.ws) {
            const sent = safeSend(connection.ws, `RESET-${symbol}`, brokerKey);
            if (sent) {
              successCount++;
            } else {
              failCount++;
              // Cleanup nếu đã CLOSED
              setTimeout(() => {
                if (connection.ws.readyState === WebSocket.CLOSED) {
                  DATA_SET.delete(brokerKey);
                  console.log(`🧹 Cleaned up closed connection: ${brokerKey}`);
                }
              }, 100);
            }
          }
        });

        console.log(`📊 Broadcast result: Success=${successCount}, Failed=${failCount}`);
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
  maxPayload: 10 * 1024 * 1024 // 10MB
})
export class SimpleGateway {
  @WebSocketServer() server!: Server;

  handleConnection(client: WebSocket, req: any) {
    // ========================================================================
    // 1. LẤY BROKER KEY
    // ========================================================================
    const brokerKey = getBrokerKey(req);

    if (!brokerKey) {
      log(
        colors.red,
        `${process.env.ICON_WARNING_LOG} Connection rejected: Missing broker identifier`
      );
      safeSend(client, 'ERROR: Missing broker identifier from rawHeaders[13]');
      setTimeout(() => client.close(1008, 'Missing broker identifier'), 100);
      return;
    }

    // ========================================================================
    // 2. ĐÓNG CONNECTION CŨ (NẾU CÓ)
    // ========================================================================
    const existingConnection = DATA_SET.get(brokerKey);
    if (existingConnection?.ws) {
      try {
        safeSend(
          existingConnection.ws,
          'DISCONNECTED: New connection established',
          brokerKey
        );
        existingConnection.ws.close(1000, 'Replaced by new connection');
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
      connectedAt: new Date()
    });

    safeSend(client, `Connected to Server-${getTimeGMT7()}`, brokerKey);

    log(
      colors.green,
      `${process.env.ICON_CONNECT_LOG} NEW CONNECTION`,
      colors.cyan,
      ` ${brokerKey} | PID=${process.pid} | PORT=${process.env.PORT} | Active: ${DATA_SET.size}`
    );

    // ========================================================================
    // 4. XỬ LÝ MESSAGE TỪ CLIENT
    // ========================================================================
    client.on('message', async (raw: Buffer) => {
      try {
        if (!raw || raw.length === 0) {
          console.warn(`Empty message from ${brokerKey}`);
          return;
        }

        if (raw.length > 10 * 1024 * 1024) {
          console.error(
            `Message too large from ${brokerKey}: ${raw.length} bytes`
          );
          safeSend(client, 'ERROR: Message too large', brokerKey);
          return;
        }

        let txt: string;
        try {
          txt = raw.toString('utf8').trim();
        } catch (decodeError) {
          console.error(`Decode error from ${brokerKey}:`, decodeError);
          safeSend(client, 'ERROR: Cannot decode message', brokerKey);
          return;
        }

        if (!txt || txt.length === 0) {
          return;
        }

        if (txt === 'ping') {
          safeSend(client, 'pong', brokerKey);
          return;
        }

        const parsed = ParseJSON<MessageType>(txt);
        if (!parsed || parsed.length === 0 || !parsed[0]) {
          safeSend(client, 'ERROR: Invalid message format', brokerKey);
          return;
        }

        const TYPE = parsed[0];

        if (!TYPE.type) {
          safeSend(client, 'ERROR: Message type is required', brokerKey);
          return;
        }

        // ====================================================================
        // SWITCH CASE XỬ LÝ CÁC LOẠI MESSAGE
        // ====================================================================
        switch (TYPE.type) {
          // ==================================================================
          // CASE 1: GET INDEX
          // ==================================================================
          case process.env.TYPE_GET_INDEX: {
            if (!TYPE.data?.Payload?.mess) {
              safeSend(
                client,
                MESS_SERVER(
                  process.env.TYPE_GET_INDEX,
                  true,
                  'Missing index parameter'
                ),
                brokerKey
              );
              break;
            }

            const index = TYPE.data.Payload.mess;
            const response = await findBrokerByIndex(index);

            if (response === null) {
              const message = MESS_SERVER(
                process.env.TYPE_GET_INDEX,
                true,
                `No data found for index ${index}`
              );
              safeSend(client, message, brokerKey);
              console.log(`${brokerKey} Success ${index}`);
            } else {
              const message =
                TYPE.data.broker === response
                  ? MESS_SERVER(
                      process.env.TYPE_GET_INDEX,
                      true,
                      `No data found for index ${index}`
                    )
                  : MESS_SERVER(
                      process.env.TYPE_GET_INDEX,
                      false,
                      response
                    );
              safeSend(client, message, brokerKey);
            }
            break;
          }

          // ==================================================================
          // CASE 2: SET DATA
          // ==================================================================
          case process.env.TYPE_SET_DATA: {
            if (!TYPE.data?.broker_) {
              safeSend(
                client,
                'ERROR: Missing broker_ parameter',
                brokerKey
              );
              break;
            }

            try {
              await saveBrokerData(TYPE.data.broker_, TYPE.data);
            } catch (error) {
              console.error('Error saving broker data:', error);
              safeSend(client, 'ERROR: Failed to save data', brokerKey);
            }
            break;
          }

          // ==================================================================
          // CASE 3: RESET DATA
          // ==================================================================
          case process.env.TYPE_RESET_DATA: {
            if (!TYPE.data?.symbol || !TYPE.data?.broker) {
              safeSend(
                client,
                'ERROR: Missing symbol or broker parameter',
                brokerKey
              );
              break;
            }

            try {
              const Info = await getPriceSymbol(TYPE.data.symbol);

              await updateBrokerStatus(
                `${formatString(TYPE.data.broker)}`,
                `[${TYPE.data.Payload?.mess || 'N/A'}] - ${truncateString(
                  TYPE.data.symbol
                )}`
              );

              let responseData: any;
              let logColor: any;

              // Chuẩn hóa Index từ request
              const rawIndex = TYPE.data.index;
              const parsedIndex =
                rawIndex === undefined || rawIndex === null
                  ? null
                  : Number(rawIndex);
              const hasValidIndex =
                parsedIndex !== null && Number.isFinite(parsedIndex);

              if (Info) {
                responseData = {
                  ...Info,
                  Index: hasValidIndex ? parsedIndex : null,
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
                  Index: hasValidIndex ? parsedIndex : null,
                  Type: TYPE.type
                };
                logColor = colors.yellow;
              }

              log(
                logColor,
                `${process.env.TYPE_RESET_DATA}`,
                colors.reset,
                `Broker ${TYPE.data.broker} -> Symbol: ${
                  TYPE.data.symbol
                } - [${TYPE.data.Payload?.mess || 'N/A'}] <=> Broker Check: ${
                  responseData.Broker
                }`
              );

              // Gửi luôn response (nếu bạn muốn check chặt hơn có thể thêm điều kiện)
              safeSend(client, JSON.stringify(responseData), brokerKey);
            } catch (error) {
              console.error('Error in RESET_DATA:', error);
              safeSend(client, 'ERROR: Failed to process reset', brokerKey);
            }
            break;
          }

          // ==================================================================
          // DEFAULT: UNKNOWN MESSAGE TYPE
          // ==================================================================
          default: {
            const errorMessage = `ERROR: Unknown message type: ${TYPE.type}`;
            safeSend(client, errorMessage, brokerKey);
            log(
              colors.yellow,
              `${process.env.ICON_WARNING_LOG} Unknown message type:`,
              TYPE.type,
              'from',
              brokerKey
            );
            break;
          }
        }
      } catch (error: any) {
        console.error(
          `${process.env.ICON_WARNING_LOG} Message handling error for ${brokerKey}:`,
          error
        );
        safeSend(
          client,
          `ERROR: ${
            error instanceof Error ? error.message : 'Internal server error'
          }`,
          brokerKey
        );
      }
    });

    // ========================================================================
    // 5. XỬ LÝ ĐÓNG KẾT NỐI
    // ========================================================================
    client.on('close', async (code, reason) => {
      // Xoá khỏi DATA_SET trước, rồi log size hiện tại
      DATA_SET.delete(brokerKey);

      log(
        colors.red,
        `${process.env.ICON_DISCONNECT_LOG} DISCONNECTION`,
        colors.cyan,
        ` ${brokerKey} | Code: ${code} | Reason: ${
          reason || 'N/A'
        } | PID=${process.pid} | Remaining: ${DATA_SET.size}`
      );

      try {
        await clearBroker(removeSpaces(brokerKey, '-'));
      } catch (error) {
        console.error(`Error clearing broker ${brokerKey}:`, error);
      }
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

      // Chỉ đóng socket, không xóa DATA_SET ở đây (đã xử lý trong 'close')
      try {
        if (
          client.readyState !== WebSocket.CLOSED &&
          client.readyState !== WebSocket.CLOSING
        ) {
          client.close(1011, 'Internal error');
        }
      } catch (e) {
        console.error('Error closing client on error:', e);
      }
    });
  }
}
