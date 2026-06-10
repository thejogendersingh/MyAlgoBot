import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const METAAPI_TOKEN = process.env.METAAPI_TOKEN;
const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;
const PORT = process.env.PORT || 3001;

const STOP_LOSS_PCT = 0.0015; // 0.15% 
const TAKE_PROFIT_PCT = 0.0030; // 0.30% 
const INITIAL_PORTFOLIO_VALUE = 100;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.send('AlgoBot Backend is Running 24/7');
});

// Ping route to keep Render server awake 24/7
app.get('/ping', (req, res) => {
  res.status(200).send('AlgoBot Backend is Active');
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[SYS] Server running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

// --- SYSTEM STATE ---
const state = {
  activeAsset: 'OANDA:XAU_USD',
  visualData: [],
  currentPrice: 0,
  isTradingEnabled: false,
  brokerStatus: 'DISCONNECTED',
  portfolio: {
    balance: INITIAL_PORTFOLIO_VALUE,
    realizedPnL: 0,
    unrealizedPnL: 0
  },
  openPositions: [],
  systemLogs: [],
  metrics: {
    winRate: 0,
    totalTrades: 0,
    winningTrades: 0,
    exposure: 0,
    currentRSI: 50,
    currentSMA: 0
  },
  lastMinute: 0
};

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

function broadcastState() {
  const payload = JSON.stringify({ type: 'STATE_UPDATE', payload: state });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function calculateRSIAndSMA(data, rsiPeriod = 14, smaPeriod = 20) {
  if (data.length < Math.max(rsiPeriod, smaPeriod)) return { rsi: null, sma: null };
  const smaSlice = data.slice(-smaPeriod);
  const sma = smaSlice.reduce((acc, curr) => acc + curr.close, 0) / smaPeriod;

  let gains = 0, losses = 0;
  for (let i = data.length - rsiPeriod; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / rsiPeriod;
  let avgLoss = losses / rsiPeriod;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));

  return { rsi, sma };
}

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
      addLog('info', 'Exness MT5 Account Verified and Ready on Server.');
    } else {
      state.brokerStatus = 'DISCONNECTED';
      addLog('error', 'Invalid MetaApi Token or Account ID.');
    }
  } catch(err) {
    state.brokerStatus = 'DISCONNECTED';
    addLog('error', 'Failed to reach MetaApi server.');
  }
}

async function placeRealTrade(side, volume, symbol) {
  if (state.brokerStatus !== 'CONNECTED') {
    addLog('info', 'MetaApi integration offline, simulating trade only.');
    return;
  }
  const mtSymbol = getMetaTraderSymbol(symbol);
  const actionType = side === 'LONG' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
  try {
    const response = await fetch(`https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'auth-token': METAAPI_TOKEN },
      body: JSON.stringify({ actionType, symbol: mtSymbol, volume })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    addLog('trade', `REAL BROKER SUCCESS: Order ID ${data.orderId} executed on Exness MT5!`);
  } catch (error) {
    addLog('error', `REAL BROKER ERROR: Failed to execute trade. (${error.message})`);
  }
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

  state.openPositions = state.openPositions.filter(p => p.id !== posId);
  state.metrics.winRate = state.metrics.totalTrades > 0 ? (state.metrics.winningTrades / state.metrics.totalTrades) * 100 : 0;
  state.metrics.exposure = state.openPositions.reduce((acc, p) => acc + (p.size * p.entry), 0);
  
  broadcastState();
}

function executeTrade(side, price) {
  if (!state.isTradingEnabled) return;
  if (state.openPositions.some(p => p.side === side && p.asset === state.activeAsset)) return;

  // Close opposing
  [...state.openPositions].forEach(pos => {
    if (pos.side !== side && pos.asset === state.activeAsset) closePosition(pos.id, price, 'Signal Reversal');
  });

  const dynamicSpread = price * 0.0001;
  const entryPrice = side === 'LONG' ? price + (dynamicSpread / 2) : price - (dynamicSpread / 2);
  const positionCapital = state.portfolio.balance * 0.10;
  const size = positionCapital / entryPrice;

  const newPosition = { id: Math.floor(Math.random() * 100000), asset: state.activeAsset, side, entry: entryPrice, size, current: price, pnl: 0, pnlPct: 0 };
  state.openPositions.push(newPosition);
  state.metrics.exposure = state.openPositions.reduce((acc, pos) => acc + (pos.size * pos.entry), 0);

  addLog('trade', `Order #${newPosition.id} filled: ${side} ${size.toFixed(4)} Units @ ${entryPrice.toFixed(5)}`);
  broadcastState();
  placeRealTrade(side, 0.01, state.activeAsset);
}

function checkRiskManagement(price) {
  [...state.openPositions].forEach(pos => {
    if(pos.asset !== state.activeAsset) return;
    const pnlPct = pos.side === 'LONG' ? (price - pos.entry) / pos.entry : (pos.entry - price) / pos.entry;
    if (pnlPct <= -STOP_LOSS_PCT) closePosition(pos.id, price, 'Stop Loss Hit');
    else if (pnlPct >= TAKE_PROFIT_PCT) closePosition(pos.id, price, 'Take Profit Hit');
  });
}

function updatePositionsPnL(price) {
  let totalUnrealized = 0;
  state.openPositions = state.openPositions.map(pos => {
    if (pos.asset !== state.activeAsset) {
      totalUnrealized += pos.pnl;
      return pos;
    }
    const pnl = pos.side === 'LONG' ? (price - pos.entry) * pos.size : (pos.entry - price) * pos.size;
    const pnlPct = (pnl / (pos.entry * pos.size)) * 100;
    totalUnrealized += pnl;
    return { ...pos, current: price, pnl, pnlPct };
  });
  state.portfolio.unrealizedPnL = totalUnrealized;
}

function evaluateStrategy(data, price) {
  const { rsi, sma } = calculateRSIAndSMA(data);
  if (!rsi || !sma) return;

  state.metrics.currentRSI = rsi;
  state.metrics.currentSMA = sma;

  if (rsi < 30 && price > sma) {
    if (state.isTradingEnabled) {
      addLog('signal', `Oversold (RSI: ${rsi.toFixed(1)}) & price > SMA. Signal: LONG`);
      executeTrade('LONG', price);
    }
  } else if (rsi > 70 && price < sma) {
    if (state.isTradingEnabled) {
      addLog('signal', `Overbought (RSI: ${rsi.toFixed(1)}) & price < SMA. Signal: SHORT`);
      executeTrade('SHORT', price);
    }
  }
}

// --- DATA FEED (FINNHUB) ---
let wsTrade = null;

async function setupDataFeed() {
  addLog('info', `Server initializing feed for ${state.activeAsset}...`);
  const binanceProxy = state.activeAsset === 'OANDA:XAU_USD' ? 'PAXGUSDT' : 'EURUSDT';
  
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceProxy}&interval=1m&limit=100`);
    const data = await res.json();
    state.visualData = data.map(k => ({
      time: generateTimestamp(new Date(k[0])),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4])
    }));
    state.currentPrice = state.visualData[state.visualData.length - 1].close;
    state.lastMinute = Math.floor(Date.now() / 60000);
    addLog('info', `Fetched ${state.visualData.length} historical candles.`);
    evaluateStrategy(state.visualData, state.currentPrice);
    broadcastState();

    if (wsTrade) wsTrade.close();
    wsTrade = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);
    
    wsTrade.on('open', () => {
      addLog('info', `Finnhub Live Stream Connected on Backend.`);
      wsTrade.send(JSON.stringify({'type':'subscribe', 'symbol': state.activeAsset}));
    });

    wsTrade.on('message', (dataStr) => {
      const message = JSON.parse(dataStr);
      if (message.type === 'trade') {
        const trade = message.data[message.data.length - 1]; 
        const newPrice = trade.p;
        
        state.currentPrice = newPrice;
        updatePositionsPnL(newPrice);
        checkRiskManagement(newPrice);

        const nowMinute = Math.floor(Date.now() / 60000);
        if (state.lastMinute !== nowMinute) {
          state.visualData.push({ time: generateTimestamp(), close: newPrice });
          if (state.visualData.length > 100) state.visualData.shift();
          state.lastMinute = nowMinute;
        } else {
          if(state.visualData.length > 0) state.visualData[state.visualData.length - 1].close = newPrice;
        }
        
        evaluateStrategy(state.visualData, newPrice);
        broadcastState(); // Broadcast every tick to frontend
      }
    });

    wsTrade.on('error', () => {
       addLog('error', 'Finnhub WebSocket Error.');
    });

  } catch (err) {
    addLog('error', `Failed to fetch proxy history: ${err.message}`);
  }
}

// --- FRONTEND WS COMMUNICATION ---
wss.on('connection', (ws) => {
  console.log('[SYS] Frontend client connected.');
  // Send current state immediately
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
        positions.forEach(pos => closePosition(pos.id, state.currentPrice, 'Manual Close from Client'));
      } else if (action.type === 'SWITCH_ASSET') {
        const newAsset = action.payload;
        if (state.activeAsset !== newAsset) {
          state.activeAsset = newAsset;
          setupDataFeed(); // re-init feed
        }
      }
    } catch (e) {
      console.error(e);
    }
  });
});

// Init
verifyBrokerConnection().then(() => {
  setupDataFeed();
});
