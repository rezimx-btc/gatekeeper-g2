# Day 6 verification — Gatekeeper G2, Even Realities DoraHacks

Date: 2026-11-24 (WIB = UTC+7; server times below are UTC unless noted).
Scope: **video + package** (BUILD-PLAN.md Day 6), executed early. Telegram mirror
still DEFERRED (no token from user — not attempted, not asked). No DoraHacks
submit, no GitHub upload/push. DoraHacks submission-form dry run NOT done by
the coordinator (needs a live browser task — parent scope; public requirements
gathered from the event page, see §6).

Koordinator: video recorded by one subagent, README + .ehpk + stale-data fix by
a second subagent (parallel). All claims below re-verified by the coordinator
independently (ffprobe, frame inspection, npm test, npm run build, live API).

## 0. Live state at Day 6 start (verified 18:05 WIB)

- Server `http://127.0.0.1:8787` health OK (run-with-groq.py); settings defaults
  ($25/$100/allowlist ON, `isDefault:true`); ledger PAPER open 3 (#2, #4, #5),
  closed 8, daily $110/$100 (FULL), totalPnl +$3.76, realized +$4.14.
- Vite `:5173` 200; simulator `--automation-port 9898 --aid alsa:default`,
  ping pong; Xvfb **:104** (1280x1024); PulseAudio `virtmic` + `virtmic_src`
  running (`XDG_RUNTIME_DIR=/tmp/xdg-runtime-root`); ffmpeg 8.1.2.

## 1. Demo video — DONE + verified by coordinator

**File:** `demo/gatekeeper-g2-demo.mp4` — **155.00 s (limit 180 ✓), 1280×720,
h264 15 fps + aac mono, 2,251,499 byte (~2.15 MB)**. Coordinator ffprobe
confirms all values; file hash/size match the recorder's report exactly.

**Method (from `docs/day6-video-notes.md`):** ffmpeg x11grab on Xvfb :104
(measured glass area x=660, y=112, 576×288, scale 1:1 — measured, not the
640/100 estimate), 20 s test take passed first; voice WAVs played to virtual
mic (`paplay --device=virtmic`); simulator driven via automation API
(`POST /api/input`); narration gTTS (English) per scene, loudnorm −16 LUFS;
final build: glass crop 576:288:660:112, scale neighbor 2× (1152×576), pad
1280×720 on dark background, scene label via drawtext.

**Per-scene verification (coordinator):** extracted frames at t=66, t=89, t=140
and viewed them directly — all sharp, readable, no unintended error screen:
- t=66 Draft: `GATEKEEPER · PAPER / BUY $10 YES @ $1.00 / Gate: PASS 7/7 /
  Tap / ring / "Yes" to confirm` + label `3 GATE | Draft waits on the glass`.
- t=89 Filled: `FILLED $10 YES @ $1.00 · Position #12 · PAPER / Tap → home`
  + label `5 FILLED | Position 12, paper`.
- t=140 Closed: `CLOSED #12 · $0.00 · PAPER / Tap → positions` + label
  `7 CLOSE | Closed, P and L zero`.
- Recorder viewed 12 sample frames (one per segment) + silencedetect proved
  narration present in all 12 segments at the right positions; volumedetect
  mean −18.3 dB, max −1.4 dB (clear, no clipping). Full per-scene table in
  `docs/day6-video-notes.md` (Intro → Glance → Voice → Gate → Confirm →
  Filled → Positions → Close → Outro; 7 scenes + intro/outro).

**Demo position:** **#12** (6977205 YES $10 @ 0.9995, shown @ $1.00, 10.005
shares) — filled then closed via tap; realized PnL $0.00. Ledger end:
open 3 (#2, #4, #5), closed 9, daily **$120/$100**, totalPnl +$3.76,
realized +$4.14. Ledger NOT reset.

**Honest notes on the take (from the recorder, confirmed in notes):**
- Take 1 DISCARDED (126.67 s): transient Groq error 400 during voice +
  `yes.wav` played too early (still in draft listening). A direct
  `POST /api/voice` retry minutes later succeeded (draft PASS 7/7, expired
  on its own, no ledger effect).
- Take 2 USED (raw 206.13 s): all scenes live. Fill happened via **tap
  confirm**, not voice "Yes" — the Yes/No listening hit 2× silent auto-sends
  (counted unclear), mic died, Draft PASS stayed on screen, and `yes.wav`
  was played after the mic was already dead. Narration says "One tap
  confirms", matching the picture; it does NOT claim voice-confirm.
- Optional REJECT take (`buy-thirty-yes.wav`) not made — 7 scenes complete.
- Narration was NOT listened to by a human ear — verified only via
  silencedetect (presence/position) + volumedetect (level). gTTS
  pronunciation ("C E O", "P and L" spelled out) not ear-checked.
- Command WAVs are NOT audible in the video (x11grab has no audio; WAVs are
  app input via virtmic, not narration track).
- No full-window simulator wide frame (glass close-up only, per video plan §2).

**Daily cap handling:** raised to $200 before recording (verified
`isDefault:false`), **reset to defaults after** — coordinator verified live:
`GET /api/settings` → $25/$100/allowlist ON, `isDefault:true`.

## 2. README final — DONE + verified

`README.md` rewritten (11 KB, English). Facts checked against source:
gate **7 checks** (allowlist, side, per-trade cap, daily cap, price sanity
±2%, duplicate guard, cooldown 60 s — from `server/src/gate.js`, not the
old 5/5 example); **Telegram written as planned/optional, not built, needs
`TELEGRAM_BOT_TOKEN`**; judging weights **25/20/20/15/20**, 2nd/track
**$375**; "The moment" uses **verified live numbers** (NVIDIA CEO YES 100% ·
24h $3.2M · Book +$3.76 · 3 open; `FILLED $10 YES @ $1.00 · Position #9 ·
PAPER`, gate PASS 7/7 — Day 5 run, re-checked live 24 Nov 18:06 WIB).
Setup covers: prerequisites, CLI + simulator install, `npm install` app +
server, server via `server/run-with-groq.py` (explicitly: do NOT run `node`
directly without a key), Vite dev, simulator, virtual-mic PulseAudio recipe,
usage (voice + tap + positions + settings), Track 02 + rules compliance,
demo video path `demo/gatekeeper-g2-demo.mp4`, known issues, MIT license.
No secrets. Coordinator spot-checked: "STALE" mentioned 3×, package_id
note present (§7).

## 3. Packaged .ehpk — ATTEMPTED, FAILED (not a blocker)

- `evenhub` CLI is NOT on PATH (only `evenhub-simulator` in `/usr/bin`); the
  CLI exists as a local devDependency `app/node_modules/.bin/evenhub` v0.1.14.
- `cd app && npm run pack` → build clean (86.29 kB), then pack error:
  `Invalid app.json: package_id: must be a valid package name… Each segment
  must start with a lowercase letter and contain only lowercase letters or
  numbers.`
- Cause: `com.rezimx.gatekeeper-g2` — segment `gatekeeper-g2` contains a
  hyphen. Fix (one word, **NOT applied** — changes the install identity,
  needs an explicit decision): rename to `com.rezimx.gatekeeperg2` and
  re-run `npm run pack`. Recorded in README known issue #7. The .ehpk is
  **optional** per the event rules, so this does not block submission.

## 4. Stale-data fix — DONE (small + safe, verified)

Day 5 known issue §7: when the server dies but the app has cached data,
Home/Positions show stale data with no warning. Fix: 2 lines in
`app/src/main.ts` (lines 220 + 341, verified by coordinator grep) — the Book
line on Home + Positions appends ` · STALE` when `lastError` is set; the tag
clears itself on the next successful refresh. Display-only: no layout change,
no new state, server untouched, Market screen deliberately not tagged (the
gate re-checks live price at confirm, so a stale price on screen cannot cause
a bad fill).

**Regression after the fix (coordinator re-ran independently):**
- `npm test` server: **31/31 pass, 0 fail**.
- `npm run build` app: **clean** (86.32 kB, hash `index-lv4OA1tj.js` —
  differs from Day 5's `Bf_FaZnG` because `main.ts` changed, expected).
- HTTP: place $30 → **403** `['per-trade cap','daily cap']`; duplicate
  7222313 YES $10 → **403** `['daily cap','duplicate guard']`;
  `GET /api/settings` → defaults, `isDefault:true`; ledger unchanged.
- Simulator Home still renders — screenshots
  `docs/screenshots/day6-home-stalefix.png` (2830 lit px, `Book +$3.76 ·
  3 open`, no STALE because server is up = correct) +
  `day6-market-stalefix.png` (3300 lit px).
- **Caveat (honest):** the STALE branch itself was NOT photographed live —
  that requires killing the server, which would have disturbed the parallel
  video recording. The branch is a ternary on an already-rendered line,
  gated on `lastError`, whose mechanism was proven Day 5. A server-down
  screenshot can be taken Day 7 if wanted.

**Bonus hygiene (coordinator, 1 line):** `server/data/` was missing from
`.gitignore` — added, so the paper ledger can never be committed by accident.
Upload checklists already forbade it; now it is foolproof.

## 5. Files created / changed

| File | Change |
|---|---|
| `demo/gatekeeper-g2-demo.mp4` | **NEW** — 155.00 s, 1280×720, h264 + aac, 2,251,499 byte |
| `README.md` | **REWRITTEN** — final (11 KB) |
| `app/src/main.ts` | **CHANGED** — 2 lines (STALE tag, §4) |
| `.gitignore` | **CHANGED** — added `server/data/` (coordinator) |
| `docs/day6-video-notes.md` | **NEW** — recording log + verification |
| `docs/day6-readme-notes.md` | **NEW** — README/.ehpk/stale notes |
| `docs/day6-verification.md` | **NEW** — this file (coordinator consolidation) |
| `docs/screenshots/day6-home-stalefix.png` (+ `-alpha.png`) | **NEW** |
| `docs/screenshots/day6-market-stalefix.png` (+ `-alpha.png`) | **NEW** |
| `BUILD-PLAN.md` | **CHANGED** — Day 6 checklist updated |

NOT changed: `server/src/*`, `app/app.json` (package_id rename NOT applied),
`server/data/*`. No secrets in any file or report — coordinator grepped the
Day 6 diff (`gsk_`, real token values) clean; the only `TELEGRAM_BOT_TOKEN`
mention is the placeholder name in README, no value.

## 6. DoraHacks submission-form dry run — NOT DONE (needs browser)

The coordinator cannot operate a live browser. What WAS gathered (public
event page, fetched 24 Nov 18:06 WIB — `dorahacks.io/hackathon/even-realities/detail`):
- Submit: public GitHub/GitLab repo + README explaining setup; demo video up
  to 3 min (simulator or G2); short description (problem, who it is for, how
  it works, track); feature requests: up to 5 things the APIs used were
  missing; optional packaged `.ehpk`.
- Rules: teams 1–4, build during the hackathon, only apps listed in the
  entered tracks, money safety (testnet/paper/read-only, no user funds, no
  financial advice, never commit secrets).
- Judging: Usefulness 25% · Read and write 20% · Technical execution 20% ·
  UX 15% · Business potential and safety 20%.
- Deadline: **29 Nov 23:59 Dubai = 30 Nov 02:59 WIB**. Demo Day 3 Dec.
- **Still needed (parent via browser task, Day 7):** open the actual submit
  form while logged in, fill every field, check validation, note anything
  missing (e.g. video hosting format — YouTube link vs file upload, repo URL
  field, track selection, team members). Do NOT submit during the dry run.

## 7. Known issues / not verified

1. **Mic G2 asli + ring tap (`source=2`):** still needs hardware. All voice
   Day 6 via virtual mic (simulator) + HTTP.
2. **Layar `No open positions`:** still not photographed (needs 0 open
   positions; ledger preserved). Code-review only.
3. **Draft expiry 410 E2E:** still unit-test only.
4. **Tap cap-cycle + tap Reset in simulator:** still not photographed (same
   POST path proven via HTTP + Day 4 Allowlist toggle).
5. **STALE tag live when server is down:** not photographed live (see §4
   caveat) — branch is a display-only ternary on proven mechanism.
6. **Narration not ear-checked** (see §1) — silencedetect + volumedetect only.
7. **.ehpk blocked on package_id hyphen** (see §3) — optional; rename needs
   an explicit decision (changes install identity).
8. **Daily volume $120/$100 (over cap):** a consequence of the demo fill;
   settings are back to defaults. Day 7's final simulator pass will need the
   temporary $200 raise again if it places another demo trade.
9. Coordinator grepped the Day 6 diff for secrets (`gsk_`, real token
   values) — clean; the only `TELEGRAM_BOT_TOKEN` mention is the placeholder
   name in README, no value.

## 8. Final live state (24 Nov ~18:21 WIB, verified by coordinator)

- Server: health OK; settings **defaults** (`isDefault:true`); ledger open 3
  (#2, #4, #5), closed 9, daily **$120/$100**, totalPnl +$3.76,
  realized +$4.14. App screen left on `CLOSED #12`.
- `npm test` 31/31 · `npm run build` clean (86.32 kB).

## 9. Files to upload to the repo (parent via browser)

```
demo/gatekeeper-g2-demo.mp4
README.md
app/src/main.ts
.gitignore
docs/day6-video-notes.md
docs/day6-readme-notes.md
docs/day6-verification.md          (this file)
docs/screenshots/day6-home-stalefix.png
docs/screenshots/day6-home-stalefix-alpha.png
docs/screenshots/day6-market-stalefix.png
docs/screenshots/day6-market-stalefix-alpha.png
BUILD-PLAN.md
```

Do NOT upload: `server/data/paper.json`, `server/data/settings.json`,
`server/server.log`, `app/dist/`, `/tmp/*` (takes, scripts, narration mp3,
frame checks `day6-check-*.png`).
