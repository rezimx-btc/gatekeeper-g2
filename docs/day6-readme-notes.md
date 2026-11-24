# Day 6 notes — README final + .ehpk + stale-data fix

Date: 2026-11-24 (WIB = UTC+7). Scope: this subagent's task only — README final,
packaged `.ehpk` attempt, known-issue "data basi tanpa peringatan" (day5 §7.1).
No DoraHacks submit, no GitHub upload/push. Video recording ran in parallel
(another subagent) — not waited for; README links `demo/gatekeeper-g2-demo.mp4`
as a path that will exist at upload time (no `demo/` dir yet at time of writing).

## 1. README.md — rewritten (final)

- Gate corrected to **7 checks** (DESIGN.md §2's "5/5" example is outdated):
  allowlist, side, per-trade cap, daily cap, price sanity ±2%, duplicate guard,
  60 s cooldown — verified against `server/src/gate.js`.
- "The moment" uses **live-verified figures**, labelled as the Day 5 run
  (24 Nov): top market "New NVIDIA CEO named by Dec 31, 2026?" YES 100% ·
  24h $3.2M · Book +$3.76 · 3 open; `FILLED $10 YES @ $1.00 · Position #9 ·
  PAPER`, gate PASS 7/7. Live re-check 24 Nov 18:06 WIB confirmed the same
  top market + ledger (open 3 #2/#4/#5, closed 8, daily $110/$100,
  totalPnl +$3.76, realized +$4.14, settings defaults $25/$100/ON).
- Telegram mirror written as **planned/optional, not built** — needs
  `TELEGRAM_BOT_TOKEN` from @BotFather, not yet provided by the user.
- Judging weights live 25/20/20/15/20 (not DESIGN.md's 30/25/20/15/10);
  2nd/track $375 (not $500) — per `docs/kickoff-notes.md`.
- Setup completed: prereqs (Node ≥ 20, verified v24.22.1/npm 10.9.4), global
  CLI + simulator install, app + server install, run server via
  `python3 run-with-groq.py` (explicitly: do NOT run `node` directly without
  a key — voice 503s), Vite dev, simulator, PulseAudio virtual-mic recipe
  (condensed from day5-verification §0).
- Usage: all 8 screens, voice commands, stale-data behaviour.
- Known issues: G2 mic + ring tap unverified (hardware), "No open positions"
  unphotographed, draft expiry 410 unit-test only, tap cap-cycle/reset
  unphotographed, stale-data fix (see §3), sticky Positions selection,
  `.ehpk` pack failure (see §2).

## 2. .ehpk — FAILED (not a blocker)

- `evenhub` is NOT on the shell PATH (only `evenhub-simulator` is, at
  `/usr/bin/evenhub-simulator`). The CLI lives as the app's local
  devDependency: `app/node_modules/.bin/evenhub`, version **0.1.14**
  (global 0.2.0 cited in DESIGN.md is not installed on this VM).
- Command run (via the app's own script): `cd app && npm run pack`
  → `npm run build && evenhub pack app.json dist`.
- Build step: CLEAN (tsc + vite, `dist/assets/index-Bf_FaZnG.js` 86.29 kB).
- Pack step error (verbatim):
  `ERROR Invalid app.json: package_id: must be a valid package name (e.g.,
  com.example.app). Each segment must start with a lowercase letter and
  contain only lowercase letters or numbers. Two or more segments are required.`
- Cause: `app.json` has `package_id: "com.rezimx.gatekeeper-g2"` — the segment
  `gatekeeper-g2` contains a hyphen, which the pack validator rejects
  (letters/numbers only). The simulator accepts the id fine; only `pack`
  is strict.
- No `.ehpk` file was produced. Fix (NOT applied — it changes the install
  identity, needs an explicit call): rename the segment to
  `com.rezimx.gatekeeperg2` in `app.json`, then re-run `npm run pack`.
  Documented in README § Known issues #7.

## 3. Stale-data fix — IMPLEMENTED (small, safe)

Assessment: the gap was display-only. `refreshData()` already sets `lastError`
on any failed refresh and clears it on the next successful markets fetch
(proven Day 5: fresh-start error screen works; with cached data the error was
set but never shown). So the fix is a pure string append on two existing
lines, no new state, no layout change, self-clearing within one 30 s refresh
cycle after recovery. Implemented in `app/src/main.ts`:

- `homeContent()`: Book line → `` `Book ${pnl} · ${open} open${lastError ? ' · STALE' : ''}` ``
- `positionsContent()`: Book line → `` `Book ${total} · ${openPositions.length} open${lastError ? ' · STALE' : ''}` ``

Deliberately NOT touched: Market screen (no tag yet — the gate re-checks the
live price at confirm time, so a stale displayed price cannot cause a bad
fill; noted in README), Draft/Filled/Settings/Close screens, refresh timing,
any server code.

Verification of the STALE branch itself: NOT photographed live — that would
require killing the server, which would disrupt the parallel video recording
in progress. The branch is a ternary on an already-rendered line, gated on
`lastError`, whose set/clear mechanics were proven live on Day 5. The
regression below proves no breakage; a live server-down screenshot of the
tag can be taken on Day 7 if the coordinator wants it (kill server → wait
one 30 s refresh or scroll Home→Positions → screenshot → restart server).

## 4. Regression after the fix (all green)

```bash
cd server && npm test
# tests 31, pass 31, fail 0 (gate 4/4 + voice 19/19 + settings 8/8)

cd app && npm run build
# tsc --noEmit && vite build — BERSIH
# dist/assets/index-lv4OA1tj.js  86.32 kB │ gzip: 33.71 kB

# HTTP (no fills — all rejected, ledger untouched):
POST /api/paper/place {marketId:6977205, side:YES, sizeUsd:30}
# → 403 REJECT, failedRules ['per-trade cap','daily cap']
POST /api/paper/place {marketId:7222313, side:YES, sizeUsd:10}
# → 403 REJECT, failedRules ['daily cap','duplicate guard']
GET /api/settings
# → {perTradeCapUsd:25, dailyCapUsd:100, allowlistEnabled:true, isDefault:true}
GET /api/paper → open 3, closed 8, daily $110/$100, totalPnl +$3.76 (unchanged)
```

Simulator Home render check: simulator PID 79132 (automation :9898, Xvfb :104),
Vite :5173 200, `GET /api/ping` → pong. Screenshots via `docs/shot.py`
(framebuffer lag ~5 s, per Day 5):
- `docs/screenshots/day6-market-stalefix.png` (lit 3300) — Market screen,
  live data, no STALE (correct: server up).
- `docs/screenshots/day6-home-stalefix.png` (lit 2830) — Home screen:
  `New NVIDIA CEO… / YES 100% · 24h $3.2M / Book +$3.76 · 3 open /
  Tap → market`. No STALE (correct: server up), no regression from the edit.
  (One `POST /api/input` attempt used the wrong field `type` instead of
  `action` and was rejected by the simulator — no input was delivered, no
  state changed by this subagent; the screen was already on Home.)

## 5. Files created / changed by this task

| File | Change |
|---|---|
| `README.md` | Rewritten — final (see §1) |
| `app/src/main.ts` | 2 lines — `· STALE` tag on Home + Positions Book lines (see §3) |
| `docs/day6-readme-notes.md` | This file |
| `docs/screenshots/day6-market-stalefix.png` (+ `-alpha.png`) | New — Market render proof |
| `docs/screenshots/day6-home-stalefix.png` (+ `-alpha.png`) | New — Home render proof |

NOT changed: `server/src/*`, `app/app.json` (pack fix deliberately left for
an explicit call), `DESIGN.md`, `BUILD-PLAN.md`, `server/data/*` (ledger +
settings untouched — still open 3, closed 8, daily $110/$100, defaults).
No secrets in any file or in this report (no keys printed; `run-with-groq.py`
mints the Groq surrogate at runtime only).

## 6. Open items for the coordinator / parent

1. `.ehpk`: decide whether to rename `package_id` to `com.rezimx.gatekeeperg2`
   and re-run `npm run pack` (one-line manifest change, changes install id).
2. Live server-down screenshot of the `· STALE` tag (Day 7, needs a server
   kill — do NOT do it while the video take is in progress).
3. `demo/gatekeeper-g2-demo.mp4` does not exist yet — video subagent still
   recording; README links it as a path.
4. Minor: `server/data/` (paper.json, settings.json) is NOT in `.gitignore`
   — upload checklist (day5 §9) already says do not upload them, but a
   `.gitignore` line would make it foolproof. Left untouched (out of scope).
