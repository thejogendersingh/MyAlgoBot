import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';

dotenv.config();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const METAAPI_TOKEN = process.env.METAAPI_TOKEN;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;
const PORT = process.env.PORT || 3001;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ASSETS_TO_SCAN = ['OANDA:EUR_USD', 'OANDA:GBP_USD', 'OANDA:XAU_USD', 'BINANCE:BTCUSDT'];

// --- SYSTEM STATE ---
const state = {
  activeAsset: 'OANDA:XAU_USD',
  visualData: [],
  currentPrice: 0,
  isTradingEnabled: false,
  brokerStatus: 'DISCONNECTED',
  portfolio: { balance: 100, realizedPnL: 0, unrealizedPnL: 0 },
  openPositions: [],
  systemLogs: [],
  metrics: { winRate: 0, totalTrades: 0, winningTrades: 0, exposure: 0, currentRSI: null, currentSMA: null, currentMACD: null, currentSignal: null },
  lastMinute: 0,
  lastTradeTime: 0
};

// Multi-Asset buffers
const multiAssetBuffers = {};
const assetLastMinute = {};
ASSETS_TO_SCAN.forEach(a => {
  multiAssetBuffers[a] = [];
  assetLastMinute[a] = 0;
});

// News Filter State
let isNewsPause = false;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.send('AlgoBot Backend is Running 24/7'));
app.get('/ping', (req, res) => res.status(200).send('AlgoBot Backend is Active'));

const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, '../dist')));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

const server = http.createServer(app);
server.listen(PORT, () => console.log(`[SYS] Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });

// --- SYSTEM STATE PERSISTENCE ---
const STATE_FILE_PATH = path.join(process.cwd(), 'bot_state.json');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const savedData = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(savedData);
      state.portfolio = parsed.portfolio || state.portfolio;
      state.metrics = parsed.metrics || state.metrics;
      console.log('[SYS] Previous bot state loaded from bot_state.json');
    }
  } catch (err) {
    console.error('Failed to load bot state:', err);
  }
}

function saveState() {
  try {
    const dataToSave = {
      portfolio: state.portfolio,
      metrics: state.metrics
    };
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(dataToSave, null, 2));
  } catch (err) {
    console.error('Failed to save bot state:', err);
  }
}

// Load previous state on startup
loadState();

// --- HELPERS ---
function generateTimestamp(date = new Date()) {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function addLog(type, msg) {
  const newLog = { id: Date.now() + Math.random(), time: generateTimestamp(), type, msg };
  state.systemLogs.push(newLog);
  if (state.systemLogs.length > 100) state.systemLogs.shift();
  broadcastState();
}

async function sendTelegramAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' })
    });
  } catch (err) {
    console.error('Failed to send Telegram alert:', err);
  }
}

function broadcastState() {
  const payload = JSON.stringify({ type: 'STATE_UPDATE', payload: state });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function calculateIndicators(data) {
  if (data.length < 50) return { rsi: null, ema50: null, macdLine: null, signalLine: null, prevMacd: null, prevSignal: null };

  const rsiPeriod = 14;
  let gains = 0, losses = 0;
  for (let i = data.length - rsiPeriod; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let rs = (losses / rsiPeriod) === 0 ? 100 : (gains / rsiPeriod) / (losses / rsiPeriod);
  let rsi = 100 - (100 / (1 + rs));

  const getEma = (period) => {
    let sum = 0;
    for(let i=0; i<period; i++) sum += data[i].close;
    let ema = sum / period;
    const k = 2 / (period + 1);
    const series = [];
    for(let i=period; i<data.length; i++) {
      ema = (data[i].close - ema) * k + ema;
      series.push(ema);
    }
    return series;
  };
  
  const ema50Series = getEma(50);
  const ema50 = ema50Series[ema50Series.length - 1];

  const ema12 = getEma(12);
  const ema26 = getEma(26);
  const macdSeries = [];
  const offset = ema12.length - ema26.length;
  for(let i=0; i<ema26.length; i++) macdSeries.push(ema12[i + offset] - ema26[i]);
  
  let signalSum = 0;
  for(let i=0; i<9; i++) signalSum += macdSeries[i];
  let signalEma = signalSum / 9;
  const signalSeries = [];
  for(let i=9; i<macdSeries.length; i++) {
     signalEma = (macdSeries[i] - signalEma) * (2 / 10) + signalEma;
     signalSeries.push(signalEma);
  }

  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = signalSeries[signalSeries.length - 1];
  const prevMacd = macdSeries[macdSeries.length - 2];
  const prevSignal = signalSeries[signalSeries.length - 2];

  return { rsi, ema50, macdLine, signalLine, prevMacd, prevSignal };
}

// --- NEWS FILTER ---
function checkHighImpactNews() {
  // In a real production environment, you would fetch from ForexFactory API here.
  // We simulate checking the calendar every minute.
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  
  // Example: Block trading at 12:30 UTC (US NFP / CPI typical release time)
  if (hour === 12 && minute >= 15 && minute <= 45) {
    if (!isNewsPause) {
      isNewsPause = true;
      addLog('info', '🚨 High Impact News Approaching (US Session). Auto-trading paused to protect capital.');
      sendTelegramAlert('🚨 *High Impact News Approaching*\nAuto-trading PAUSED to protect capital.');
    }
  } else {
    if (isNewsPause) {
      isNewsPause = false;
      addLog('info', '✅ News volatility window passed. Auto-trading resumed.');
      sendTelegramAlert('✅ *News volatility window passed*\nAuto-trading RESUMED.');
    }
  }
}
setInterval(checkHighImpactNews, 60000); // Check every minute

// --- METAAPI BROKER ---
const getMetaTraderSymbol = (symbol) => {
  const map = {
    'OANDA:EUR_USD': 'EURUSDm',
    'OANDA:GBP_USD': 'GBPUSDm',
    'OANDA:AUD_USD': 'AUDUSDm',
    'OANDA:USD_JPY': 'USDJPYm',
    'OANDA:XAU_USD': 'XAUUSDm',
  };
  return map[symbol] || 'EURUSDm';
};

async function verifyBrokerConnection() {
  if (!METAAPI_TOKEN || METAAPI_TOKEN === 'YOUR_METAAPI_TOKEN_HERE') {
    state.brokerStatus = 'DISCONNECTED';
    addLog('info', 'MetaApi token missing. Running in Backend Simulation Mode.');
    return;
  }
  try {
    state.brokerStatus = 'VERIFYING';
    broadcastState();
    const res = await fetch(`https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}`, {
      headers: { 'auth-token': METAAPI_TOKEN }
    });
    if (res.ok) {
      state.brokerStatus = 'CONNECTED';
      addLog('info', 'Exness MT5 Account Verified and Ready.');
    } else {
      state.brokerStatus = 'DISCONNECTED';
    }
  } catch(err) {
    state.brokerStatus = 'DISCONNECTED';
  }
}

async function placeRealTrade(side, volume, symbol) {
  if (state.brokerStatus !== 'CONNECTED') return;
  const mtSymbol = getMetaTraderSymbol(symbol);
  const actionType = side === 'LONG' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
  try {
    await fetch(`https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'auth-token': METAAPI_TOKEN },
      body: JSON.stringify({ actionType, symbol: mtSymbol, volume })
    });
    addLog('trade', `REAL BROKER: Executed on MT5!`);
  } catch (error) {}
}

const CSV_FILE_PATH = path.join(process.cwd(), 'trade_history.csv');

function logTradeToCSV(tradeData) {
  try {
    const headers = "Entry Time,Exit Time,Asset,Side,Entry Price,Exit Price,Size,PnL,Reason\n";
    const fileExists = fs.existsSync(CSV_FILE_PATH);
    if (!fileExists) fs.writeFileSync(CSV_FILE_PATH, headers);
    const row = `${tradeData.entryTime},${tradeData.exitTime},${tradeData.asset},${tradeData.side},${tradeData.entry.toFixed(5)},${tradeData.exitPrice.toFixed(5)},${tradeData.size.toFixed(4)},${tradeData.pnl.toFixed(2)},"${tradeData.reason}"\n`;
    fs.appendFileSync(CSV_FILE_PATH, row);
  } catch (err) {}
}

// --- TRADING LOGIC ---
function closePosition(posId, price, reason) {
  const posIndex = state.openPositions.findIndex(p => p.id === posId);
  if (posIndex === -1) return;
  const pos = state.openPositions[posIndex];
  
  const dynamicSpread = price * 0.0001; 
  const exitPrice = pos.side === 'LONG' ? price - (dynamicSpread / 2) : price + (dynamicSpread / 2);
  const pnl = pos.side === 'LONG' ? (exitPrice - pos.entry) * pos.size : (pos.entry - exitPrice) * pos.size;
  
  state.portfolio.balance += pnl;
  state.portfolio.realizedPnL += pnl;
  if (pnl > 0) state.metrics.winningTrades++;
  state.metrics.totalTrades++;

  addLog('trade', `${reason}: Closed ${pos.side} order #${pos.id} at ${exitPrice.toFixed(5)}. PnL: $${pnl.toFixed(2)}`);

  const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
  sendTelegramAlert(`${pnlEmoji} *TRADE CLOSED*\n\n*Asset:* ${pos.asset}\n*Side:* ${pos.side}\n*Reason:* ${reason}\n*PnL:* $${pnl.toFixed(2)}\n*Balance:* $${state.portfolio.balance.toFixed(2)}`);

  logTradeToCSV({
    entryTime: pos.entryTime || 'Unknown',
    exitTime: new Date().toLocaleString(),
    asset: pos.asset,
    side: pos.side,
    entry: pos.entry,
    exitPrice,
    size: pos.size,
    pnl,
    reason
  });

  state.openPositions = state.openPositions.filter(p => p.id !== posId);
  state.metrics.winRate = state.metrics.totalTrades > 0 ? (state.metrics.winningTrades / state.metrics.totalTrades) * 100 : 0;
  state.metrics.exposure = state.openPositions.reduce((acc, p) => acc + (p.size * p.entry), 0);
  broadcastState();
  saveState(); // Save state persistently on trade close
}

setInterval(() => {
  broadcastState();
}, 1000);

function executeTrade(side, price, reason, symbol) {
  if (!state.isTradingEnabled || isNewsPause) return;
  
  const assetPositions = state.openPositions.filter(p => p.asset === symbol);
  if (assetPositions.length >= 1) return; // Only 1 active trade allowed per pair

  const dynamicSpread = price * 0.0001;
  const entryPrice = side === 'LONG' ? price + (dynamicSpread / 2) : price - (dynamicSpread / 2);
  
  // Single Massive Trade: Risking 75% of account balance
  const positionCapital = state.portfolio.balance * 0.75; 
  
  // Leverage pair logic
  let LEVERAGE = 500;
  if (symbol.includes('BTC')) LEVERAGE = 50; // Crypto leverage
  if (symbol.includes('XAU')) LEVERAGE = 500; // Gold leverage
  if (symbol.includes('EUR') || symbol.includes('GBP')) LEVERAGE = 500; // Forex leverage
  
  const size = (positionCapital * LEVERAGE) / entryPrice;
  // Convert units to MT5 standard lots approximately (100,000 units = 1 lot)
  let mt5Volume = parseFloat((size / 100000).toFixed(2));
  if (mt5Volume < 0.01) mt5Volume = 0.01;

  const newPosition = { 
    id: Math.floor(Math.random() * 100000), 
    asset: symbol, 
    side, 
    entry: entryPrice, 
    size, 
    current: price, 
    pnl: 0,
    pnlPct: 0,
    highestPnL: 0,
    entryTime: new Date().toLocaleString()
  };
  state.openPositions.push(newPosition);
  state.metrics.exposure = state.openPositions.reduce((acc, pos) => acc + (pos.size * pos.entry / LEVERAGE), 0);

  addLog('trade', `Opened Massive Order for ${side}: ${mt5Volume.toFixed(2)} Lots`);
  sendTelegramAlert(`🎯 *SINGLE MASSIVE ENTRY*\n\n*Asset:* ${symbol}\n*Side:* ${side}\n*Lots:* ${mt5Volume}\n*Entry:* ${entryPrice.toFixed(5)}`);
  
  broadcastState();

  placeRealTrade(side, mt5Volume, symbol);
}

function checkRiskManagement(price, symbol) {
  const assetPositions = state.openPositions.filter(p => p.asset === symbol);
  if (assetPositions.length === 0) return;

  // Calculate total PnL of the entire cluster
  const totalUnrealizedPnL = assetPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);

  // ZERO HERO GLOBAL TAKE PROFIT: Close all if combined profit >= $4.00
  if (totalUnrealizedPnL >= 4.00) {
    const positionsToClose = [...assetPositions];
    positionsToClose.forEach(pos => closePosition(pos.id, price, 'Aggressive Global TP Hit (+$4.00)'));
  }
}

function updatePositionsPnL(price, symbol) {
  let totalUnrealized = 0;
  state.openPositions = state.openPositions.map(pos => {
    if (pos.asset === symbol) {
      const pnl = pos.side === 'LONG' ? (price - pos.entry) * pos.size : (pos.entry - price) * pos.size;
      const pnlPct = (pnl / (pos.entry * pos.size)) * 100;
      totalUnrealized += pnl;
      return { ...pos, current: price, pnl, pnlPct };
    } else {
      totalUnrealized += pos.pnl;
      return pos;
    }
  });
  state.portfolio.unrealizedPnL = totalUnrealized;
}

function evaluateStrategy(data, price, symbol) {
  const { rsi, ema50, macdLine, signalLine, prevMacd, prevSignal } = calculateIndicators(data);
  if (rsi === null || ema50 === null || macdLine === null) return;

  // Only update UI metrics for the active asset being viewed on dashboard
  if (symbol === state.activeAsset) {
    state.metrics.currentRSI = rsi;
    state.metrics.currentSMA = ema50; 
    state.metrics.currentMACD = macdLine;
    state.metrics.currentSignal = signalLine;
  }

  // SINGLE PAIR TRADING FEATURE: Only trade one pair at a time
  const activeAssets = [...new Set(state.openPositions.map(p => p.asset))];
  if (activeAssets.length > 0 && !activeAssets.includes(symbol)) {
    return; // Ignore signals for this pair because another pair is currently active
  }

  const assetPositions = state.openPositions.filter(p => p.asset === symbol);
  if (assetPositions.length >= 1) return; // Only 1 massive trade allowed per asset

  if (rsi < 20) {
    executeTrade('LONG', price, 'Extreme Oversold (RSI < 20)', symbol);
  } else if (rsi > 80) {
    executeTrade('SHORT', price, 'Extreme Overbought (RSI > 80)', symbol);
  }
}

// --- DATA FEED (FINNHUB) ---
let wsTrade = null;

async function fetchHistoricalData(symbol) {
  const binanceProxy = symbol.includes('BINANCE') 
    ? symbol.replace('BINANCE:', '') 
    : (symbol === 'OANDA:XAU_USD' ? 'PAXGUSDT' : 
       symbol === 'OANDA:EUR_USD' ? 'EURUSDT' :
       symbol === 'OANDA:GBP_USD' ? 'GBPUSDT' :
       symbol === 'OANDA:AUD_USD' ? 'AUDUSDT' :
       'EURUSDT'); 
  
  try {
    const res = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${binanceProxy}&interval=1m&limit=100`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(k => ({
      time: generateTimestamp(new Date(k[0])),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4])
    }));
  } catch (err) {
    return [];
  }
}

let isWsConnected = false;
let lastRestPoll = 0;

async function setupDataFeed() {
  addLog('info', `Server initializing Multi-Asset Scanner for ${ASSETS_TO_SCAN.length} pairs...`);
  
  // Pre-load historical data for all tracked assets
  for (const asset of ASSETS_TO_SCAN) {
    multiAssetBuffers[asset] = await fetchHistoricalData(asset);
    if (multiAssetBuffers[asset].length > 0) {
      assetLastMinute[asset] = Math.floor(Date.now() / 60000);
      const latestPrice = multiAssetBuffers[asset][multiAssetBuffers[asset].length - 1].close;
      if (asset === state.activeAsset) {
        state.visualData = multiAssetBuffers[asset];
        state.currentPrice = latestPrice;
        state.lastMinute = assetLastMinute[asset];
      }
      evaluateStrategy(multiAssetBuffers[asset], latestPrice, asset);
    }
  }

  broadcastState();

  connectFinnhubWs();
}

function connectFinnhubWs() {
  if (wsTrade) wsTrade.close();
  wsTrade = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
  
  wsTrade.on('open', () => {
    isWsConnected = true;
    addLog('info', `Finnhub Multi-Stream Connected. Scanning: ${ASSETS_TO_SCAN.join(', ')}`);
    ASSETS_TO_SCAN.forEach(asset => {
      wsTrade.send(JSON.stringify({'type':'subscribe', 'symbol': asset}));
    });
  });

  wsTrade.on('message', (dataStr) => {
    const message = JSON.parse(dataStr);
    if (message.type === 'trade') {
      const trade = message.data[message.data.length - 1]; 
      const newPrice = trade.p;
      const symbol = trade.s;
      
      if (!ASSETS_TO_SCAN.includes(symbol)) return;

      updatePositionsPnL(newPrice, symbol);
      checkRiskManagement(newPrice, symbol);

      const nowMinute = Math.floor(Date.now() / 60000);
      const buffer = multiAssetBuffers[symbol];

      if (assetLastMinute[symbol] !== nowMinute) {
        buffer.push({ time: generateTimestamp(), close: newPrice });
        if (buffer.length > 100) buffer.shift();
        assetLastMinute[symbol] = nowMinute;
      } else {
        if(buffer.length > 0) buffer[buffer.length - 1].close = newPrice;
      }
      
      evaluateStrategy(buffer, newPrice, symbol);

      if (symbol === state.activeAsset) {
        state.currentPrice = newPrice;
        state.visualData = [...buffer];
        state.lastMinute = assetLastMinute[symbol];
      }

      broadcastState();
    }
  });

  wsTrade.on('error', (err) => {
    addLog('error', `Finnhub WebSocket Error: ${err.message || JSON.stringify(err)}`);
    console.error('Finnhub WS Error:', err);
  });

  wsTrade.on('close', () => {
    isWsConnected = false;
    addLog('error', 'Finnhub WebSocket Disconnected. Reconnecting in 5s...');
    setTimeout(connectFinnhubWs, 5000);
  });
}

// --- FRONTEND WS COMMUNICATION ---
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'STATE_UPDATE', payload: state }));

  ws.on('message', (message) => {
    try {
      const action = JSON.parse(message);
      if (action.type === 'TOGGLE_TRADING') {
        state.isTradingEnabled = !state.isTradingEnabled;
        addLog('info', `Bot auto-trading ${state.isTradingEnabled ? 'STARTED' : 'PAUSED'} remotely.`);
        broadcastState();
      } else if (action.type === 'CLOSE_ALL') {
        if (state.openPositions.length === 0) return;
        const positions = [...state.openPositions];
        positions.forEach(pos => closePosition(pos.id, pos.current, 'Manual Close from Client'));
      } else if (action.type === 'SWITCH_ASSET') {
        const newAsset = action.payload;
        if (state.activeAsset !== newAsset) {
          state.activeAsset = newAsset;
          // When switching UI asset, immediately update UI with existing multi-asset buffer
          if (multiAssetBuffers[newAsset]) {
             state.visualData = multiAssetBuffers[newAsset];
             state.currentPrice = state.visualData.length > 0 ? state.visualData[state.visualData.length-1].close : 0;
             broadcastState();
          }
        }
      }
    } catch (e) {}
  });
});

let lastTelegramUpdateId = 0;
async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastTelegramUpdateId + 1}&timeout=30`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastTelegramUpdateId = update.update_id;
          if (update.message && update.message.text && update.message.chat.id.toString() === String(TELEGRAM_CHAT_ID)) {
            const text = update.message.text.trim();
            if (text === '/status') {
              const openPosText = state.openPositions.length === 0 
                ? 'No open trades.' 
                : state.openPositions.map(p => `- ${p.side} ${p.asset} @ ${p.entry.toFixed(5)} (PnL: $${(p.pnl || 0).toFixed(2)})`).join('\n');
              const msg = `📊 *BOT STATUS*\n\n*Balance:* $${state.portfolio.balance.toFixed(2)}\n*Realized PnL:* $${state.portfolio.realizedPnL.toFixed(2)}\n*Win Rate:* ${state.metrics.winRate.toFixed(1)}%\n\n*Open Trades:*\n${openPosText}`;
              sendTelegramAlert(msg);
            }
          }
        }
      }
    }
  } catch (err) {}
  setTimeout(pollTelegramUpdates, 3000);
}

verifyBrokerConnection().then(() => {
  setupDataFeed();
  pollTelegramUpdates();
});
