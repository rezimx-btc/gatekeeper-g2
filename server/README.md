# server/ — Gatekeeper backend (Node, no dependencies)

**Status 24 Nov (Day 3):** markets + paper ledger + gate engine + voice loop DONE
and verified live. Telegram mirror (`/api/telegram`, Day 4) is not built yet.

## Run

```bash
npm install   # no dependencies yet; installs nothing
npm start     # node src/index.js — http://127.0.0.1:8787 (PORT env to change)
npm test      # gate policy unit tests (4/4) + voice unit tests (14/14)
```

Voice needs `GROQ_API_KEY` in the server env (Whisper STT + intent LLM).
Two ways to run with it — the key never goes in `app/` or any file:

```bash
# 1. Real key in env (dev only, never commit it):
GROQ_API_KEY=... npm start

# 2. Launcher (preferred): mints an hsurr: surrogate for the registered
#    custom.groq credential via the authd socket, then execs the server.
python3 run-with-groq.py
```

Without `GROQ_API_KEY`, `/api/voice` answers `503 voice unavailable`.
When the env value is a surrogate, the server mints a fresh surrogate per
Groq call (authd unix socket) and falls back to the env surrogate if minting
fails — the surrogate was verified reusable across calls (see
`docs/day3-verification.md`).

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
- `POST /api/voice` — voice command. Audio: raw `audio/wav`,
  `audio/x-wav`, `application/octet-stream` (WAV s16le 16 kHz mono, or raw
  s16le 16 kHz PCM which the server wraps in a WAV header), or
  `multipart/form-data` with part `audio` (+ optional fields `marketId`,
  `question`, `draftId`). JSON: `{text, marketId?, question?, draftId?}`
  skips STT. Flow: Whisper → intent LLM (`buy`/`unsupported`) → top market
  (or `marketId`) → live mid → gate → draft (5 min TTL). Returns
  `{ok:true, draftId, transcript, intent, draft, gate}` or
  `{ok:false, transcript, reason}` for non-buy speech (no draft). With
  `draftId` it is a yes/no turn instead: `yes` → confirm+fill,
  `no` → cancel, anything else → `heard:'unclear'`, draft kept.
  Empty/non-audio body → 400; no `GROQ_API_KEY` → 503; Groq 401/429/5xx → 502.
- `POST /api/voice/confirm` `{draftId}` — fresh gate check, then paper fill:
  `{filled:true, position, gate}` (200) or `{filled:false, gate}` (403).
  Draft deleted after confirm either way. Unknown id → 404, expired → 410.
- `POST /api/voice/cancel` `{draftId}` — `{cancelled:true}` (200), 404 if unknown.
- `GET /api/voice/draft/:id` — `{draft, gate}` (200), 404 unknown / 410 expired.

## Voice flow (Day 3)

Mic (G2) → `POST /api/voice` (WAV s16le 16 kHz mono) → Groq Whisper
(`whisper-large-v3-turbo`, `language: en`) → Groq chat (`openai/gpt-oss-20b`,
strict system prompt, JSON-only intent) → market (top volume or requested)
→ `gate.check()` → draft in memory (5 min) → glasses show draft + gate →
user says "Yes" / "No" → same endpoint with `draftId` → confirm (fresh gate
→ paper fill) or cancel. Drafts are in-memory only; the paper ledger stays
in `data/paper.json`.

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
| `src/voice.js` | Voice loop: WAV/PCM/multipart parsing, Whisper + intent LLM (Groq), draft store (5 min TTL), confirm/cancel. Pure helpers unit-tested. |
| `run-with-groq.py` | Dev launcher: mints the custom.groq surrogate via authd, sets `GROQ_API_KEY`, execs `node src/index.js`. |
| `tests/gate.test.js` | Policy unit tests. |
| `tests/voice.test.js` | Voice unit tests (intent JSON, yes/no, WAV/PCM, multipart, draft store). |
| `test-audio/` | Real-voice test fixtures (gTTS): `buy-ten-yes.wav`, `yes.wav`, `no-cancel.wav` (+ source `.mp3`), all s16le 16 kHz mono. |

Secrets (`GROQ_API_KEY` for voice, `TELEGRAM_BOT_TOKEN` for the approval
mirror) live here only — never in `app/`. Neither is needed for Day 2; Groq
was verified working 24 Nov via the connected account (Whisper HTTP 200,
LLM chat OK).
