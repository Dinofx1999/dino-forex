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

  const isHttpRole = role === 'HTTP';

  const app = await NestFactory.create(isHttpRole ? HttpModule : WsModule);

  app.use(cors());

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

  if (isHttpRole) {
    log(
      colors.blue,
      `HTTP`,
      colors.cyan,
      `http://${process.env.ROOT_PATH_SERVER || 'localhost'}:${port}`,
    );
    return;
  }

  // Logs WS URL như bạn đang làm...
}
bootstrap();
