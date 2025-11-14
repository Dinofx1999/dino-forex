/* eslint-disable */
import { Controller, Post, Get, Put, Delete, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import {  API_ALL_INFO_BROKERS , 
          API_PORT_BROKER_ENDPOINT, 
          API_RESET , 
          API_RESET_ALL_ONLY_SYMBOL ,
          API_CONFIG_SYMBOL , 
          API_ANALYSIS_CONFIG , API_PRICE_SYMBOL ,
          API_RESET_ALL_BROKERS , API_GET_CONFIG_SYMBOL } from './module/constants/API.service';
// calculatePercentage

const { log, colors , time ,getTimeGMT7, formatString ,truncateString , calculatePercentage } = require('../src/module/helper/text.format');


import {GET,POST} from './module/constants/FetchData.service';
import { getAllBrokersSorted, getPrice , getPriceSymbollAllBroker } from './module/resdis/redis.store';
const { connectMongoDB, disconnectMongoDB } = require('./database/mongodb');
const { insertSymbolConfig, getSymbolConfig, getAllSymbolConfigs } = require('./database/symbol-config.helper');
const {Insert_UpdateAnalysisConfig} = require('./database/analysis-config.helper');

const { saveBrokerData, 
        getBrokerData, 
        getAllBrokers, 
        checkBrokerExists, 
        findBrokerByIndex , 
        clearBroker , 
        getPriceSymbol,
        getPriceSymbol_ } = require('../src/module/resdis/redis.store')


@Controller()
export class AppController {
  
  constructor(private readonly appService: AppService) {}
  
  //Get tất cả thông tin broker
  @Get(API_ALL_INFO_BROKERS)
  getHello(): any {
    return this.appService.getHello();
  }
  //Get cổng của broker
  @Get(API_PORT_BROKER_ENDPOINT)
  getPortBroker(@Param('broker') broker: string): any {
    return this.appService.getPortBroker(broker);
  }
  //Reset broker
  @Get(API_RESET)
  resetBroker(
    @Param('broker') broker: string,
    @Param('symbol') symbol: string,
  ): any {
    return this.appService.resetBroker(broker, symbol);
  }

  //Reset All Symbol
  @Get(API_RESET_ALL_ONLY_SYMBOL)
  resetAllSymbols(
    @Param('symbol') symbol: string,
  ): any {
    if(symbol === "ALL") return { isPublished: false , message: "No Support RESET ALL SYMBOLS" };
    return this.appService.resetAllSymbols(symbol);
  }
  //Thêm cấu hình Spread cho các Symbol
  @Post(API_CONFIG_SYMBOL)
    async createSymbolConfig(@Body() body: any): Promise<any> {
      try {
        // await connectMongoDB();
        // Validate required fields
        if (!body.Symbol) {
          throw new HttpException('Symbol is required', HttpStatus.BAD_REQUEST);
        }

        if (body.Spread_STD === undefined || body.Spread_ECN === undefined) {
          throw new HttpException('Spread_STD and Spread_ECN are required', HttpStatus.BAD_REQUEST);
        }

        if (!body.Sydney || !body.Tokyo || !body.London || !body.NewYork) {
          throw new HttpException('All session multipliers are required', HttpStatus.BAD_REQUEST);
        }
        // Insert vào MongoDB
        const result = await insertSymbolConfig({
          Symbol: body.Symbol,
          Spread_STD: body.Spread_STD,
          Spread_ECN: body.Spread_ECN,
          Sydney: body.Sydney,
          Tokyo: body.Tokyo,
          London: body.London,
          NewYork: body.NewYork
        });
        // await disconnectMongoDB();
        return {
          success: true,
          message: `Symbol config created: ${body.Symbol}`,
          data: {
            id: result.insertedId,
            symbol: body.Symbol
          }
        };

      } catch (error) {
        if (error.code === 11000) {
          throw new HttpException(
            `Symbol ${body.Symbol} already exists`,
            HttpStatus.CONFLICT
          );
        }
        
        throw new HttpException(
          error.message || 'Failed to create symbol config',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
  }
  //Láy Dữ Lieuẹ Cấu Hình Spread của Symbol
  @Get(API_GET_CONFIG_SYMBOL)
  async getSymbolConfigHandler(
    @Param('symbol') symbol: string,
  ): Promise<any> {
    try {
      let config = [];
      if( symbol.toUpperCase() != "ALL"){
        config = await getSymbolConfig(symbol);
      }else{
        config = await getAllSymbolConfigs();
      }
      if (!config) {
        throw new HttpException(
          `Symbol config for ${symbol} not found`,
          HttpStatus.NOT_FOUND
        );
      }
      return {
        success: true,
        data: config
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get symbol config',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
  //Thêm vào Phân Tích Lỗi Giá vào Database
  @Post(API_ANALYSIS_CONFIG)
  async setAnalysisConfig(@Body() body: any): Promise<any> {
    try {
      console.log('Received request body for analysis config:', body);

      await Insert_UpdateAnalysisConfig(body.Symbol ,body);
      return {
        success: true,
        message: 'Analysis config processed successfully'
      };
    } catch (error) {
      throw new HttpException(
          error.message || 'Failed to set analysis config',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
  }

  //Reset All Symbol
  @Get(API_PRICE_SYMBOL)
  async getPrice(
    @Param('symbol') symbol: string,
  ): Promise<any> {
    return await getPriceSymbollAllBroker(symbol);
  }

//  @Get(API_RESET_ALL_BROKERS)
// async resetALLBroker() {
//   const allBrokers = getAllBrokersSorted();
// }
@Get(API_RESET_ALL_BROKERS)
async resetALLBroker() {
  try {
    // ✅ Chạy background, không block response

     await this.resetBrokersLoop();
    
    return {
      success: true,
      message: 'Reset all brokers started (running in background)'
    };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: error.message };
  }
}

// ✅ Hàm chạy background với while loop
public async resetBrokersLoop() {
const allBrokers = await getAllBrokersSorted();
if(allBrokers.length <= 1){
  console.log('❌ No brokers to reset');
  return;
}
console.log(`🔄 Starting reset for ${allBrokers.length} brokers...`);
let index = 1;
  while (index < allBrokers.length && allBrokers.length > 1) {
    const allBrokers_ = await getAllBrokersSorted();
    try {
      if (allBrokers.length === 0) {
        console.log('❌ No brokers found');
        break;
      }
      if(index === 1 ){
        index++;
         console.log(`✅ Continue Reset: ${allBrokers[index-1].broker_}`);
         this.appService.resetBroker(allBrokers[index-1].broker_, "ALL");
      }
      const status = String(allBrokers_[index-1].status);
      const Per_status = Number(Number(calculatePercentage(status)).toFixed(0));
      // console.log(`🔄 Resetting broker:${index-1} : ${status} - ${Per_status}`);
      if(Per_status >= 30){
        index++;
         this.appService.resetBroker(allBrokers[index-1].broker_, "ALL");
        console.log(`✅ Continue Reset: ${allBrokers[index-1].broker_}`);
      }
      if(index === allBrokers.length){
        console.log('✅ Completed resetting all brokers');
        break;
      }
      
    } catch (error) {
      console.error('❌ Error in reset loop:', error);
      // Chờ rồi retry
      // await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

}