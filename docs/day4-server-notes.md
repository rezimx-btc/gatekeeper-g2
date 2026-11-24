# Day 4 verification — Gatekeeper G2 server (settings + voice close/settings)

Date: 2026-11-24 (server times below are UTC; WIB = UTC+7).
Scope of this file: **SERVER** section. App section is written by the app builder.
Day 3 state at start: server PID 3247 live; ledger #1 closed, #2–#5 OPEN,
daily $50/$100 (see `docs/day3-verification.md`).

## Files created / changed (server)

| File | Change |
|---|---|
| `server/src/settings.js` | **NEW** — settings store: `createSettingsStore(filePath)`, default instance `settingsStore` (file `server/data/settings.json`), `DEFAULT_SETTINGS` {perTradeCapUsd 25, dailyCapUsd 100, allowlistEnabled true}. `get()` → `{...current, defaults:{...}, isDefault}`; `update(patch)` validates + persists; `reset()` restores defaults. Validation: caps must be finite numbers, per-trade 1–1000, daily 1–10000, allowlistEnabled boolean, unknown field → `SettingsValidationError` (HTTP 400). Missing/corrupt file → defaults. No secrets. |
| `server/src/gate.js` | **CHANGED** — `check()` now reads the effective policy from the settings store (caps + allowlist toggle). `POLICY` still exported unchanged as the defaults (gate tests untouched, still pass). Allowlist OFF → allowlist check PASS with detail `Allowlist OFF — any market allowed`. Returned `policy` field = effective settings {perTradeCapUsd, dailyCapUsd, allowlistEnabled, priceSanityPct, cooldownMs}. Price sanity (±2%) + cooldown (60 s) stay fixed, not settings. |
| `server/src/voice.js` | **CHANGED** — `INTENT_SYSTEM_PROMPT` + `parseIntentJson()` + `handleVoice()` handle new intents: `close` {"action":"close","positionId":n} (integer > 0), `set_cap` {"action":"set_cap","which":"perTrade"\|"daily","value":n} (number > 0), `toggle_allowlist` {"action":"toggle_allowlist","enabled":bool}, `reset_settings`. Close → paper `close()` at live mid; settings → settings store. Yes/no turn (`draftId`) still takes priority. Buy flow unchanged. |
| `server/src/index.js` | **CHANGED** — wiring only: `GET /api/settings`, `POST /api/settings` (partial JSON, 400 `{error}` on invalid), `POST /api/settings/reset`. No old route touched. |
| `server/tests/settings.test.js` | **NEW** — 8 unit tests (node:test, no network, temp files only). |
| `server/tests/voice.test.js` | **CHANGED** — +5 `parseIntentJson` tests: close (valid + bad ids), set_cap (perTrade/daily + bad values), toggle_allowlist + reset_settings, sell/cancel/greet → unsupported. Old tests untouched. |
| `server/package.json` | **CHANGED** — `test` script now also runs `tests/settings.test.js`. |
| `server/README.md` | **CHANGED** — settings endpoints, new voice intents, allowlist-OFF note (price sanity still needs a live price from the top-12 Gamma feed, so the toggle only affects the allowlist rule), file table, test counts. |
| `server/data/settings.json` | Created by the server during E2E (persisted settings; holds defaults at end of verification). |

NOT changed: `server/src/markets.js`, `server/src/paper.js`, `server/tests/gate.test.js`,
anything under `app/`. No DoraHacks submit, no GitHub upload, no git push (per task).

## 1. Unit tests

Command:

```bash
cd ~/workspace/even-realities/server && npm test
```

Result: **31/31 pass** (gate 4/4 unchanged + voice 19/19, was 14/14 + 5 new
+ settings 8/8 new).

```
ℹ tests 31
ℹ pass 31
ℹ fail 0
```

Settings tests cover: defaults on missing file, defaults on corrupt file
(garbage / `[]` / string), valid stored field kept + bad stored field defaulted,
update valid + persist (fresh store re-reads it), boundary values (1/1000,
1/10000, allowlist false), validation failures (0, negative, string, NaN,
Infinity, >max, non-boolean allowlist, unknown field, non-object patch — store
unchanged after each), reset restores + persists defaults.

## 2. Server restart (once, after code + tests green)

Old server PID 3247 killed politely (`kill 3247`, confirmed stopped), restarted:

```bash
cd ~/workspace/even-realities/server && setsid nohup python3 run-with-groq.py >> server.log 2>&1 &
curl -s http://127.0.0.1:8787/health
# {"ok":true,"time":"2026-11-24T10:14:29.458Z"}
```

New server **PID 41266** (`node src/index.js`), health OK. Note: the first
restart attempt used the wrong log path (`server/server.log` from inside
`server/`, file did not exist, launcher never started); the retry with
`server.log` started cleanly. The `cd ... && ... &` trap from AGENTS.md also
applied — the `tail` in that command ran in the original cwd, not `server/`;
the server itself started fine.

## 3. Live E2E via curl (after restart)

Ledger at start: openCount 4 (#2 7222313 YES $10, #3 6977205 YES $10,
#4 3215007 YES $10, #5 7222310 YES $10), closedCount 1 (#1), daily $50.

### (a) GET /api/settings → defaults

```bash
curl -s http://127.0.0.1:8787/api/settings
# {"perTradeCapUsd":25,"dailyCapUsd":100,"allowlistEnabled":true,
#  "defaults":{"perTradeCapUsd":25,"dailyCapUsd":100,"allowlistEnabled":true},
#  "isDefault":true}
```

### (b) Gate check 7222313 YES $10 — REJECT on duplicate guard (honest deviation)

As specified in the task this should PASS, but it does **not**: position #2 is
open YES on market 7222313, so the duplicate guard correctly rejects. All
other 6 checks pass and the policy field shows the default caps 25/100.

```bash
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=7222313&side=YES&sizeUsd=10"
# verdict REJECT, failedRules ["duplicate guard"]
#   allowlist PASS, side PASS, per-trade cap PASS "$10 ≤ $25",
#   daily cap PASS "$50.00 used today of $100",
#   price sanity PASS "Draft 0.475 within 2% of live 0.475",
#   duplicate guard FAIL "An open YES position already exists on this market",
#   cooldown PASS
# policy {"perTradeCapUsd":25,"dailyCapUsd":100,"allowlistEnabled":true,
#         "priceSanityPct":0.02,"cooldownMs":60000}
```

Clean PASS shown with the side=NO variant (no open NO position on that market):

```bash
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=7222313&side=NO&sizeUsd=10"
# verdict PASS, failedRules [], price sanity "Draft 0.525 within 2% of live 0.525"
```

### (c) Per-trade cap 5 → gate follows the new cap

```bash
curl -s -X POST http://127.0.0.1:8787/api/settings -d '{"perTradeCapUsd":5}'
# {"perTradeCapUsd":5,"dailyCapUsd":100,"allowlistEnabled":true,"isDefault":false}
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=7222313&side=NO&sizeUsd=10"
# verdict REJECT, failedRules ["per-trade cap"]
#   per-trade cap FAIL "$10 exceeds the $5 per-trade cap"
#   policy.perTradeCapUsd 5
```

Invalid updates return 400 (verified live, settings unchanged afterwards):

```bash
POST /api/settings {"perTradeCapUsd":0}
# {"error":"perTradeCapUsd must be between 1 and 1000, got 0"} HTTP 400
POST /api/settings {"unknownField":1}
# {"error":"unknown settings field: unknownField"} HTTP 400
```

### (d) Reset → defaults, gate PASS again

```bash
curl -s -X POST http://127.0.0.1:8787/api/settings/reset -d '{}'
# {"perTradeCapUsd":25,"dailyCapUsd":100,"allowlistEnabled":true,"isDefault":true}
# gate check 7222313 NO $10 → verdict PASS, policy caps 25/100
```

### (e) Allowlist toggle with a market outside the allowlist (999999999)

Allowlist ON → allowlist FAIL (price sanity also FAILs: no live price):

```bash
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=999999999&side=YES&sizeUsd=10"
# verdict REJECT, failedRules ["allowlist","price sanity"]
#   allowlist FAIL "Market is not in the allowlist"
#   price sanity FAIL "No live price available for this market"
```

Allowlist OFF → allowlist PASS, price sanity still FAILs (expected: the toggle
only affects the allowlist rule; the market is not in the top-12 Gamma feed,
so there is no live price for the sanity check):

```bash
POST /api/settings {"allowlistEnabled":false}   # → allowlistEnabled false
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=999999999&side=YES&sizeUsd=10"
# verdict REJECT, failedRules ["price sanity"]
#   allowlist PASS "Allowlist OFF — any market allowed"
#   price sanity FAIL "No live price available for this market"
POST /api/settings/reset -d '{}'   # → defaults restored, isDefault true
```

### (f) Voice close: new test position #6 → closed via voice

Market 7307308 "Counter-Strike: 100 Thieves vs Imperial (BO1)" had no open
position (from `GET /api/markets`); placed $10 YES via `/api/paper/place`:

```bash
curl -s -X POST http://127.0.0.1:8787/api/paper/place -d '{"marketId":"7307308","side":"YES","sizeUsd":10}'
# filled: true, position {id: 6, marketId: "7307308", side: "YES", sizeUsd: 10,
#   entryPrice: 0.595, shares: 16.80672268907563, status: "open"}, gate PASS
curl -s -X POST http://127.0.0.1:8787/api/voice -d '{"text":"Close position 6"}'
# {"ok":true,"action":"close","transcript":"Close position 6",
#  "position":{"id":6,"marketId":"7307308","side":"YES","sizeUsd":10,
#   "entryPrice":0.595,"shares":16.80672268907563,"status":"closed",
#   "closedAt":"2026-11-24T10:15:05.653Z","closePrice":0.595,"realizedPnl":0}}
curl -s http://127.0.0.1:8787/api/paper
# openCount 4, closedCount 2, dailyVolumeUsd 60, realizedPnl 0
# (positions list in the summary only shows open positions; closedCount 2
#  confirms #6 moved to closed — #1 + #6)
curl -s -X POST http://127.0.0.1:8787/api/voice -d '{"text":"Close position 6"}'
# {"ok":false,"action":"close","transcript":"Close position 6",
#  "reason":"No open position #6"}  (HTTP 200)
```

### (g) Voice settings: set cap, toggle allowlist, reset

```bash
POST /api/voice {"text":"Set per-trade cap to 10"}
# {"ok":true,"action":"settings","transcript":"Set per-trade cap to 10",
#  "settings":{"perTradeCapUsd":10,"dailyCapUsd":100,"allowlistEnabled":true,"isDefault":false}}
POST /api/voice {"text":"Turn allowlist off"}
# {"ok":true,"action":"settings","transcript":"Turn allowlist off",
#  "settings":{"perTradeCapUsd":10,"dailyCapUsd":100,"allowlistEnabled":false,"isDefault":false}}
POST /api/voice {"text":"Reset settings"}
# {"ok":true,"action":"settings","transcript":"Reset settings",
#  "settings":{"perTradeCapUsd":25,"dailyCapUsd":100,"allowlistEnabled":true,"isDefault":true}}
GET /api/settings → defaults confirmed (25/100/ON, isDefault true)
```

### (h) Regression Day 2/3: gate check + voice buy draft (no confirm)

Waited out the 60 s cooldown from the #6 place (10:14:59 UTC), then:

```bash
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=3215006&side=YES&sizeUsd=10"
# verdict PASS, failedRules [], policy caps 25/100
curl -s -X POST http://127.0.0.1:8787/api/voice -d '{"text":"Buy ten dollars YES","marketId":"3215006"}'
# {"ok":true,"draftId":"dft_ef29f154da06251e","transcript":"Buy ten dollars YES",
#  "intent":{"action":"buy","side":"YES","sizeUsd":10},
#  "gate":{"verdict":"PASS","failedRules":[]},"draft":{"marketId":"3215006","price":0.0025}}
# Draft NOT confirmed (no new position). Both this draft and a second draft
# created for the cancel test were cancelled via POST /api/voice/cancel
# ({"cancelled":true}); GET /api/voice/draft/<id> → {"error":"draft not found"}.
```

## 4. Final state

- Server: **PID 41266**, `http://127.0.0.1:8787`, health OK
  (last check `{"ok":true,"time":"2026-11-24T10:16:18.693Z"}`).
- Settings: **defaults** — perTradeCapUsd 25, dailyCapUsd 100,
  allowlistEnabled true, isDefault true (verified via `GET /api/settings` and
  the persisted `server/data/settings.json`).
- Ledger: #1 closed, #2–#5 OPEN (unchanged from Day 3), **#6 closed via voice
  (realizedPnl 0, closePrice 0.595 = entryPrice)**, daily volume $60/$100
  (was $50; +$10 from the #6 test place), totalPnl -0.51 (mark-to-market
  movement on open positions, live prices moved during verification).
- Secret grep over all created/changed files (`gsk_` / `hsurr:`): only the
  pre-existing `hsurr:` prefix references in `server/src/voice.js`
  (comment + `startsWith('hsurr:')` checks) and `server/README.md` (launcher
  description) — no key material, no `gsk_` anywhere.

## 5. What is NOT verified yet

- **Voice close / settings via real G2 microphone audio**: all voice E2E
  here used JSON `{text}` (STT skipped, intent LLM via Groq still live).
  The audio path (WAV → Whisper) is unchanged from Day 3 and was verified
  then; the new intents only change the intent LLM prompt + parsing.
- **Draft expiry (410) end-to-end**: still only unit-tested (same as Day 3).
- **(b) as specified**: `GET /api/gate/check marketId=7222313 side=YES sizeUsd=10`
  returns REJECT, not PASS, because position #2 is open YES on that market —
  the duplicate guard is doing its job. A PASS with the default caps is shown
  by the side=NO variant in §3(b). If the coordinator needs a literal PASS on
  7222313 YES, position #2 would have to be closed first (not done — the
  task forbids touching #1–#5).

## Files to upload to the repo (server side)

```
server/src/settings.js
server/src/gate.js
server/src/voice.js
server/src/index.js
server/tests/settings.test.js
server/tests/voice.test.js
server/package.json
server/README.md
docs/day4-server-notes.md   (this file)
```

Do NOT upload: `server/data/paper.json` (local test ledger),
`server/data/settings.json` (local persisted settings),
`server/server.log` (dev log).
