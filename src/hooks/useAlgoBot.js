import { useState, useEffect, useRef } from 'react';

const SERVER_WS_URL = import.meta.env.VITE_WS_URL || (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host;

export function useAlgoBot() {
  const [serverActiveAsset, setServerActiveAsset] = useState('OANDA:XAU_USD');
  const [visualData, setVisualData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState('DISCONNECTED');
  
  const [portfolio, setPortfolio] = useState({ balance: 100, realizedPnL: 0, unrealizedPnL: 0 });
  const [openPositions, setOpenPositions] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [metrics, setMetrics] = useState({ winRate: 0, totalTrades: 0, winningTrades: 0, exposure: 0, currentRSI: null, currentSMA: null });

  const wsClientRef = useRef(null);

  useEffect(() => {
    let ws;
    let reconnectTimeout;

    const connect = () => {
      ws = new WebSocket(SERVER_WS_URL);
      wsClientRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to AlgoBot Backend Server');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE_UPDATE') {
            const s = msg.payload;
            setServerActiveAsset(s.activeAsset);
            setVisualData(s.visualData || []);
            setCurrentPrice(s.currentPrice || 0);
            setIsTradingEnabled(s.isTradingEnabled);
            setBrokerStatus(s.brokerStatus);
            setPortfolio(s.portfolio);
            setOpenPositions(s.openPositions || []);
            setSystemLogs(s.systemLogs || []);
            setMetrics(s.metrics);
          }
        } catch (err) {
          console.error('Error parsing backend WS message', err);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from backend. Retrying in 5s...');
        setBrokerStatus('DISCONNECTED');
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    const handleOnline = () => {
      console.log('Network is online. Forcing WS reconnect...');
      if (ws) ws.close(); // closing it will trigger onclose which will reconnect
    };

    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(reconnectTimeout);
      window.removeEventListener('online', handleOnline);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const switchAsset = (newAsset) => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN) {
      wsClientRef.current.send(JSON.stringify({ type: 'SWITCH_ASSET', payload: newAsset }));
    }
  };

  const toggleTrading = () => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN) {
      wsClientRef.current.send(JSON.stringify({ type: 'TOGGLE_TRADING' }));
    }
  };

  const closeAllPositions = () => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN) {
      wsClientRef.current.send(JSON.stringify({ type: 'CLOSE_ALL' }));
    }
  };

  const resetAccount = () => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN) {
      wsClientRef.current.send(JSON.stringify({ type: 'RESET_ACCOUNT' }));
    }
  };

  return {
    activeAsset: serverActiveAsset,
    visualData,
    currentPrice,
    portfolio,
    openPositions,
    systemLogs,
    metrics,
    isTradingEnabled,
    brokerStatus,
    toggleTrading,
    closeAllPositions,
    resetAccount,
    switchAsset
  };
}
