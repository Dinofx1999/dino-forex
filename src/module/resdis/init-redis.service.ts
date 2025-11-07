// src/redis/init-redis.service.ts
/* eslint-disable */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { clearBrokerData } from '../resdis/redis.store';
const { log, colors } = require('../helper/text.format');

@Injectable()
export class InitRedisService implements OnModuleInit {
  async onModuleInit() {
    await clearBrokerData();
    log(colors.green,`${process.env.ICON_ACCESS_LOG} Redis`, colors.cyan, ` Redis cache cleared!`);
  }
}
