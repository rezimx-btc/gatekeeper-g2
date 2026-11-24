# Gatekeeper for Even G2

**Proof-gated DeFi actions on your glasses — glance, ask, confirm with one tap.**

> Heads Up: Even Realities Hackathon (DoraHacks, TVM Ventures & Daos Hub)
> Track 02 · Crypto & DeFi · Solo entry by rezimx-btc

Gatekeeper is a DeFi action assistant for the Even Realities G2 smart glasses. It reads
live prediction-market odds (Polymarket), drafts an action through an AI agent, and
**gates it** before anything executes. Only a draft that passes all 7 gate checks can
be confirmed — with one tap, a ring gesture, or a voice "Yes".

**Paper trading only. No real funds, no wallet connection, no custody.**

## The moment

Verified live in the Even Hub simulator, 24 Nov 2026 (Day 5 run — figures move with
live markets, so treat the market below as that day's snapshot):

1. Glance: `New NVIDIA CEO named by Dec 31, 2026? — YES 100% · 24h $3.2M · Paper book +$3.76 · 3 open`
2. Voice: *"Buy ten dollars YES."*
3. Gate checks **7/7** → glasses show the 3-line draft → tap / ring / "Yes"
4. `FILLED $10 YES @ $1.00 · Position #9 · PAPER`
5. Positions screen: live PnL per position, close by voice + tap.

The gate is the product. Every proposed trade must pass, in order:

| # | Check | Rule |
|---|---|---|
| 1 | Market allowlist | Top-volume Polymarket markets only (toggleable in Settings) |
| 2 | Side | Must be YES or NO |
| 3 | Per-trade cap | Default $25 paper (user setting) |
| 4 | Daily cap | Default $100 paper/day (user setting) |
| 5 | Price sanity | Draft price within ±2% of the live mid, else REJECT |
| 6 | Duplicate guard | No open position on the same market + side |
| 7 | Cooldown | 60 s between orders (fixed) |

A failing check is shown on the glasses in plain words
(e.g. `Gate: REJECT — duplicate guard`), and the draft can only be dismissed —
never confirmed. The confirm step re-runs the gate fresh server-side, so a draft
that passed a minute ago cannot slip through a changed market.

## What existed before 23 Nov 2026

Per the hackathon rules, the build starts 23 Nov. Before that date this repo held only
the scaffold: `README.md`, `LICENSE`, `DESIGN.md`, `BUILD-PLAN.md`, `.gitignore`, and
empty `app/` / `server/` / `docs/` directories. **All app code was written during the
build week, 23–29 Nov 2026.**

## Structure

```
app/                  Vite + TypeScript Even Hub app (G2 UI, 576×288 monochrome)
  src/main.ts         Bridge, screens, input routing, stale-data indicator
  src/voice.ts        Voice helpers (WAV build, gate summary, cap steps)
  app.json            Even Hub manifest (package_id com.rezimx.gatekeeper-g2)
server/               Node backend — markets, paper ledger, gate policy, voice
  src/index.js        HTTP server + routing (:8787)
  src/markets.js      Polymarket Gamma + CoinGecko + Hyperliquid testnet mids (30 s cache)
  src/paper.js        Paper ledger (JSON persistence in server/data/)
  src/gate.js         Policy engine — the 7 checks
  src/settings.js     Gate settings store (caps, allowlist)
  src/voice.js        Groq Whisper STT + intent LLM, draft store (5 min TTL)
  run-with-groq.py    Dev launcher — mints the Groq credential, starts the server
  test-audio/         Voice test fixtures (gTTS WAV/MP3: buy, yes, no, unclear…)
docs/                 Verification notes per build day, screenshots, video plan
demo/                 Demo video (≤ 3 min, recorded in the simulator)
DESIGN.md             Full design: concept, architecture, risks, sources
BUILD-PLAN.md         Day-by-day plan, 23–29 Nov
```

## Setup

Prerequisites: **Node ≥ 20** (verified on Node v24.22.1, npm 10.9.4) and Python 3
(for the server launcher). No G2 hardware is needed — everything below runs
against the Even Hub simulator.

```bash
# Tooling (once)
npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator

# App (from the official minimal template)
npx degit even-realities/evenhub-templates/minimal app
cd app && npm install

# Backend (no npm dependencies)
cd ../server && npm install
```

Run — three terminals:

```bash
# Terminal 1 — backend (REQUIRED first). Do NOT run `node src/index.js`
# directly unless GROQ_API_KEY is already in the env: without a key the
# voice endpoint answers 503 and the voice loop is dead.
# The launcher mints the key from the connected Groq account and execs
# the server; the key is never written to a file.
cd server && python3 run-with-groq.py   # → http://127.0.0.1:8787

# Terminal 2 — Vite dev server
cd app && npm run dev                    # → http://localhost:5173

# Terminal 3 — simulator
evenhub-simulator http://localhost:5173
```

The server needs `GROQ_API_KEY` (server-side only, never in the app) for Whisper
STT + the agent LLM. Without it, markets / paper / gate still work; only
`/api/voice` is unavailable.

### Voice in the simulator — virtual mic

The simulator cannot inject audio, so on a headless machine voice needs a virtual
microphone (PulseAudio null sink). This is how the Day 5 end-to-end voice run was
done; it is not needed on real G2 hardware, which has a real mic.

```bash
apt-get install -y pulseaudio pulseaudio-utils libasound2-plugins alsa-utils
pulseaudio --start --exit-idle-time=-1
pactl load-module module-null-sink sink_name=virtmic sink_properties=device.description=virtmic
pactl load-module module-remap-source master=virtmic.monitor source_name=virtmic_src source_properties=device.description=virtmic_src
pactl set-default-source virtmic_src ; pactl set-default-sink virtmic
# /etc/asound.conf: pcm.!default { type pulse } + ctl.!default { type pulse }
evenhub-simulator --list-audio-input-devices   # → alsa:null, alsa:pulse, alsa:default
evenhub-simulator --automation-port 9898 --aid alsa:default http://localhost:5173
paplay --device=virtmic server/test-audio/buy-ten-yes.wav   # while the app is listening
```

## How to use

Screens (576×288, one thing per screen, one action):

- **Home** — top market (question, YES %, 24h volume) + paper book PnL today.
  Tap → Market. Scroll → Positions.
- **Market** — odds, volume, ends date. Ring tap or swipe → voice listening
  (`Say "buy $10 YES"`). Tap → back Home.
- **Draft / Confirm** — the money screen, 3 lines max: action, gate verdict
  (`Gate: PASS 7/7` or the failing rule), `Tap / ring / "Yes" to confirm`.
  Scroll cancels the draft. A PASS draft auto-listens for "Yes"/"No".
- **Filled** — `FILLED $10 YES @ $1.00 · Position #N · PAPER`. Tap → Home.
- **Positions** — scrollable list with live PnL per position, Settings, Back.
  Tap a position → CloseConfirm → tap closes it at the live mid.
- **Settings** — per-trade cap, daily cap, allowlist on/off, reset to defaults.
  Tap cycles a cap / toggles / resets. Also settable by voice
  (`"Set per-trade cap to 10"`, `"Turn allowlist off"`, `"Reset settings"`).
- Double-tap anywhere → exit (mode 1, system confirmation dialog).

Voice commands: `Buy $10 YES` (or NO), `Close position N`, `Set per-trade cap to
10`, `Set daily cap to 50`, `Turn allowlist off/on`, `Reset settings`. Unclear
speech is answered with `unrecognized command` — nothing is drafted, nothing fills.

If the server goes down while the app already has data, Home and Positions keep
showing the last good data — now with a `· STALE` tag on the Book line
(`Book +$3.76 · 3 open · STALE`) until a refresh succeeds again. A fresh start
with no data shows `Market data unavailable. / Load failed / Tap to retry` instead.

## Track 02 & rules compliance

- **Track 02 apps used:** Polymarket, Hyperliquid (read-only mids), CoinGecko.
  All market reads are public APIs — no keys, no accounts.
- **Money safety:** paper trading only. The Hyperliquid testnet faucet requires a
  prior mainnet deposit, so no real testnet orders are in scope; paper execution
  against live prices is explicitly allowed by the event rules
  ("testnet, paper trading or read-only data"). No financial advice; every trade
  screen is labelled `PAPER`.
- **Telegram:** planned / optional approval mirror only (Approve/Reject buttons
  mapping to the same gate + paper path). It is **not built yet** — it needs a
  `TELEGRAM_BOT_TOKEN` from @BotFather, which the user has not provided. The core
  app works without it. (The $1,000 Best Telegram integration special prize is
  explicitly open to projects from any track.)
- **Judging weights (live DoraHacks page, 24 Nov):** Usefulness 25% · Read and
  write 20% · Technical execution 20% · UX 15% · Business potential and safety 20%.
- **Verification status (24 Nov):** server unit tests 31/31, app build clean;
  full voice → draft → gate → fill → close loop proven live in the simulator,
  including gate REJECT (duplicate guard, per-trade cap), API-down, and unclear-
  voice error states — see `docs/day5-verification.md`. No G2 hardware was
  available, so the real G2 mic and ring tap are unverified on device (see below).

## Demo video

[Gatekeeper G2 — demo (≤ 3 min)](demo/gatekeeper-g2-demo.mp4) — recorded in the
Even Hub simulator (no G2 hardware), narrating the moment above: glance → voice
buy → gate PASS 7/7 → fill → live PnL → close.

## Known issues / not yet verified

1. **Real G2 mic + ring tap (`source=2`):** unverified — needs G2 hardware. All
   voice runs so far used the virtual mic in the simulator + HTTP. The ring-tap
   path is implemented from the SDK spec but has never fired on a device.
2. **"No open positions" screen:** not yet photographed — it needs a ledger with
   zero open positions, which was not created (ledger kept for the demo).
   Code-reviewed only.
3. **Draft expiry (410) end-to-end:** unit-tested only; never exercised live.
4. **Tap cap-cycle / tap Reset in the simulator:** not yet photographed; the same
   POST path is proven via the allowlist toggle + `nextStep()` unit tests + HTTP.
5. **Stale data without warning (fixed Day 6):** previously, with the server down
   and cached data, Home/Positions showed old data with no indication at all.
   Fixed with a `· STALE` tag on the Book line when the last refresh failed
   (`app/src/main.ts`); the tag clears itself on the next successful refresh.
   The Market screen does not carry the tag yet.
6. **Positions selection is sticky, not reset to the first row:** observed
   behaviour, not a bug — but the demonstrator must read the CloseConfirm screen
   before tapping confirm.
7. **Packaged `.ehpk` build:** `evenhub pack` (CLI 0.1.14, local devDependency)
   currently rejects the manifest — `package_id` segment `gatekeeper-g2`
   contains a hyphen, and the pack validator allows only lowercase letters or
   numbers per segment. Fix is a one-word manifest rename
   (`com.rezimx.gatekeeper-g2` → `com.rezimx.gatekeeperg2`); not applied yet —
   it changes the install identity, so it waits for an explicit call. The app
   itself builds clean (`npm run build`) and runs in the simulator.

## License

MIT — see [LICENSE](LICENSE).
