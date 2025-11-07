/* eslint-disable */

const { log, colors , time ,getTimeGMT7 } = require('../helper/text.format');
const {getPortBroker , getAllBrokersSorted , scanKeys , getAllSymbolsFromRedis,getPriceSymbollAllBroker , getPrice } = require('../resdis/redis.store');
const {getAllSymbolConfigs } = require('../../database/symbol-config.helper');
const {getSymbolInfo} = require('../jobs/func.helper');
const {Analysis} = require('../jobs/analysis');

let ConfigSymbol:any = [];

export async function startJob() {
  console.log(`[JOB ${process.pid}] Analysis booting...`);
const interval = Number(process.env.CRON_INTERVAL_ANALYZE || 10000);
  // Interval 10 giây
  setInterval(async () => {
    const now = new Date().toISOString();
    const ALL_Symbol = await getAllSymbolsFromRedis();
   for (const symbol of ALL_Symbol) {
      const sym = String(symbol).trim().toUpperCase();
      const symbolConfig = getSymbolInfo(ConfigSymbol, sym);
      const priceData =  await getPriceSymbollAllBroker(sym);
        if(priceData.length <= 1 || sym === undefined ) continue;
        await Analysis(priceData, sym , symbolConfig);
  
}

  }, interval);

  console.log(`[JOB ${process.pid}] Analysis ready.`);
}


export async function start_Get_ConfigSymbol() {
  console.log(`[JOB ${process.pid}] Get_ConfigSymbol booting...`);
const interval_ = 1000;
  // Interval 10 giây
  setInterval(async () => {
    const Data_Config = await getAllSymbolConfigs();
    ConfigSymbol = Data_Config;
  }, interval_);

  console.log(`[JOB ${process.pid}] Get_ConfigSymbol ready.`);
}

// Auto-run khi process là ROLE=JOB
if (process.env.ROLE === 'JOB') {
  startJob().catch((e) => {
    console.error(`[JOB ${process.pid}] fatal:`, e);
    process.exit(1);
  });
  start_Get_ConfigSymbol().catch((e) => {
    console.error(`[JOB ${process.pid}] fatal:`, e);
    process.exit(1);
  });
}