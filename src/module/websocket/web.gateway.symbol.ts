/* eslint-disable */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnModuleInit, OnModuleDestroy ,UseGuards } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import * as url from 'url';

import { log, colors } from'../helper/text.format';
import { MESS_SERVER } from '../constants/mess.server';
import { publish, subscribe } from '../resdis/redis.pub_sub';
// import { JwtAuthGuard } from '../../../src/auth/jwt-auth.guard';

import { getPriceSymbol, 
  getBrokerData, 
  getAllBrokers, 
  checkBrokerExists, 
  findBrokerByIndex,
  getPrice ,
getPriceSymbollAllBroker } from '../resdis/redis.store';



function ParseJSON(txt: string): any { 
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

// @UseGuards(JwtAuthGuard)
@WebSocketGateway({ path: process.env.WS_SYMBOL_BROKERS_PATH || '/symbol-brokers' })
export class SimpleGateway_WEB implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  
  // 👇 Lưu subscriptions và intervals
  private redisSubscription: any = null;
  private clientIntervals: Map<string, NodeJS.Timeout> = new Map();

  // ✅ Subscribe Redis khi module khởi động
  async onModuleInit() {
    const channel = `${process.env.CHANNEL_RESET_WEB}-${process.env.PORT}`;
    
    log(colors.blue, `🔄 Subscribing to Redis: ${channel}`, colors.reset, '');

    this.redisSubscription = await subscribe(channel, (data) => {
      // Broadcast đến tất cả clients
    });

    log(colors.green, `✅ Subscribed to ${channel}`, colors.reset, '');
  }

  // ✅ Cleanup khi module destroy
  async onModuleDestroy() {
    log(colors.yellow, '🔄 Cleaning up...', colors.reset, '');
    
    // Unsubscribe Redis
    if (this.redisSubscription && this.redisSubscription.unsubscribe) {
      await this.redisSubscription.unsubscribe();
    }

    // Clear tất cả intervals
    this.clientIntervals.forEach((interval, clientId) => {
      clearInterval(interval);
      console.log(`🔄 Cleared interval for ${clientId}`);
    });
    this.clientIntervals.clear();

    log(colors.green, '✅ Cleanup completed', colors.reset, '');
  }

  handleConnection(client: WebSocket, req: any) {
    // Parse query params
    const parsedUrl = url.parse(req.url || '', true);
    const queryParams = parsedUrl.query;
    
    // Lấy params
    const symbol = (queryParams.symbol as string) || 'AUDUSD';
    const broker = (queryParams.broker as string) || 'UNKNOWN';
    const userId = (queryParams.userId as string) || null;

    // Tạo unique client ID
    const clientId = `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const clientName = `Web Client [${symbol}]`;
    


    // Gửi thông báo kết nối
    client.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Server for Symbol Brokers',
      clientId: clientId,
      params: {
        symbol: symbol,
        broker: broker,
        userId: userId,
      }
    }));

    log(
      colors.green,
      `${process.env.ICON_CONNECT_LOG} NEW CONNECTION`,
      colors.cyan,
      `${clientName} | Symbol: ${symbol} | PID=${process.pid} | PORT=${process.env.PORT}`,
    );

    console.log('📋 Query Params:', queryParams);

    // 👇 START JOB CHỈ CHO CLIENT NÀY
    this.startJob(client, clientId, clientName, symbol);

    // Khi client gửi message
    client.on('message', async (raw: Buffer) => {
      const txt = raw.toString('utf8').trim();
    });

    // 👇 KHI CLIENT ĐÓNG KẾT NỐI - KILL INTERVAL
    client.on('close', () => {
      log(
        colors.red,
        `${process.env.ICON_DISCONNECT_LOG} DISCONNECTION`,
        colors.cyan,
        `${clientName} | Client ID: ${clientId}`
      );

      // ✅ KILL INTERVAL CỦA CLIENT NÀY
      this.stopJob(clientId);
      log(colors.green, `✅ Cleaned up resources for ${clientId}`, colors.reset, '');
    });

    // Khi client xảy ra lỗi
    client.on('error', (err) => {
      console.error(`${process.env.ICON_WARNING_LOG} ${clientName} error:`, err.message);
    });
  }

  // ✅ START JOB CHO CLIENT CỤ THỂ
  private startJob(client: WebSocket, clientId: string, clientName: string, symbol: string) {
    // Nếu đã có interval cho client này, clear nó trước
    this.stopJob(clientId);

    const interval = Number(process.env.CRON_INTERVAL_SYMBOL_BROKERS || 500);
    
    // Tạo interval mới
    const jobInterval = setInterval(async () => {
      // Kiểm tra client còn connected không
      if (client.readyState !== WebSocket.OPEN) {
        console.log(`⚠️ Client ${clientId} not connected, stopping job`);
        this.stopJob(clientId);
        return;
      }

      try {
        const now = new Date().toISOString();
        // Lấy symbol hiện tại của client (có thể đã đổi)
        // Lấy price từ Redis
        const prices = await getPriceSymbollAllBroker(symbol);
        
        // Gửi cho client
        client.send(JSON.stringify({
          type: 'only_symbol',
          symbol: symbol,
          data: prices,
          timestamp: now,
          clientId: clientId,
          clientName: clientName,
        }));

        // console.log(`[JOB ${process.pid}] tick @ ${now} → ${clientName} [${currentSymbol}] → ${prices.length} broker(s)`);

      } catch (error) {
        console.error(`❌ Job error for ${clientId}:`, error.message);
        
        // Gửi error cho client
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'error',
            message: 'Failed to fetch price data',
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }, interval);

    // 👇 LƯU INTERVAL VÀO MAP
    this.clientIntervals.set(clientId, jobInterval);
    
    // log(colors.green, `✅ Job started for ${clientId}`, colors.reset, '');
  }

  // ✅ STOP JOB (KILL INTERVAL)
  private stopJob(clientId: string) {
    const interval = this.clientIntervals.get(clientId);
    
    if (interval) {
      clearInterval(interval);
      this.clientIntervals.delete(clientId);
      log(colors.yellow, `🔄 Job stopped for ${clientId}`, colors.reset, '');
    }
  }
}