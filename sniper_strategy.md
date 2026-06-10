# 🎯 The Institutional Sniper Strategy (MACD + EMA + RSI)

This document outlines the mathematics and logic powering the bot's "Long-Term Sniper Mode". This mode is designed to survive for years by strictly managing risk, trading rarely, and using a Dynamic Trailing Stop to capture massive trends.

## 1. The 3-Indicator Confluence (Entry Rules)
To prevent the bot from entering fake breakouts, it requires three highly accurate mathematical models to agree simultaneously before risking capital.

### Condition 1: The Master Trend (50-EMA)
The Exponential Moving Average (50-period) determines the absolute flow of institutional money.
- **Rule:** If the current price is ABOVE the 50-EMA line, the bot will ONLY look for LONG (Buy) trades. If the price is BELOW the 50-EMA line, it will ONLY look for SHORT (Sell) trades.

### Condition 2: The Momentum Trigger (MACD)
The Moving Average Convergence Divergence (12, 26, 9) acts as the exact trigger to fire the sniper shot.
- **Rule:** The bot waits for the MACD Line to cross over the Signal Line. 
  - Cross UP = Buy Signal.
  - Cross DOWN = Sell Signal.

### Condition 3: The Extremes Filter (RSI)
The Relative Strength Index (14-period) prevents buying at the absolute top or selling at the absolute bottom.
- **Rule:** For a LONG trade, RSI must be between 40 and 65. For a SHORT trade, RSI must be between 35 and 60.

## 2. Dynamic Trailing Stop Loss (Exit Rules)
Grid systems have a static take-profit (e.g., $0.50), which severely limits profitability. This bot uses a **Dynamic Trailing Stop Loss** to lock in profits while letting the winner run.

- **Phase 1 (Hard Stop):** If the trade immediately goes wrong, a strict hard stop-loss of **-$1.50** is hit. The bot takes the small loss and waits for the next setup. No Grid. No Martingale.
- **Phase 2 (Trailing Activation):** Once the trade reaches **+$1.00** in floating profit, the Trailing Stop is activated.
- **Phase 3 (Locking Profit):** The Stop Loss is pulled up to stay exactly **$0.50 behind** the highest profit recorded.
  - *Example:* If profit reaches +$5.00, the Stop Loss is locked at +$4.50. If the market crashes suddenly, you still walk away with a guaranteed $4.50 profit!

## 3. Risk Management
- **Maximum Active Trades:** Strictly 1 per asset.
- **Position Sizing:** 5% of Account Equity (Fixed).
- **Averaging Down:** Disabled.

*This mathematical framework ensures that losing streaks are kept extremely small, while winning streaks result in massive account growth.*
