/* eslint-disable */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { InitRedisService } from './module/resdis/init-redis.service';

import { SimpleGateway } from './module/websocket/forex.gateway';
import { SimpleGateway_WEB } from './module/websocket/web.gateway.symbol';
import { SimpleGateway_WEB_BROKERS } from './module/websocket/web.gateway.brokers';
import { SimpleGateway_WEB_BROKERS_INFO } from './module/websocket/web.gateway.broker.info';
import { SimpleGateway_WEB_Analysis } from './module/websocket/web.gateway.analys.mongo';

@Module({
  imports: [AuthModule],
  providers: [
    InitRedisService,
    SimpleGateway,
    SimpleGateway_WEB,
    SimpleGateway_WEB_BROKERS,
    SimpleGateway_WEB_BROKERS_INFO,
    SimpleGateway_WEB_Analysis,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class WsModule {}
