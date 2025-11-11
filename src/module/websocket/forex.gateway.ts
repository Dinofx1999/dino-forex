/* eslint-disable */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Public } from '../../../src/auth/decorators/public.decorator';
import { Server, WebSocket } from 'ws';
const { log, colors , time ,getTimeGMT7, formatString ,truncateString } = require('../helper/text.format');
const {MESS_SERVER } = require('../constants/mess.server');
const {publish, subscribe} = require('../resdis/redis.pub_sub');

const {removeSpaces} = require('../jobs/func.helper');
// removeSpaces


const { saveBrokerData, updateBrokerStatus, checkBrokerExists, findBrokerByIndex , clearBroker , getPriceSymbol,clearBroker_Reset } = require('../resdis/redis.store')

function ParseJSON(txt: string): any {
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

const DATA_SET: any = {};

//REDIS SUBSCRIBE RESET
(async () => {
  await subscribe(`${process.env.CHANNEL_RESET}-${process.env.PORT}`, (data) => {
    if (data.broker && data.symbol && DATA_SET[data.broker]) {
      // Handle the reset event for the specific broker and symbol
      DATA_SET[data.broker].ws.send("RESET-"+data.symbol);
      // console.log(`Reset event received for Broker: ${data.broker}, Symbol: ${data.symbol}`);
    }else if(data.broker === "ALL"){
      // Reset all connections
      Object.keys(DATA_SET).forEach((brokerKey) => {
        DATA_SET[brokerKey].ws.send("RESET-"+data.symbol);
      });
    }else{
      console.log(`No active connection for Broker: ${data.broker}`);
    }
  });
})();

//REDIS SUBSCRIBE RESET ALL SYMBOLS
(async () => {
  await subscribe(`${process.env.RESET_ALL_SYMBOLS}`, (data:any) => {
      // Reset all connections
      Object.keys(DATA_SET).forEach((brokerKey) => {
       if(data.symbol !== "ALL") DATA_SET[brokerKey].ws.send("RESET-"+data.symbol);
      });
  });
})();
@Public() 
@WebSocketGateway({ path: process.env.WS_PATH || '/connect' })
export class SimpleGateway {
  @WebSocketServer() server!: Server;
  handleConnection(client: WebSocket , req: any) {
  client.send("Connected to Server-"+getTimeGMT7());

  if(DATA_SET[req.rawHeaders[13]] === undefined || DATA_SET[req.rawHeaders[13]] === null){
    DATA_SET[req.rawHeaders[13]] = { ws: client , broker: req.rawHeaders[13]};
  }
log(colors.green,
  `${process.env.ICON_CONNECT_LOG} NEW CONNECTION`,
  colors.cyan,
  ` ${req.rawHeaders[13]} | PID=${process.pid} | PORT=${process.env.PORT} Length Data Set: ${Object.keys(DATA_SET).length}`,
);

  // Khi client gửi message
  client.on('message', async (raw: Buffer) => {
    const txt = raw.toString('utf8').trim();
    const TYPE = ParseJSON(txt)[0];
    if(TYPE.type === process.env.TYPE_GET_INDEX){
      const index = TYPE.data.Payload.mess;
      const response = await findBrokerByIndex(index);
      if(response === null){
        const message = MESS_SERVER(process.env.TYPE_GET_INDEX, true , `No data found for index ${index}`);
        client.send(message);
        console.log(`${req.rawHeaders[13]}  Success ${index}`);
        return;
      }else{
        if(TYPE.data.broker === response){
          const message = MESS_SERVER(process.env.TYPE_GET_INDEX, true , `No data found for index ${index}`);
          client.send(message);
        }else{
          client.send(MESS_SERVER(process.env.TYPE_GET_INDEX, false , response));
        }
        return;
      }
    }else if (TYPE.type === process.env.TYPE_SET_DATA) {
      await saveBrokerData(TYPE.data.broker_,TYPE.data);
    }else if (TYPE.type === process.env.TYPE_RESET_DATA) {
      //  await clearBroker_Reset(removeSpaces(TYPE.data.broker, "-"));
       
       const Info = await getPriceSymbol(TYPE.data.symbol);
       await updateBrokerStatus(`${formatString(TYPE.data.broker)}`,`[${TYPE.data.Payload.mess}] - ${truncateString(TYPE.data.symbol)}`);
       if(Info){
             Info.Index = TYPE.data.index;
             Info.Type = TYPE.type;
            //  log(colors.green,`${process.env.TYPE_RESET_DATA}` ,colors.reset ,`Broker ${TYPE.data.broker} -> Symbol: ${TYPE.data.symbol} - [ ${TYPE.data.Payload.mess} ] <=> Broker Check: ${Info.Broker}`);
             client.send(JSON.stringify(Info));
       }else{
             const mess = {
                Symbol: TYPE.data.symbol,
                Broker: TYPE.data.broker,
                Bid:  'null',
                Digit: 'null',
                Time: 'null',
                Index: TYPE.data.index,
                Type : TYPE.type
             }
            //  log(colors.yellow,`${process.env.TYPE_RESET_DATA}` ,colors.reset ,`Broker ${TYPE.data.broker} -> Symbol: ${TYPE.data.symbol} - [ ${TYPE.data.Payload.mess} ] <=> Broker Check: ${mess.Broker}`);
             client.send(JSON.stringify(mess));
       }
    }
    
    if (txt === 'ping') {
      client.send('pong');
      return;
    }
  });

  // Khi client đóng kết nối
  client.on('close', async () => {
    log(colors.red, `${process.env.ICON_DISCONNECT_LOG} DISCONNECTION`, colors.cyan, ` ${req.rawHeaders[13]} | PID=${process.pid}`);
    await clearBroker(removeSpaces(req.rawHeaders[13], "-"));
    delete DATA_SET[req.rawHeaders[13]];
  });

  // Khi client xảy ra lỗi
  client.on('error', (err) => {
    console.error(`${process.env.ICON_WARNING_LOG} Client error | PID=${process.pid}:`, err.message);
  });
}
}

