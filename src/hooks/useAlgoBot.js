import { useState, useEffect, useRef } from 'react';

const SERVER_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useAlgoBot(activeAsset = 'OANDA:XAU_USD') {
  const [visualData, setVisualData] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [isTradingEnabled, setIsTradingEnabled] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState('DISCONNECTED');
  
  const [portfolio, setPortfolio] = useState({ balance: 100, realizedPnL: 0, unrealizedPnL: 0 });
  const [openPositions, setOpenPositions] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [metrics, setMetrics] = useState({ winRate: 0, totalTrades: 0, winningTrades: 0, exposure: 0, currentRSI: 50, currentSMA: 0 });

  const wsClientRef = useRef(null);

  useEffect(() => {
    if (wsClientRef.current && wsClientRef.current.readyState === WebSocket.OPEN) {
      wsClientRef.current.send(JSON.stringify({ type: 'SWITCH_ASSET', payload: activeAsset }));
    }
  }, [activeAsset]);

  useEffect(() => {
    let ws = new WebSocket(SERVER_WS_URL);
    wsClientRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to AlgoBot Backend Server');
      ws.send(JSON.stringify({ type: 'SWITCH_ASSET', payload: activeAsset }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE_UPDATE') {
          const s = msg.payload;
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
      setTimeout(() => {
         // Auto-reconnect logic could go here
      }, 5000);
    };

    return () => {
      if (wsClientRef.current) wsClientRef.current.close();
    };
  }, []);

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

  return {
    visualData,
    currentPrice,
    portfolio,
    openPositions,
    systemLogs,
    metrics,
    isTradingEnabled,
    brokerStatus,
    toggleTrading,
    closeAllPositions
  };
}
