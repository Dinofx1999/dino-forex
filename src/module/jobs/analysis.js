/* eslint-disable */
const {getForexSession , Digit , Digit_Rec} = require('../jobs/func.helper');
const { log, colors , time ,getTimeGMT7 } = require('../helper/text.format');
const {Insert_UpdateAnalysisConfig} = require('../../database/analysis-config.helper');

 async function Analysis(data, symbol ,symbolConfig_data) {
    try {
        // console.log(`\n--- Analysis for ${symbol} at ${getTimeGMT7()} ---`);
    let total_length = data.length;
    for(let i = 1; i < total_length; i++){
        const CHECK = data[0];
        const CURRENT = data[i];
        let SPREAD_MIN_CURRENT = Number(CURRENT.spread);
        let SPREAD_X_CURRENT = Number(process.env.SPREAD_X_CURRENT) || 0.1;
        let SESSION = getForexSession(getTimeGMT7());
        if(symbolConfig_data){
            if(SESSION === "Sydney") SPREAD_X_CURRENT = symbolConfig_data.Sydney;
            if(SESSION === "Tokyo") SPREAD_X_CURRENT = symbolConfig_data.Tokyo;
            if(SESSION === "London") SPREAD_X_CURRENT = symbolConfig_data.London;
            if(SESSION === "NewYork") SPREAD_X_CURRENT = symbolConfig_data.NewYork;

            if( CURRENT.typeaccount === "STD") SPREAD_MIN_CURRENT = symbolConfig_data.Spread_STD;
            if( CURRENT.typeaccount === "ECN") SPREAD_MIN_CURRENT = symbolConfig_data.Spread_ECN;
        }

        //Check BUY
        let Point_BUY = parseFloat(SPREAD_MIN_CURRENT * SPREAD_X_CURRENT) * parseFloat(Digit(parseInt(CHECK.digit)));
        let Price_BUY_CURRENT = parseFloat(CURRENT.ask_mdf + Point_BUY);
        let Price_BUY_CHECK = parseFloat(CHECK.bid);

        
        // console.log(CURRENT);
        // console.log(" Symbol: ", symbol ,"raw: " ,CURRENT.spread ,"Price: ",Point_BUY,Number(CURRENT.ask_mdf) , Price_BUY_CURRENT , " < " ,Price_BUY_CHECK , " ? Spread: ", SPREAD_MIN_CURRENT , "x", SPREAD_X_CURRENT , "=", Price_BUY_CURRENT < Price_BUY_CHECK);
        if(parseFloat(Price_BUY_CURRENT) < parseFloat(Price_BUY_CHECK)){
            const timeStart = getTimeGMT7();
            const Payload = {
                    Broker: CURRENT.broker,
                    TimeStart: timeStart,
                    TimeCurrent: timeStart,
                    Symbol: symbol,
                    Count: 0,
                    Messenger: "BUY",
                    Broker_Main: CHECK.broker,
                    KhoangCach: parseInt((Price_BUY_CHECK - Price_BUY_CURRENT)*parseFloat(Digit_Rec(parseInt(CHECK.digit)))) ,
                    Symbol_Raw: CURRENT.symbol_raw,
                    Spread_main: CURRENT.spread,
                    IsStable: false,
            };
            await Insert_UpdateAnalysisConfig(symbol,Payload);
        }


        //Check SELL
        let Point_SELL = parseFloat((parseFloat(SPREAD_MIN_CURRENT) * parseFloat(SPREAD_X_CURRENT))*parseFloat(Digit(parseInt(CHECK.digit))));
        let Price_SELL_CURRENT = parseFloat(CURRENT.bid_mdf - Point_SELL);
        let Price_SELL_CHECK = parseFloat(CHECK.bid) + parseFloat(SPREAD_MIN_CURRENT)*parseFloat(Digit(parseInt(CHECK.digit)));
        if(parseFloat(Price_SELL_CURRENT) > parseFloat(Price_SELL_CHECK)){
            const timeStart = getTimeGMT7();
            const Payload = {
                    Broker: CURRENT.broker,
                    TimeStart: timeStart,
                    TimeCurrent: timeStart,
                    Symbol: symbol,
                    Count: 0,
                    Messenger: "SELL",
                    Broker_Main: CHECK.broker,
                    KhoangCach: parseInt((Price_SELL_CURRENT - Price_SELL_CHECK)*parseFloat(Digit_Rec(parseInt(CHECK.digit)))) ,
                    Symbol_Raw: CURRENT.symbol_raw,
                    Spread_main: CURRENT.spread,
                    IsStable: false,
            };
            await Insert_UpdateAnalysisConfig(symbol,Payload);
        }
    }
    } catch (error) {
        console.error(`Lỗi Phân Tích Chậm Giá ${symbol}:`, error);
    }
    
    // Perform analysis logic here
}

module.exports = {Analysis };