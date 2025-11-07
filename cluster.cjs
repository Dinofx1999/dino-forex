/* eslint-disable */
// cluster.cjs
const path = require('node:path');
const fs = require('node:fs');
const cluster = require('node:cluster');
const { log, colors } = require('./src/module/helper/text.format');

try {
  process.on('uncaughtException', (err) => {
    console.error(`${process.env.ICON_ERROR_LOG || '❌'} uncaughtException:`, err);
  });
  process.on('unhandledRejection', (err) => {
    console.error(`${process.env.ICON_ERROR_LOG || '❌'} unhandledRejection:`, err);
  });

  require('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true });

  const { connectMongoDB, disconnectMongoDB } = require('./src/database/mongodb');
  const { setupDatabase } = require('./src/database/setup-database.cjs');

  // ============= PORT CONFIGURATION =============
  
  // Trading WS ports (MT4/MT5 connections)
  const tradingPortsRaw = (process.env.PORT_SERVER && process.env.PORT_SERVER.trim()) || '8001,8002';
  const tradingPorts = tradingPortsRaw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 65536);

  // Web WS port (Client connections)
  const webPort_symbol_brokers = process.env.PORT_WEB_SYMBOL_BROKERS || '4000';

  const webPort_broker_info = process.env.PORT_WEB_BROKER_INFO || '4001';

  const webPort_symbols_info = process.env.PORT_WEB_SYMBOLS_INFO || '4002';

  const webPort_Analysis = process.env.PORT_WEB_ANALYSIS || '4003';

  // Workers per port
  const cpuPerWs = Math.min(5, Math.max(1, parseInt(process.env.CPU_PER_WS || '1', 10)));
  
  // Paths
  const wsPath = process.env.WS_PATH || '/connect';

  if (tradingPorts.length === 0) {
    console.error(`${process.env.ICON_ERROR_LOG || '❌'} Không có PORTS hợp lệ. Thêm PORT_SERVER=8001,8002 vào .env`);
    process.exit(1);
  }

  // ============= MASTER PROCESS =============
  if (cluster.isPrimary) {
    log(
      colors.green, 
      `${process.env.ICON_ACCESS_LOG || '✅'} Master ${process.pid}`,
      colors.cyan,
      ` Trading ports: ${tradingPorts.join(', ')} | Workers/port: ${cpuPerWs}`
    );

    (async () => {
      try {
        // Setup database nếu cần
        if (process.env.AUTO_SETUP_DB === 'true') {
          log(colors.green, '🔄 Running database setup...', colors.reset, '');
          await setupDatabase();
          log(colors.green, '✅ Database ready!', colors.reset, '');
        }

        // ✅ FIX 1: Fork workers cho TRADING ports
        // log(colors.blue, '🔄 Forking trading workers...', colors.reset, '');
        for (const port of tradingPorts) {
          for (let i = 0; i < cpuPerWs; i++) {
            cluster.fork({ 
              ROLE: 'WS_TRADING',
              PORT: String(port), 
              WS_PATH: wsPath,
              WORKER_ID: `trading-${port}-${i}`
            });
            log(colors.cyan, `✅ Trading worker: port ${port} #${i + 1}`);
          }
        }

        // ✅ FIX 2: Fork CHỈ 1 worker cho WEB port
        // log(colors.blue, '🔄 Forking web worker...', colors.reset, '');

        //WS Lấy thông tin của 1 symbol của tất cả các brokers
        cluster.fork({ 
          ROLE: 'WS_SYMBOL_BROKERS',
          PORT: String(webPort_symbol_brokers),
          WORKER_ID: 'web-symbol-brokers'
        });

        // log(colors.blue, '🔄 Forking web worker...', colors.reset, '');
        //WS Lấy thông tin tất cả các brokers
        cluster.fork({ 
          ROLE: 'WS_WEB_BROKERS_INFO',
          PORT: String(webPort_broker_info),
          WORKER_ID: 'web-brokers-info'
        });
        //WS Lấy thông tin tất cả các symbols của 1 brokers
        cluster.fork({ 
          ROLE: 'WS_WEB_SYMBOLS_INFO',
          PORT: String(webPort_symbols_info),
          WORKER_ID: 'web-symbols-info'
        });
        
        //WS Lấy thông tin Kèo Đang Luu trong MongoDB
        cluster.fork({ 
          ROLE: 'WS_WEB_ANALYSIS',
          PORT: String(webPort_Analysis),
          WORKER_ID: 'web-analysis'
        });

        log(colors.cyan, `✅ Web worker: port ${webPort_symbol_brokers}`, colors.reset, '');

        // ✅ FIX 3: Fork JOB workers
        cluster.fork({ 
              ROLE: 'JOB',
              JOB_NAME: process.env.JOB_NAME || 'default',
              WORKER_ID: `job`
            });

        cluster.fork({ 
              ROLE: 'JOB_SAVE_ANALYSIS',
              JOB_NAME: process.env.JOB_SAVE_ANALYSIS_NAME || 'JOB_SAVE_ANALYSIS_NAME',
              WORKER_ID: `job-save-analysis`
        });
        // const jobWorkers = Math.min(8, Math.max(0, parseInt(process.env.JOB_WORKERS || '1', 10)));
        // if (jobWorkers > 0) {
        //   log(colors.blue, '🔄 Forking', colors.reset, ' job workers...');
        //   for (let i = 0; i < jobWorkers; i++) {
        //     cluster.fork({ 
        //       ROLE: 'JOB',
        //       JOB_NAME: process.env.JOB_NAME || 'default',
        //       WORKER_ID: `job-${i}`
        //     });
        //     log(colors.cyan, `✅ Job worker #${i + 1}`, colors.reset, '');
        //   }
        // }

        log(colors.green, 'Cluster', colors.cyan, '✅ All workers forked successfully!');

      } catch (error) {
        log(colors.red, `❌ Master init error:`, colors.reset, error.message);
        console.error(error);
        process.exit(1);
      }
    })();

    // Restart worker nếu die
    cluster.on('exit', (worker) => {
      const env = worker.process.env || {};
      const workerId = env.WORKER_ID || 'unknown';
      const role = env.ROLE || 'unknown';
      
      log(
        colors.yellow, 
        `⚠️  Worker died: ${workerId}`,
        colors.cyan,
        `Role: ${role} | Port: ${env.PORT || 'N/A'}`
      );
      
      // Restart với cùng config
      log(colors.blue, `🔄 Restarting worker: ${workerId}`);
      cluster.fork(env);
    });

  } else {
    // ============= WORKER PROCESS =============
    
    (async () => {
      try {
        const role = process.env.ROLE || 'WS_TRADING';
        const workerId = process.env.WORKER_ID || 'unknown';

        // Connect MongoDB
        await connectMongoDB();
        log(colors.green, `✅ [${workerId}] MongoDB connected`, colors.cyan, `Role: ${role}`);

        // Graceful shutdown
        const shutdown = async (signal) => {
          log(colors.yellow, `⚠️  [${workerId}] Received ${signal}, closing...`);
          try {
            await disconnectMongoDB();
            log(colors.green, `✅ [${workerId}] MongoDB disconnected`);
          } catch (error) {
            log(colors.red, `❌ [${workerId}] Disconnect error:`, error.message);
          }
          process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // ============= START WORKER BY ROLE =============

        if (role === 'WS_TRADING' || role === 'WS_SYMBOL_BROKERS' || role === 'WS_WEB_BROKERS_INFO' || role === 'WS_WEB_SYMBOLS_INFO' || role === 'WS_WEB_ANALYSIS') {
          // WebSocket Worker (Trading hoặc Web)
          const port = parseInt(process.env.PORT || '0', 10);
          if (!Number.isFinite(port)) {
            log(colors.red, `❌ [${workerId}] Invalid PORT:`, process.env.PORT);
            process.exit(1);
          }

          const mainTs = path.resolve(__dirname, 'src', 'main.ts');
          if (!fs.existsSync(mainTs)) {
            log(colors.red, `❌ [${workerId}] File not found:`, mainTs);
            process.exit(1);
          }

          log(
            colors.blue, 
            `[${workerId}] Starting`,
            colors.cyan,
            `Port: ${port} | Role: ${role}`
          );
          
          process.env.TS_NODE_TRANSPILE_ONLY = 'true';
          
          try {
            require('ts-node/register/transpile-only');
          } catch (e) {
            log(colors.red, `❌ [${workerId}] Cannot load ts-node. Install: npm i -D ts-node typescript`);
            throw e;
          }
          
          try {
            require(mainTs);
          } catch (e) {
            log(colors.red, `❌ [${workerId}] Error loading main.ts:`, e.message);
            throw e;
          }

        } else if (role === 'JOB') {
          // Job Worker
          const jobEntry = path.resolve(__dirname, 'src', 'module', 'jobs', 'job.main.ts');
          if (!fs.existsSync(jobEntry)) {
            log(colors.red, `❌ [${workerId}] Job entry not found:`, jobEntry);
            process.exit(1);
          }

          log(
            colors.magenta, 
            `[${workerId}] Starting JOB`,
            colors.cyan,
            `Name: ${process.env.JOB_NAME || 'default'}`
          );

          process.env.TS_NODE_TRANSPILE_ONLY = 'true';
          require('ts-node/register/transpile-only');
          require(jobEntry);

        }else if (role === 'JOB_SAVE_ANALYSIS') {
          // Job Worker
          const jobEntry = path.resolve(__dirname, 'src', 'module', 'jobs', 'job.save.analysis.ts');
          if (!fs.existsSync(jobEntry)) {
            log(colors.red, `❌ [${workerId}] Job entry not found:`, jobEntry);
            process.exit(1);
          }

          log(
            colors.magenta, 
            `[${workerId}] Starting JOB SAVE ANALYSIS`,
            colors.cyan,
            `Name: ${process.env.JOB_SAVE_ANALYSIS_NAME || 'JOB_SAVE_ANALYSIS_NAME'}`
          );

          process.env.TS_NODE_TRANSPILE_ONLY = 'true';
          require('ts-node/register/transpile-only');
          require(jobEntry);

        } else {
          log(colors.red, `❌ [${workerId}] Invalid ROLE:`, role);
          process.exit(1);
        }

      } catch (error) {
        log(colors.red, `❌ [Worker ${process.pid}] Init error:`, error.message);
        console.error(error);
        process.exit(1);
      }
    })();
  }

} catch (error) {
  console.error(`${process.env.ICON_ERROR_LOG || '❌'} Fatal error:`, error);
  process.exit(1);  
}