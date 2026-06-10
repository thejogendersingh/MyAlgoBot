import React, { useRef, useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Pause, Square, Activity, Terminal, BarChart2, ChevronDown } from 'lucide-react';
import { useAlgoBot } from './hooks/useAlgoBot';

export default function Dashboard() {
  const { activeAsset, visualData, currentPrice, portfolio, openPositions, systemLogs, metrics, isTradingEnabled, brokerStatus, toggleTrading, closeAllPositions, switchAsset } = useAlgoBot();
  const logsContainerRef = useRef(null);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [systemLogs]);

  const totalPortfolioValue = portfolio.balance + portfolio.unrealizedPnL;
  const todaysPnL = portfolio.realizedPnL + portfolio.unrealizedPnL;
  const pnlPct = (todaysPnL / 100) * 100; // Simulated relative to initial 100

  const getPairName = (symbol) => {
    const pairs = {
      'OANDA:EUR_USD': 'EUR/USD',
      'OANDA:GBP_USD': 'GBP/USD',
      'OANDA:AUD_USD': 'AUD/USD',
      'OANDA:USD_JPY': 'USD/JPY',
      'OANDA:XAU_USD': 'XAU/USD',
      'BINANCE:BTCUSDT': 'BTC/USDT',
      'BINANCE:ETHUSDT': 'ETH/USDT',
    };
    return pairs[symbol] || symbol;
  };

  const isCrypto = activeAsset.includes('BINANCE');
  const chartColor = isCrypto ? '#6366f1' : (activeAsset === 'OANDA:XAU_USD' ? '#d97706' : '#2563eb'); 

  return (
    <div className="bg-[#000000] text-zinc-400 font-sans p-2 sm:p-4 selection:bg-zinc-800 lg:h-screen lg:overflow-hidden">
      <div className="max-w-[1400px] mx-auto w-full lg:h-full flex flex-col gap-4">
        
        {/* TOP METRICS BAR - Institutional Style */}
        <header className="bg-[#09090b] border border-zinc-800/80 rounded-sm flex flex-col lg:flex-row justify-between items-stretch shadow-sm w-full min-w-0">
          <div className="flex flex-1 divide-x divide-zinc-800/80 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] w-full min-w-0">
            
            <div className="px-6 py-3 flex flex-col justify-center min-w-[180px]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Equity (USD)</span>
              <span className="font-mono text-lg text-zinc-100">
                ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            
            <div className="px-6 py-3 flex flex-col justify-center min-w-[160px]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Session P&L</span>
              <span className={`font-mono text-lg ${todaysPnL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {todaysPnL >= 0 ? '+' : '-'}${Math.abs(todaysPnL).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="px-6 py-3 flex flex-col justify-center min-w-[140px]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Margin Exp.</span>
              <span className="font-mono text-lg text-zinc-300">
                ${metrics.exposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="px-6 py-3 flex flex-col justify-center min-w-[140px]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Win Rate</span>
              <span className="font-mono text-lg text-zinc-300">
                {metrics.totalTrades > 0 ? metrics.winRate.toFixed(1) : '0.0'}%
              </span>
            </div>

          </div>

          <div className="flex items-center gap-2 p-3 border-t lg:border-t-0 border-zinc-800/80 bg-[#050505]">
            {isTradingEnabled && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-sm mr-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-emerald-500 tracking-widest uppercase">
                  TRADING {getPairName(activeAsset)}
                </span>
              </div>
            )}
            <button 
              onClick={toggleTrading}
              className={`flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors border
                ${isTradingEnabled 
                  ? 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:bg-zinc-800' 
                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'}`}
            >
              {isTradingEnabled ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              {isTradingEnabled ? 'Halt System' : 'Deploy Algo'}
            </button>
            <button 
              onClick={closeAllPositions}
              disabled={openPositions.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-sm bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-30 disabled:hover:bg-rose-500/10 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Close All
            </button>
          </div>
        </header>

        {/* MAIN TERMINAL WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0">
          
          {/* LEFT: CHART & CONTROLS */}
          <div className="lg:col-span-8 flex flex-col gap-4 lg:min-h-0">
            
            <div className="bg-[#09090b] border border-zinc-800/80 rounded-sm flex flex-col h-[400px] lg:h-auto lg:flex-1 lg:min-h-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 py-3 border-b border-zinc-800/80 bg-[#050505] gap-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <div className="relative">
                    <select 
                      value={activeAsset}
                      onChange={(e) => switchAsset(e.target.value)}
                      className="appearance-none bg-transparent text-zinc-100 text-sm font-bold pl-2 pr-8 py-1 focus:outline-none cursor-pointer hover:text-white transition-colors"
                    >
                      <optgroup label="Forex (Direct Feed)" className="bg-[#09090b] text-zinc-500 font-bold">
                        <option value="OANDA:XAU_USD" className="bg-[#09090b] text-zinc-100 py-2">XAU/USD</option>
                        <option value="OANDA:EUR_USD" className="bg-[#09090b] text-zinc-100 py-2">EUR/USD</option>
                        <option value="OANDA:GBP_USD" className="bg-[#09090b] text-zinc-100 py-2">GBP/USD</option>
                        <option value="OANDA:AUD_USD" className="bg-[#09090b] text-zinc-100 py-2">AUD/USD</option>
                        <option value="OANDA:USD_JPY" className="bg-[#09090b] text-zinc-100 py-2">USD/JPY</option>
                      </optgroup>
                      <optgroup label="Crypto (Binance)" className="bg-[#09090b] text-zinc-500 font-bold">
                        <option value="BINANCE:BTCUSDT" className="bg-[#09090b] text-zinc-100 py-2">BTC/USDT</option>
                        <option value="BINANCE:ETHUSDT" className="bg-[#09090b] text-zinc-100 py-2">ETH/USDT</option>
                      </optgroup>
                    </select>
                    <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-sm font-mono border border-zinc-700">1m</span>
                  <div className="flex items-center gap-1.5 ml-1 sm:ml-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                     <span className="text-[10px] uppercase font-bold text-blue-500/80 tracking-widest hidden sm:inline">Feed</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-1 sm:ml-3 pl-2 sm:pl-3 border-l border-zinc-800">
                     <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        brokerStatus === 'CONNECTED' ? 'bg-emerald-500' : 
                        brokerStatus === 'VERIFYING' ? 'bg-amber-500' : 'bg-rose-500'
                     }`}></div>
                     <span className={`text-[10px] uppercase font-bold tracking-widest ${
                        brokerStatus === 'CONNECTED' ? 'text-emerald-500/80' : 
                        brokerStatus === 'VERIFYING' ? 'text-amber-500/80' : 'text-rose-500/80'
                     }`}>
                        {brokerStatus === 'CONNECTED' ? 'MT5 Ready' : 
                         brokerStatus === 'VERIFYING' ? 'Verifying...' : 'Offline'}
                     </span>
                  </div>
                </div>
                
                <div className="flex items-center w-full sm:w-auto justify-end mt-1 sm:mt-0">
                  <div className="text-right flex items-center gap-2 sm:gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Market</span>
                    <span className={`font-mono text-xl ${isCrypto ? 'text-indigo-400' : (activeAsset === 'OANDA:XAU_USD' ? 'text-amber-500' : 'text-blue-500')}`}>
                      {currentPrice.toLocaleString(undefined, { minimumFractionDigits: currentPrice > 1000 ? 2 : 5, maximumFractionDigits: currentPrice > 1000 ? 2 : 5 })}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 w-full relative pt-4 pr-4 overflow-hidden" style={{ touchAction: 'pan-y' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visualData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartColor} stopOpacity={0.15}/>
                        <stop offset="100%" stopColor={chartColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="time" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }}
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'monospace' }}
                      orientation="right"
                      width={60}
                      tickFormatter={(val) => val.toLocaleString(undefined, { minimumFractionDigits: currentPrice > 1000 ? 1 : 4, maximumFractionDigits: currentPrice > 1000 ? 1 : 4 })}
                    />
                    <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#27272a" opacity={0.5} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#000', borderColor: '#27272a', borderRadius: '2px', padding: '8px 12px' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px' }}
                      labelStyle={{ color: '#71717a', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase' }}
                      formatter={(value) => [value.toLocaleString(undefined, { minimumFractionDigits: currentPrice > 1000 ? 2 : 5 }), 'Close']}
                      isAnimationActive={false}
                      wrapperStyle={{ zIndex: 100 }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="close" 
                      stroke={chartColor} 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: '#000', stroke: chartColor, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* RIGHT: POSITIONS & LOGS */}
          <div className="lg:col-span-4 flex flex-col gap-4 lg:min-h-0">
            
            {/* POSITIONS DATA TABLE */}
            <div className="bg-[#09090b] border border-zinc-800/80 rounded-sm flex flex-col h-[280px] lg:h-auto lg:flex-1 lg:min-h-0">
              <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-[#050505] flex justify-between items-center shrink-0">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-zinc-500" /> Active Orders
                </span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded-sm">{openPositions.length}</span>
              </div>
              
              <div className="flex-1 overflow-auto custom-scrollbar">
                {openPositions.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 text-xs font-mono">
                    NO ACTIVE POSITIONS
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#050505] sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80">Asset</th>
                        <th className="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80">Side</th>
                        <th className="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80 text-right">Entry</th>
                        <th className="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80 text-right">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {openPositions.map(pos => (
                        <tr key={pos.id} className="border-b border-zinc-900 hover:bg-zinc-900/40 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-300">{getPairName(pos.asset)}</td>
                          <td className="px-4 py-2.5">
                            <span className={pos.side === 'LONG' ? 'text-emerald-500' : 'text-rose-500'}>{pos.side}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-zinc-400">
                            {pos.entry.toLocaleString(undefined, { minimumFractionDigits: pos.entry > 1000 ? 2 : 5 })}
                          </td>
                          <td className={`px-4 py-2.5 text-right font-bold ${pos.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* SYSTEM LOGS TERMINAL */}
            <div className="bg-[#000000] border border-zinc-800/80 rounded-sm flex flex-col h-[280px] lg:h-auto lg:flex-1 lg:min-h-0">
              <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-[#050505] flex justify-between items-center shrink-0">
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-300 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-zinc-500" /> Event Terminal
                </span>
                <div className="flex gap-4">
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-600">EMA(50)</span>
                    <span className="font-mono text-xs text-zinc-400">
                      {metrics?.currentSMA != null ? Number(metrics.currentSMA).toFixed(5) : '--'}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-600">MACD</span>
                    <span className={`font-mono text-xs ${metrics?.currentMACD != null && metrics.currentMACD > (metrics.currentSignal || 0) ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {metrics?.currentMACD != null ? Number(metrics.currentMACD).toFixed(5) : '--'}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-600">RSI(14)</span>
                    <span className={`font-mono text-xs ${metrics?.currentRSI != null && metrics.currentRSI < 30 ? 'text-emerald-500' : metrics?.currentRSI != null && metrics.currentRSI > 70 ? 'text-rose-500' : 'text-zinc-400'}`}>
                      {metrics?.currentRSI != null ? Number(metrics.currentRSI).toFixed(1) : '--'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div ref={logsContainerRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1 custom-scrollbar">
                {systemLogs.map((log) => (
                  <div key={log.id} className="flex gap-3 hover:bg-zinc-900/30 transition-colors">
                    <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                    <span className={`break-words
                      ${log.type === 'info' ? 'text-zinc-400' : ''}
                      ${log.type === 'signal' ? 'text-blue-400' : ''}
                      ${log.type === 'trade' ? 'text-emerald-400' : ''}
                      ${log.type === 'error' ? 'text-rose-400' : ''}
                    `}>
                      {log.type === 'trade' ? '> ' : ''}{log.msg}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
