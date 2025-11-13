/* eslint-disable */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';       // 👈 Module có controller (login, v.v)
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { InitRedisService } from './module/resdis/init-redis.service';

@Module({
  imports: [AuthModule],          // 👈 Ở HTTP port mới import AuthModule
  controllers: [AppController],
  providers: [
    AppService,
    InitRedisService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class HttpModule {}
