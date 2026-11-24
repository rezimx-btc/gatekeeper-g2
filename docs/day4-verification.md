# Day 4 verification — Gatekeeper G2, Even Realities DoraHacks

Date: 2026-11-24 (WIB = UTC+7; server times below are UTC unless noted).
Scope: **Positions + Settings** (Telegram mirror DEFERRED — see §7).
Koordinator: dua builder paralel (server + app), lalu integrasi + E2E live oleh
koordinator. Detail per-builder: `docs/day4-server-notes.md`,
`docs/day4-app-notes.md`.

## Files created / changed

| File | Change |
|---|---|
| `server/src/settings.js` | **NEW** — `createSettingsStore(filePath)` + instance default (`server/data/settings.json`). Defaults $25/$100/allowlist ON. `get()` / `update()` (validasi) / `reset()`. |
| `server/src/gate.js` | **CHANGED** — `check()` pakai settings efektif; `POLICY` tetap diekspor sebagai defaults (test lama aman). Allowlist OFF → check allowlist PASS. Field `policy` hasil check = settings efektif. |
| `server/src/voice.js` | **CHANGED** — intent baru: `close` ("Close position N"), `set_cap` (perTrade/daily), `toggle_allowlist`, `reset_settings`. Yes/no turn (draftId) tetap didahulukan; buy tidak berubah. |
| `server/src/index.js` | **CHANGED** — wiring saja: `GET /api/settings`, `POST /api/settings`, `POST /api/settings/reset`. |
| `server/tests/settings.test.js` | **NEW** — 8 unit test (defaults, file korup, update+persist, boundary, validasi, reset). |
| `server/tests/voice.test.js` | **CHANGED** — +5 test parseIntentJson close/settings/reset. |
| `server/package.json` | **CHANGED** — test script menjalankan settings.test.js juga. |
| `server/README.md` | **CHANGED** — endpoint settings + intent suara baru + catatan allowlist OFF. |
| `server/data/settings.json` | Dibuat server (state settings; defaults saat ini). JANGAN upload (state lokal, seperti paper.json). |
| `app/src/main.ts` | **CHANGED** — layar baru `positions` / `settings` / `closeConfirm` / `closed`, navigasi scroll, aksi tap, POST settings + close, routing voice close/settings (`voiceOrigin`). |
| `app/src/voice.ts` | **CHANGED** — `PER_TRADE_CAP_STEPS`, `DAILY_CAP_STEPS`, `nextStep()` + 5 assertion self-test. |
| `docs/day4-server-notes.md`, `docs/day4-app-notes.md` | Catatan verifikasi per-builder. |
| `docs/day4-verification.md` | File ini (koordinator). |
| `docs/screenshots/day4-*.png` (+ `-alpha.png`) | Bukti simulator builder app (13 file) + E2E koordinator (`day4-e2e-*`). |

NOT changed: `server/src/paper.js`, `server/src/markets.js`, `server/src/gate.js`
selain integrasi settings, `app/app.json`, `app/README.md`. No secrets in any
file (grep: tidak ada `gsk_`; `hsurr:` hanya literal prefix di
`voice.js` — `startsWith('hsurr:')`, bukan nilai).

## 1. Unit tests + build (koordinator, re-run setelah kedua builder)

```bash
cd ~/workspace/even-realities/server && npm test
# tests 31, pass 31, fail 0 (gate 4/4 + voice 19/19 + settings 8/8)

cd ~/workspace/even-realities/app && npm run build
# tsc --noEmit && vite build — BERSIH
# dist/assets/index-DMdNXXqh.js  86.28 kB │ gzip: 33.69 kB
```

Server restart sekali oleh builder server: PID lama 3247 → **PID 41266**
(`python3 run-with-groq.py`, health OK). Simulator di-restart koordinator
(09:56 UTC sesi app builder mati oleh double-click exit + pkill);
simulator baru jalan `--automation-port 9898`, `GET /api/ping` → `pong`,
Vite `:5173` 200.

## 2. Settings E2E live (koordinator, via curl — semua read-only kecuali settings)

Ledger awal: open 4 (#2–#5), daily $60/$100, totalPnl -$0.51.

```bash
# S1: set per-trade cap $5
POST /api/settings {"perTradeCapUsd":5}
# → {"perTradeCapUsd":5,...,"isDefault":false}
# S2: gate check 3215006 YES $10 → REJECT, failedRules ["per-trade cap"] SAJA
#     (6 check lain PASS) — bukti gate ikut settings.
# S3: set daily cap $50 (daily terpakai $60)
POST /api/settings {"perTradeCapUsd":25,"dailyCapUsd":50}
# S4: gate check $10 → REJECT, failedRules ["daily cap"] — bukti daily cap efektif.
# S5: POST /api/settings/reset → defaults $25/$100/ON, isDefault true.
# S6: gate check $10 → PASS, policy {perTradeCapUsd:25, dailyCapUsd:100,
#     allowlistEnabled:true, priceSanityPct:0.02, cooldownMs:60000}.
# S7: allowlistEnabled=false → gate check market 999999999: allowlist check PASS
#     ("Allowlist OFF — any market allowed"), verdict tetap REJECT karena price
#     sanity FAIL ("No live price available") — EKSPEKTASI BENAR: harga live hanya
#     ada untuk top-12 Gamma, jadi toggle hanya memengaruhi rule allowlist.
#     Reset setelahnya.
# S8: GET /api/settings akhir → defaults, isDefault true.
```

## 3. Voice close E2E live (koordinator)

```bash
# Posisi tes A: POST /api/paper/place {marketId:"7307311", side:"YES", sizeUsd:10}
# → filled:true, position #7 @ 0.145 (gate PASS 7/7), daily $60→$70.
# Live naik ke 0.205 → unrealized +$4.14.
POST /api/voice {"text":"Close position 7"}
# → {"ok":true,"action":"close","transcript":"Close position 7",
#    "position":{"id":7,"status":"closed","closePrice":0.205,"realizedPnl":4.14}}
# Close ulang: {"ok":false,"action":"close","reason":"No open position #7"} (HTTP 200).
# Ledger: open 5, closed 3, realized +$4.14.
```

Voice close mengeksekusi langsung tanpa konfirmasi kedua — by design: perintah
suara menyebut nomor posisi secara eksplisit. (Tap close tetap lewat layar
konfirmasi, §4.)

## 4. Tap close E2E live di simulator (koordinator)

Posisi tes B: `POST /api/paper/place {marketId:"3215009", side:"YES",
sizeUsd:10}` → filled:true, position **#8 @ 0.031** (gate PASS 7/7,
cooldown 60 dtk dipatuhi antar place), daily $70→$80, open 6.

Simulator (automation port 9898; screenshot via `/api/screenshot/glasses`,
isi di kanal alpha — metode Day 3):

| Langkah | Bukti | Hasil |
|---|---|---|
| Home render | `day4-e2e-home.png` | 2846 lit px |
| Scroll (up) → Positions | `day4-e2e-positions.png` | 3934 lit px: `POSITIONS · PAPER` / `Book +$3.56 · 5 open` / `#2–#5, #8 YES $10` + PnL nyata (`#4 -$0.38`, `#5 -$0.19`) / footer `Settings`, `← Back`. `#7` sudah tidak ada (ditutup via voice, §3). |
| 4x scroll → seleksi `#8` | `day4-e2e-positions-sel8.png` | 3934 lit px: `> #8 YES $10 · PnL $0.00`. |
| Tap → CloseConfirm | `day4-e2e-closeconfirm.png` | 1553 lit px: `CLOSE #8?` / `YES $10 @ $0.03 · PnL $0.00` / `Tap to confirm · swipe to cancel`. |
| Tap → confirm close | `day4-e2e-closed.png` | 951 lit px: **`CLOSED #8 · $0.00 · PAPER`** / `Tap → positions`. |
| Tap → Positions | `day4-e2e-positions-after-close.png` | 3404 lit px: `Book +$3.56 · 4 open`, `#2–#5` saja, `#8` hilang, seleksi di `> Settings`. |

Ledger setelah tap-close: open 4 (#2–#5), closed 4 (#1, #6, #7, #8), daily
$80, totalPnl +$3.56, realized +$4.14.

**Catatan framebuffer basi:** screenshot pertama +3 dtk setelah tap confirm
masih menunjukkan CloseConfirm (sha identik dengan screenshot sebelumnya);
screenshot ulang ~1 menit kemudian menunjukkan Closed yang benar. Ini lag
framebuffer/screenshot simulator yang sama seperti temuan Day 3/4 app builder
(render Home→Positions juga telat ~2–5 dtk karena `refreshData()` menunggu
`/api/markets` ~3,4 dtk). BUKAN bug app — state + ledger sudah benar pada
saat tap; hanya pengambilan screenshot yang ketinggalan. File `day4-e2e-closed.png`
sudah diganti dengan tangkapan ulang yang benar.

## 5. Simulator builder app (a–f, diringkas — detail di docs/day4-app-notes.md)

- (a) Home → scroll → Positions 3367 lit px, 4 posisi + PnL + footer.
- (b) 2x scroll → `>` pindah #2 → #4.
- (c) Tap #2 → CloseConfirm tampil; scroll → batal ke Positions. **Tap
  confirm TIDAK pernah ditekan — tidak ada posisi ditutup dari app.**
- (d) Settings tampil nilai nyata ($25/$100/ON); tap Allowlist → OFF
  (server konfirmasi `allowlistEnabled:false`) → tap lagi → ON
  (`isDefault:true`).
- (e) Settings Back → Positions; Positions Back → Home.
- (f) Regresi: Home tap → Market 3300 lit px → Home; double-click →
  framebuffer 0 lit px. Console 0 error (63 entri).
- Kontrak HTTP diuji: `POST /api/voice {"text":"Close position 99"}` →
  `{ok:false, reason:'No open position #99'}`; `{"text":"Set per-trade cap
  to 10"}` → `{ok:true, action:'settings', ...}`.

## 6. Regresi Day 2 + Day 3 (koordinator, setelah semua E2E Day 4)

```bash
# R1: place $30 (3215006 YES) → HTTP 403, failed ['per-trade cap','daily cap']
#     (daily juga trip: $80+$30 > $100 — benar; per-trade cap decisif).
# R2: duplicate place 7222313 YES $10 → HTTP 403, failed ['duplicate guard'] SAJA.
# R3: POST /api/voice {"text":"Buy ten dollars YES","marketId":"3215006"}
#     → ok:true, draft dft_2f849727f0133355, intent buy YES $10, gate PASS.
# R4: POST /api/voice/cancel {draftId} → {"cancelled":true}.
#     (Tidak di-confirm: jalur confirm→fill tidak diubah Day 4 dan sudah
#     terverifikasi Day 3 via posisi #4/#5; draft PASS + cancel cukup untuk regresi.)
```

## 7. Telegram approval mirror — DITUNDA (menunggu user)

Tidak dikerjakan. Alasan: butuh `TELEGRAM_BOT_TOKEN` dari user (via @BotFather,
2 menit) dan user belum memberikannya. Tidak ada token yang diminta, dibuat,
atau di-hardcode. Bila token datang, scope Day 4-sisa: `POST /api/telegram`
mirror draft + tombol Approve/Reject → jalur gate + paper yang sama.

## 8. Keadaan akhir ledger + server (24 Nov ~10:27 UTC)

- Server PID 41266, `http://127.0.0.1:8787`, health OK. Simulator jalan
  (`--automation-port 9898`, ping pong). Vite `:5173` 200.
- Settings: **defaults** ($25/$100/allowlist ON, `isDefault:true`).
- Ledger (PAPER): open 4 — #2 (7222313 YES $10 @ 0.475), #3 (6977205 YES $10
  @ 0.9995), #4 (3215007 YES $10 @ 0.039), #5 (7222310 YES $10 @ 0.525);
  closed 4 — #1, #6 (voice close builder server), #7 (voice close koordinator,
  realized +$4.14), #8 (tap close koordinator, realized $0.00).
  Daily $80/$100, totalPnl +$3.56, realized +$4.14.
- **Jangan upload** `server/data/paper.json` dan `server/data/settings.json`
  (state tes lokal).

## 9. Yang BELUM terverifikasi + kenapa

1. **Voice close/settings via mic G2 asli + ring tap (`source=2`)** — E2E pakai
   JSON `{text}` (STT dilewati, intent LLM Groq live). Simulator tidak bisa
   injeksi audio/ring; butuh hardware G2 + ring. Jalur audio WAV→Whisper
   tidak berubah dari Day 3.
2. **Layar `No open positions`** — butuh 0 posisi open; tidak diuji karena
   ledger harus mempertahankan #2–#5. Render-nya code-review saja
   (`positionsContent()` punya cabang eksplisit).
3. **Tap cap-cycle + tap Reset di simulator** — jalur POST yang sama terbukti
   via toggle Allowlist di simulator + `nextStep()` lolos unit test + POST
   cap/reset teruji HTTP. Render tap-nya belum difoto.
4. **Draft expiry 410 E2E** — tetap hanya unit-test (sama seperti Day 3).
5. **Render masuk Positions lambat ~3,4 dtk** (menunggu `/api/markets`) —
   perilaku warisan Day 2/3, bukan regresi Day 4; perbaikan opsional Day 5
   (mis. render dari cache dulu).

## 10. Files to upload to the repo (parent via browser)

```
server/src/settings.js
server/src/gate.js
server/src/voice.js
server/src/index.js
server/tests/settings.test.js
server/tests/voice.test.js
server/package.json
server/README.md
app/src/main.ts
app/src/voice.ts
docs/day4-server-notes.md
docs/day4-app-notes.md
docs/day4-verification.md          (this file)
docs/screenshots/day4-*.png        (builder app, 13 files)
docs/screenshots/day4-*.png        (koordinator E2E: day4-e2e-home,
  day4-e2e-positions, day4-e2e-positions-sel8, day4-e2e-closeconfirm,
  day4-e2e-closed, day4-e2e-positions-after-close — masing-masing + -alpha.png)
```

Do NOT upload: `server/data/paper.json`, `server/data/settings.json`,
`server/server.log`, `app/dist/`, `server/test-audio/raw.pcm` (jika ada).
