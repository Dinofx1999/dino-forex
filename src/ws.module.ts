/* eslint-disable */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { InitRedisService } from './module/resdis/init-redis.service';

import { SimpleGateway } from './module/websocket/forex.gateway';
import { SimpleGateway_WEB } from './module/websocket/web.gateway.symbol';
import { SimpleGateway_WEB_BROKERS } from './module/websocket/web.gateway.brokers';
import { SimpleGateway_WEB_BROKERS_INFO } from './module/websocket/web.gateway.broker.info';
import { SimpleGateway_WEB_Analysis } from './module/websocket/web.gateway.analys.mongo';

// Nếu bạn có JwtStrategy thì import thêm:
import { JwtStrategy } from './auth/jwt.strategy';

@Module({
  imports: [
    // Đăng ký JwtModule trực tiếp, dùng secret từ .env
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN) as any || '7d' },
    }),
  ],
  providers: [
    InitRedisService,

    // Các WebSocket Gateway
    SimpleGateway,                 // MT4/MT5
    SimpleGateway_WEB,             // web symbol brokers
    SimpleGateway_WEB_BROKERS,
    SimpleGateway_WEB_BROKERS_INFO,
    SimpleGateway_WEB_Analysis,

    // Nếu dùng JwtStrategy thì thêm vào provider
    JwtStrategy,

    // Global guard cho WS (nếu bạn muốn auth WS)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class WsModule {}
