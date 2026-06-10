# 🚀 The "Aggressive Mode" Institutional Grid Strategy

This document outlines the mathematics and exact logic powering the bot's "Full Advanced Mode". This mode is designed to survive massive volatility while aggressively squeezing micro-profits out of the market by stacking up to 40 simultaneous trades.

## 1. Zoned Grid Distances
To prevent the bot from immediately firing all 40 trades during a 1-minute flash crash, the algorithm uses **Zoned Spacing**. The distance between new trades expands dynamically based on how deep the bot is into the grid:

| Grid Layer Zone | Trades # | Gap Between Trades | Purpose |
|-----------------|----------|--------------------|---------|
| **Zone 1** (Hyper Aggressive) | 1 to 10 | 2 pips | To catch micro-fluctuations and scalp rapidly in a sideways market. |
| **Zone 2** (Aggressive) | 11 to 20 | 5 pips | To stretch the grid during a medium trend or breakout against the bot. |
| **Zone 3** (Defensive) | 21 to 30 | 10 pips | To survive a strong directional trend while continuing to average down. |
| **Zone 4** (Last Resort) | 31 to 40 | 20 pips | To survive extreme black-swan crashes and pull the entry price down at the absolute bottom. |

## 2. Linear Risk Management (Martingale)
Standard Martingale doubles the size of the trade every step (e.g., $1, $2, $4, $8...). This is a mathematical guarantee to blow the account. 

Instead, this bot uses **Linear Multipliers**. 
- Base Trade Capital: `2% of Balance`
- Formula: `Size = Base * (1 + (LayerCount * 0.1))`
- *Example:* Trade 1 is 1x size. Trade 10 is 2x size. Trade 20 is 3x size. Trade 40 is 5x size.

This safely drags the "Average Entry Price" towards the current market price *without* draining the entire account margin prematurely.

## 3. Dynamic Profit Target
The Take Profit is calculated dynamically based on the total number of open trades in the cluster.
- Formula: `Target = Number of Trades * $0.50`
- If 10 trades are open, it demands a $5.00 net profit.
- If 40 trades are open, it demands a $20.00 net profit.

## 4. Equity Drawdown Stop Loss
With 40 trades, a static stop-loss is impossible. The bot uses an account-level **50% Drawdown Rule**.
- If the entire floating loss of all active trades combined exceeds `50% of Total Balance` (e.g. -$50 on a $100 account), it will automatically trigger an **Equity Stop Hit** and close all trades to save the remaining balance.
