# server/ — Gatekeeper backend (Node, no dependencies)

**Status 24 Nov (Day 2):** markets + paper ledger + gate engine DONE and verified
live. Voice (`/api/voice`, Day 3) and Telegram mirror (`/api/telegram`, Day 4)
are not built yet.

## Run

```bash
npm install   # no dependencies yet; installs nothing
npm start     # node src/index.js — http://127.0.0.1:8787 (PORT env to change)
npm test      # gate policy unit tests (4/4)
```

## Endpoints

- `GET /health` — `{ok, time}`
- `GET /api/markets` — Polymarket Gamma top-12 by 24h volume + CoinGecko BTC/ETH
  spot + Hyperliquid testnet mids (30 s server-side cache)
- `GET /api/paper` — positions + live mark-to-market PnL summary
  (`openCount`, `unrealizedPnl`, `realizedPnl`, `totalPnl`, `dailyVolumeUsd`)
- `GET /api/gate/check?marketId&side&sizeUsd&price=` — gate verdict, no execution
- `POST /api/paper/place` `{marketId, question, side, sizeUsd, price?}` —
  gate → paper fill at live mid (403 + failed rules when the gate rejects)
- `POST /api/paper/close` `{id}` — close at live mid, realized PnL
- `POST /api/paper/cancel` `{id}` — cancel at entry price (realized PnL 0)

## Gate policy (defaults)

Allowlist (top-volume Gamma markets) · per-trade cap $25 · daily cap $100 ·
price sanity ±2% of live mid · no duplicate open position (same market + side) ·
60 s cooldown between orders.

## Files

| File | Purpose |
|---|---|
| `src/index.js` | HTTP server + routing (CORS open for the simulator/dev WebView). |
| `src/markets.js` | Gamma + CoinGecko + Hyperliquid testnet fetchers, 30 s cache. |
| `src/paper.js` | Paper ledger (JSON persistence in `data/paper.json`). |
| `src/gate.js` | Policy engine (`POLICY` constants + `check()`). |
| `tests/gate.test.js` | Policy unit tests. |

Secrets (`GROQ_API_KEY` for voice, `TELEGRAM_BOT_TOKEN` for the approval
mirror) live here only — never in `app/`. Neither is needed for Day 2; Groq
was verified working 24 Nov via the connected account (Whisper HTTP 200,
LLM chat OK).
