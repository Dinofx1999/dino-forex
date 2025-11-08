/* eslint-disable */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { log, colors } from'../src/module/helper/text.format';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Use WS adapter
  app.useWebSocketAdapter(new WsAdapter(app));
  
  const port = process.env.PORT || 5000;
  const role = process.env.ROLE || 'WS_TRADING';
  const workerId = process.env.WORKER_ID || 'unknown';

  app.enableCors({
    origin: ['http://16.105.227.149:3000'], // FE origin
    methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
    credentials: true,   // nếu dùng cookie/session
    maxAge: 600,         // cache preflight
  });
  
  await app.listen(port);
  // log(colors.green, `Worker`, colors.cyan, `${workerId} running as ${role} on ws://${process.env.ROOT_PATH_SERVER}:${port}`);
  // log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}`);

  // Log available gateways
  if (role === 'WS_SYMBOL_BROKERS') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_SYMBOL_BROKERS_PATH || '/undefined'}/?symbol={symbol_name}`);
  } else if (role === 'WS_TRADING') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_PATH || '/undefined'}`);
  } else if (role === 'WS_WEB_BROKERS_INFO') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_BROKER_INFO_PATH || '/undefined'}`);
  } else if (role === 'WS_WEB_SYMBOLS_INFO') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_SYMBOLS_INFO_PATH || '/undefined'}?broker={broker_name}`);
  }else if (role === 'WS_WEB_ANALYSIS') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_ANALYSIS_PATH || '/undefined'}`);
  }
}

bootstrap();
