/* eslint-disable */

const { log, colors , time ,getTimeGMT7 } = require('../helper/text.format');
const {getPortBroker , getAllBrokersSorted , scanKeys , getAllSymbolsFromRedis,getPriceSymbollAllBroker , getPrice } = require('../resdis/redis.store');
const {getAllSymbolConfigs } = require('../../database/symbol-config.helper');
const {getSymbolInfo} = require('../jobs/func.helper');
const {Analysis} = require('../jobs/analysis');
const { getAnalysisInTimeWindow } = require('../../database/analysis-config.helper');
const { symbolsSetType } = require('../jobs/analysis.helper');
const {saveAnalysis} = require('../resdis/redis.store');

export async function startJob() {
  console.log(`[JOB ${process.pid}] Save Analysis booting...`);
const interval = Number(process.env.CRON_INTERVAL_ANALYZE || 10000);
  // Interval 10 giây
  setInterval(async () => {
    let Type_1:any = [];
    let Type_2:any = [];
    // const test = symbolsSetType.has('ABC');
    const result  = await getAnalysisInTimeWindow(Number(process.env.TIME_SECONDS), {
      minCount: Number(process.env.MIN_COUNT),
      minKhoangCach: 1,
    });


    result.forEach(item => {
            if (symbolsSetType.has(item.Symbol)) {
              Type_1.push(item);
            } else {
              Type_2.push(item);
            }
          });
    const data = {
      Type_1,
      Type_2
    };
    await saveAnalysis(`ANALYSIS`, data);

  }, interval);

  console.log(`[JOB ${process.pid}] Save Analysis ready.`);
}

// Auto-run khi process là ROLE=JOB
if (process.env.ROLE === 'JOB_SAVE_ANALYSIS') {
  startJob().catch((e) => {
    console.error(`[JOB ${process.pid}] fatal:`, e);
    process.exit(1);
  });
//   start_Get_ConfigSymbol().catch((e) => {
//     console.error(`[JOB ${process.pid}] fatal:`, e);
//     process.exit(1);
//   });
}
7