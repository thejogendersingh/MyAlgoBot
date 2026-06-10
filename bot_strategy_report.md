# Algorithmic Trading Bot - Strategy & Risk Report

## 1. Overview
This document outlines the technical strategy, risk management protocols, and data infrastructure of the custom Algorithmic Trading Bot. The system is designed for high-frequency execution on the 1-minute (1m) timeframe, focusing primarily on mean-reversion with momentum confirmation.

## 2. Core Strategy Logic
The bot utilizes a dual-indicator confirmation system to filter out false signals. It combines an oscillator (RSI) with a trend-following overlay (SMA).

*   **Indicators Used:** 
    *   **RSI (Relative Strength Index):** 14-period length
    *   **SMA (Simple Moving Average):** 20-period length

### Entry Conditions
*   **LONG (Buy Signal):**
    *   `RSI < 30` (Market is technically Oversold).
    *   `Price > SMA(20)` (Momentum is shifting upwards, crossing the moving average).
*   **SHORT (Sell Signal):**
    *   `RSI > 70` (Market is technically Overbought).
    *   `Price < SMA(20)` (Momentum is breaking downwards, crossing below the moving average).

*Note: By requiring the price to cross the SMA, the bot avoids "catching falling knives" when the RSI stays oversold for long periods during a strong trend.*

## 3. Risk Management & Sizing
Capital preservation is the primary focus of this algorithm.

*   **Position Sizing:** The bot strictly allocates **10% of the total portfolio equity** per trade.
*   **Stop Loss (SL):** `-0.15%` from entry price.
*   **Take Profit (TP):** `+0.30%` from entry price.
*   **Risk/Reward Ratio (RRR):** **1 : 2**
    *   *Explanation:* For every $1 the bot risks losing on a bad trade, it aims to make $2 on a winning trade. This means the bot only needs a Win Rate of 33.3% to break even. Any win rate above 34% results in net mathematical profit over time.

## 4. Technical Data Infrastructure
To ensure institutional-grade pricing without latency:

1.  **Historical Chart Seeding:** The bot fetches the last 100 minutes of highly correlated proxy data (e.g., Binance `PAXGUSDT` for Gold) to immediately initialize the SMA and RSI calculations without forcing the user to wait 20 minutes.
2.  **Live Execution Feed:** Once seeded, the bot connects to the **Finnhub Institutional WebSocket**, streaming live, tick-by-tick data directly from **OANDA**. 
3.  **Zero-Pip Gap:** Because the live feed is exactly OANDA's feed, the chart matches TradingView exactly.

## 5. Broker Execution Architecture
*   **API Gateway:** MetaApi Cloud (`metaapi.cloud-sdk`).
*   **Order Routing:** When a signal is confirmed, the React frontend calculates the PnL locally while simultaneously firing a `POST` request to the MetaApi REST endpoint.
*   **Broker:** Executed instantly on connected MT4/MT5 servers (e.g., Exness, XM) at market price.

---
*Report Generated Automatically by System*
