/* eslint-disable */
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { log, colors } from '../src/module/helper/text.format';
const cors = require('cors');

import { HttpModule } from './http.module';
import { WsModule } from './ws.module';

async function bootstrap() {
  const role = process.env.ROLE || 'WS_TRADING';
  const port = process.env.PORT || 5000;
  const workerId = process.env.WORKER_ID || 'unknown';

  // Chọn module theo ROLE
  const isHttpRole = role === 'HTTP';
  const app = await NestFactory.create(isHttpRole ? HttpModule : WsModule);

  // CORS
  app.use(cors());

  // Chỉ bật WebSocket adapter cho các ROLE WS_*
  const isWsRole =
    role === 'WS_TRADING' ||
    role === 'WS_SYMBOL_BROKERS' ||
    role === 'WS_WEB_BROKERS_INFO' ||
    role === 'WS_WEB_SYMBOLS_INFO' ||
    role === 'WS_WEB_ANALYSIS';

  if (isWsRole) {
    app.useWebSocketAdapter(new WsAdapter(app));
  }

  await app.listen(port, '0.0.0.0');

  log(
    colors.green,
    `✅ [${workerId}] Server listening on port ${port}`,
    colors.cyan,
    `Role: ${role}`,
  );

  // === LOG URL THEO ROLE ===

  if (isHttpRole) {
    log(
      colors.blue,
      `HTTP`,
      colors.cyan,
      `http://${process.env.ROOT_PATH_SERVER || 'localhost'}:${port}`,
    );
    return;
  }

  if (role === 'WS_SYMBOL_BROKERS') {
    log(
      colors.blue,
      `WebSocket`,
      colors.cyan,
      `ws://${process.env.ROOT_PATH_SERVER}:${port}${
        process.env.WS_SYMBOL_BROKERS_PATH || '/undefined'
      }/?symbol={symbol_name}`,
    );
  } else if (role === 'WS_TRADING') {
    log(
      colors.blue,
      `WebSocket`,
      colors.cyan,
      `ws://${process.env.ROOT_PATH_SERVER}:${port}${
        process.env.WS_PATH || '/undefined'
      }`,
    );
  } else if (role === 'WS_WEB_BROKERS_INFO') {
    log(
      colors.blue,
      `WebSocket`,
      colors.cyan,
      `ws://${process.env.ROOT_PATH_SERVER}:${port}${
        process.env.WS_WEB_BROKER_INFO_PATH || '/undefined'
      }`,
    );
  } else if (role === 'WS_WEB_SYMBOLS_INFO') {
    log(
      colors.blue,
      `WebSocket`,
      colors.cyan,
      `ws://${process.env.ROOT_PATH_SERVER}:${port}${
        process.env.WS_WEB_SYMBOLS_INFO_PATH || '/undefined'
      }?broker={broker_name}`,
    );
  } else if (role === 'WS_WEB_ANALYSIS') {
    log(
      colors.blue,
      `WebSocket`,
      colors.cyan,
      `ws://${process.env.ROOT_PATH_SERVER}:${port}${
        process.env.WS_WEB_ANALYSIS_PATH || '/undefined'
      }`,
    );
  }
}

bootstrap();
