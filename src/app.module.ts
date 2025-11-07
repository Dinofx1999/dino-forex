/* eslint-disable */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SimpleGateway } from './module/websocket/forex.gateway';
import { InitRedisService } from './module/resdis/init-redis.service';
import { SimpleGateway_WEB } from './module/websocket/web.gateway.symbol';
import {SimpleGateway_WEB_BROKERS } from './module/websocket/web.gateway.brokers';
import {SimpleGateway_WEB_BROKERS_INFO } from './module/websocket/web.gateway.broker.info';
import {SimpleGateway_WEB_Analysis } from './module/websocket/web.gateway.analys.mongo';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
@Module({
  imports: [AuthModule],
  controllers: [AppController],
  providers: [AppService, SimpleGateway, InitRedisService, SimpleGateway_WEB, SimpleGateway_WEB_BROKERS, SimpleGateway_WEB_BROKERS_INFO, SimpleGateway_WEB_Analysis,{
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    }],
})
export class AppModule {}
