/* eslint-disable */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { log, colors } from '../src/module/helper/text.format';
const cors = require('cors');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Cho phép frontend gọi tới (localhost và IP public)
  // app.enableCors({
  //   origin: [
  //     '*',
  //   ],
  //   methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
  //   allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  //   credentials: true,
  //   maxAge: 600,
  // });
  app.use(cors());

  // ✅ WebSocket adapter
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = process.env.PORT || 5000;
  const role = process.env.ROLE || 'WS_TRADING';
  const workerId = process.env.WORKER_ID || 'unknown';

  // ✅ Lắng nghe cả trên IP để có thể truy cập từ ngoài
  await app.listen(port, '0.0.0.0');
  log(colors.green, `✅ Server listening on port ${port}`);

  if (role === 'WS_SYMBOL_BROKERS') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_SYMBOL_BROKERS_PATH || '/undefined'}/?symbol={symbol_name}`);
  } else if (role === 'WS_TRADING') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_PATH || '/undefined'}`);
  } else if (role === 'WS_WEB_BROKERS_INFO') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_BROKER_INFO_PATH || '/undefined'}`);
  } else if (role === 'WS_WEB_SYMBOLS_INFO') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_SYMBOLS_INFO_PATH || '/undefined'}?broker={broker_name}`);
  } else if (role === 'WS_WEB_ANALYSIS') {
    log(colors.blue, `WebSocket`, colors.cyan, `ws://${process.env.ROOT_PATH_SERVER}:${port}${process.env.WS_WEB_ANALYSIS_PATH || '/undefined'}`);
  }
}

bootstrap();
