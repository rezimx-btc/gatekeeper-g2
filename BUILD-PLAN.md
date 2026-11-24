# BUILD-PLAN.md — Gatekeeper for Even G2

Build week: **23–29 Nov 2026** · Submit deadline: **29 Nov 23:59 Dubai = 30 Nov 02:59 WIB**
Demo Day: 3 Dec 2026 (remote). All times below in WIB unless noted.

## Before the build (done 21 Nov)

- [x] Event rules + judging criteria read (DoraHacks page, crawled 17 Nov)
- [x] Even Hub docs read (first app, device APIs, simulator)
- [x] Tooling verified on this VM: Node v24.22.1, npm 10.9.4; CLI 0.2.0, simulator 0.9.5, SDK 0.0.16
- [x] Data sources verified: Polymarket Gamma (public), Hyperliquid testnet reads (public),
      faucet rule found (needs prior mainnet deposit → paper engine instead)
- [x] Concept chosen: Track 02, Gatekeeper (proof-gated paper trading)
- [x] DESIGN.md + scaffold (README, LICENSE, dirs) — no app code yet

## Day 1 — Mon 23 Nov (kickoff 15:00 WIB)

- [x] Watch/read kickoff + Even Realities tech briefing notes; note "what makes a G2 app successful" — done 24 Nov from the live DoraHacks page + Even Hub docs; see `docs/kickoff-notes.md`. Note: live judging weights are 25/20/20/15/20 (DESIGN.md's 30/25/20/15/10 is outdated); 2nd/track is $375, not $500.
- [x] Check Even Hub catalogue for existing Polymarket/trading plugins (differentiation check) — done 24 Nov: ER Market / My Markets / Stocks Indicator are read-only tickers; no Polymarket app, no gated trading app. See `docs/kickoff-notes.md`.
- [x] Scaffold: `npx degit even-realities/evenhub-templates/minimal app`; `npm install` — done 24 Nov (73 packages; SDK 0.0.10 as pinned by the template).
- [x] Install CLI + simulator globally; hello-world on simulator (`evenhub-simulator http://localhost:5173`) — CLI 0.2.0 + simulator 0.9.5 installed globally (`evenhub`/`eh` binaries). Simulator run: VERIFIED 24 Nov after `apt-get install libwebkit2gtk-4.1-0` (APT_EXIT=0, ~10 min; ldd clean) + `xvfb-run` (headless VM, no $DISPLAY). App boots in simulator: `GET /api/ping` → pong, console "Page created: success", 0 errors; Home renders live data (2627 lit px), tap → Market (2936 lit px), screenshots in `docs/screenshots/`. Observation: after double-tap exit the glasses framebuffer goes blank (0 lit px) — the mode-1 confirmation dialog does not appear in the framebuffer in simulator 0.9.5; the app calls `shutDownPageContainer(1)` exactly as the template/docs prescribe, so this is a simulator quirk to re-check on hardware/beta, not an app bug.
- [x] Verify Groq Whisper STT + LLM from the server (connected account) — GO/NO-GO for voice loop — GO 24 Nov: models list includes whisper-large-v3 + whisper-large-v3-turbo; chat on openai/gpt-oss-20b returned OK; Whisper transcription endpoint returned HTTP 200 on a test wav (text " ." — synthetic tone, content unverified on real speech until Day 3).
- [ ] Create public GitHub repo `rezimx-btc/gatekeeper-g2`, push scaffold — PARENT via browser after this report (subagent cannot do browser tasks).

## Day 2 — Tue 24 Nov (backend: markets + paper + gate)

- [x] `server/`: `/api/markets` (Gamma + CoinGecko + HL testnet mids, 30 s cache) — done 24 Nov; live E2E: 12 markets, spot BTC $60,223 / ETH $1,694.02, HL testnet mids BTC $59,970.50 / ETH $1,693.15, all 3 sources fulfilled.
- [x] Paper ledger: positions, place/cancel/close, live mark-to-market PnL — done 24 Nov (`server/src/paper.js`, JSON persistence in `server/data/paper.json`); E2E: $10 YES filled @ 0.475 (21.05 shares), summary + close verified, realized $0.00 (price flat in cache window).
- [x] Gate policy engine (allowlist, $25/trade, $100/day, ±2% price sanity, duplicate + 60 s cooldown) — done 24 Nov (`server/src/gate.js`); E2E: $10 YES PASS 7/7; $30 REJECT (per-trade cap); stale price +10% REJECT (price sanity); unknown market REJECT (allowlist + price sanity); duplicate place 403 (duplicate guard + cooldown). Unit tests 4/4 (`npm test`).
- [x] G2 app: Home + Market screens rendering live data in simulator — app code DONE 24 Nov (`app/src/main.ts`: Home top market + book PnL, Market odds/volume/ends, tap toggles, double-tap exits mode 1, 30 s refresh, error state); `npm run build` clean (tsc + vite); Vite dev serving on http://localhost:5173. Rendering in the SIMULATOR not yet verified — same webkit-libs blocker as Day 1 (apt install still running).

## Day 3 — Wed 25 Nov (voice loop)

- [ ] Mic audio → server `/api/voice` (Groq Whisper → intent → drafted action)
- [ ] Draft / Confirm screen (3 lines: action + gate verdict + Yes/No)
- [ ] Tap / ring / voice "Yes" → paper fill → confirmation screen

## Day 4 — Thu 26 Nov (positions + Telegram)

- [ ] Positions screen (scrollable list, live PnL, voice/tap close)
- [ ] Settings screen (caps, allowlist toggle)
- [ ] Telegram approval mirror (bot token from user; Approve/Reject buttons → same gate + paper path)

## Day 5 — Fri 27 Nov (polish + proof)

- [ ] End-to-end run in simulator: glance → voice → gate → fill → PnL → Telegram approve
- [ ] Error states: gate REJECT with reason, API down, voice unclear
- [ ] Simulator screenshots (automation API `--automation-port` for headless shots)
- [ ] Decide demo-video recording setup (simulator window vs. screenshots + narration)

## Day 6 — Sat 28 Nov (video + package)

- [ ] Record demo video ≤ 3 min in simulator (the §2 demo script)
- [ ] README final: setup, track, what existed before 23 Nov
- [ ] Optional: packaged `.ehpk` build (`evenhub pack`)
- [ ] Full dry run of the DoraHacks submission form (no submit yet)

## Day 7 — Sun 29 Nov (submit)

- [ ] Final simulator pass + fix anything broken
- [ ] Submit on DoraHacks before 23:59 Dubai (02:59 WIB 30 Nov) — buffer, don't wait for the last hour
- [ ] Verify submission shows on the event page; save submission ID + link

## Needs from the user (during build)

- Telegram bot token (2 min via @BotFather) — optional, for the special-prize layer
- Nothing else before Demo Day; remote demo slot 3 Dec if finalist (time TBD)
