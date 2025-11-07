/* eslint-disable */
import { Injectable } from '@nestjs/common';
const {getPortBroker , getAllBrokersSorted } = require('../src/module/resdis/redis.store')
const {publish, subscribe} = require('../src/module/resdis/redis.pub_sub');
@Injectable()
export class AppService {
  getHello(): string {
    const data = getAllBrokersSorted();
    return data;
  }

  getPortBroker(broker:string){
    const data = getPortBroker(broker);
    return data;
  }

  async resetBroker(broker:string , symbol:string){
    //logic to reset broker info
    const data = await getPortBroker(broker);
    const Channel = `${process.env.CHANNEL_RESET}-${data.port}`;
    const isPublished = await publish(Channel, { broker: data.broker, symbol });
    return { data, isPublished };
  }
async resetAllSymbols(symbol:string){
    //logic to reset broker info
    const Channel = `${process.env.RESET_ALL_SYMBOLS}`;
    const isPublished = await publish(Channel, { symbol });
    return { isPublished };
  }
}
