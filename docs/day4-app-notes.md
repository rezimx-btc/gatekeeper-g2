# Day 4 — Positions / Settings / Close (app) — catatan builder

Tanggal: 24 Nov 2026. App: `app/src/main.ts` (+ helper murni di `app/src/voice.ts`).
Server TIDAK disentuh. Tidak ada submit DoraHacks / GitHub / push. Tidak ada
secret di file atau laporan ini. Tidak ada posisi #1–#5 yang ditutup;
tidak ada `POST /api/paper/close` dari app selama sesi ini.

## File yang dibuat / diubah

- `app/src/main.ts` — layar baru `positions` / `settings` / `closeConfirm` /
  `closed`, navigasi scroll Home → Positions, seleksi via swipe, aksi tap per
  baris, POST settings + close, routing voice close/settings (`voiceOrigin`).
- `app/src/voice.ts` — BARU (Day 4): `PER_TRADE_CAP_STEPS`,
  `DAILY_CAP_STEPS`, `nextStep()` + 5 assertion self-test.
- `app/app.json` — TIDAK diubah. Tidak ada dependensi npm baru.
- `docs/day4-app-notes.md` — file ini.
- `docs/screenshots/day4-*.png` (+ varian `-alpha.png`) — bukti simulator.

## 1. Yang diimplementasi

### Layar `positions`
- Header `POSITIONS · PAPER` + ringkasan `Book <totalPnl> · <N> open` (nilai
  nyata dari `GET /api/paper`, posisi sudah ter-mark live oleh server).
- Baris per posisi open: `#<id> <SIDE> $<size> · PnL <+/-$x.xx>`, lalu footer
  `Settings` dan `← Back`. Posisi kosong → `No open positions` + footer tetap
  ada (kode ada; tidak bisa diuji live karena posisi open selalu ada).
- Seleksi: swipe up = baris berikut, swipe down = baris sebelum, wrap di
  ujung; baris terpilih ditandai `>` di depan.
- Data dari `refreshData()` yang sudah ada, ditambah fetch `GET /api/settings`
  di panggilan yang sama. Settings 404 (endpoint belum mendarat saat build
  awal) TIDAK merusak refresh dan TIDAK menghapus nilai settings yang sudah
  bagus — nilai lama dipertahankan.

### Layar `settings`
- Header `SETTINGS · PAPER`, 5 baris: `Per-trade cap $<n>`, `Daily cap $<n>`,
  `Allowlist ON|OFF`, `Reset defaults`, `← Back`. Seleksi via swipe (sama
  seperti Positions).
- Tap cap → naik ke langkah berikut lalu `POST /api/settings`
  (per-trade `[5,10,15,20,25,30,40,50,75,100]`, daily
  `[25,50,75,100,150,200,300,500,1000]`, wrap ke awal; `nextStep()` di
  `voice.ts`). Tap allowlist → toggle + POST. Tap reset →
  `POST /api/settings/reset`. Tap Back → Positions.
- Setelah tiap POST, nilai di layar = respons server (konfirmasi). Bila POST
  gagal (400/network) alasan singkat tampil di layar Settings, tidak crash.
- Bila settings belum pernah berhasil di-fetch, nilai tampil `—` dan tap cap/
  allowlist menampilkan `Settings unavailable` (tidak crash, tidak POST).

### Layar `closeConfirm` / `closed`
- `closeConfirm`: `CLOSE #<id>?` + `<SIDE> $<size> @ <harga> · PnL <+/-$x.xx>`
  (harga = `livePrice` bila ada, kalau tidak `entryPrice`) +
  `Tap to confirm · swipe to cancel`. Tap → `POST /api/paper/close {id}` →
  layar `closed`; swipe → batal kembali ke Positions. Close 404 → kembali ke
  Positions + refresh; gagal lain → Positions + alasan singkat (`posNote`).
- `closed`: `CLOSED #<id> · <+/-$x.xx> · PAPER` (realizedPnl nyata dari
  respons) + `Tap → positions`. Tap → Positions + `refreshData()`.

### Navigasi (Day 2/3 tidak berubah kecuali yang disebut)
- Home: tap → Market (TETAP). Scroll → Positions (BARU).
- Market: tap → Home, scroll/ring → voice (TETAP).
- Positions: scroll → pindah seleksi (BUKAN voice — beda dengan Market);
  tap → posisi: closeConfirm; Settings: settings; Back: Home. Ring → voice.
- Settings: scroll → pindah seleksi; tap → aksi baris. Ring → voice.
  Back → Positions.
- CloseConfirm: tap → confirm close; scroll → batal → Positions.
  Closed: tap → Positions.
- Double-tap → exit dari layar mana pun (TETAP, root-level).

### Voice (`sendDraftVoice`, mode draft)
- Buy draft → Draft seperti Day 3 (TETAP).
- `action==='close' && ok && position` → layar `closed` dengan posisi itu
  (realizedPnl nyata) + refresh data.
- `action==='close' && !ok` → reason singkat di layar Positions (`posNote`),
  tetap di Positions.
- `action==='settings' && ok` → refresh settings + tampil layar Settings.
- `action==='settings' && !ok` → reason di layar asal voice.
- Non-buy lain / network error → layar asal voice, bukan selalu Market.
- Asal voice dilacak `voiceOrigin` (`market` | `positions` | `settings`):
  ring/scroll dari Positions/Settings mengisinya; kegagalan mic (`Mic
  unavailable`), `No audio heard`, dan error voice kembali ke layar asal
  dengan pesan di layar itu. Mode Yes/No tidak berubah (tetap di Draft).
- Ring tap di CloseConfirm/Closed TIDAK memicu voice (tidak didefinisikan
  tugas) — diperlakukan sebagai tap biasa (confirm / ke Positions).
- Harga close: `fmtPrice` yang sama dengan Day 3 (0.475 → `$0.47` karena
  `toFixed(2)` atas representasi float 0.474999…; konsisten dengan helper
  yang sama, bukan bug baru).

## 2. Build + unit test

```
cd ~/workspace/even-realities/app && node --experimental-strip-types src/voice.ts
# 32 assertion OK (Day 3: 27 + Day 4: 5 nextStep) — SELF-TEST PASSED

cd ~/workspace/even-realities/app && npm run build
# tsc --noEmit && vite build — BERSIH
# vite v5.4.21 building… ✓ 6 modules transformed
# dist/assets/index-DMdNXXqh.js  86.28 kB │ gzip: 33.69 kB ✓ built in 673ms
```

String Day 4 terkonfirmasi ada di bundle produksi (`dist/assets/*.js`):
`POSITIONS` (3x), `SETTINGS` (1x), `CLOSE #` (1x), `CLOSED #` (1x),
`No open positions` (1x), `Per-trade cap` (1x), `Allowlist` (1x),
`Reset defaults` (1x), `Tap to confirm` (1x), `Tap → positions` (1x).

## 3. Kontrak server (dibaca + diuji HTTP, bukan diubah)

Saat build awal, `GET /api/settings` masih 404 (server builder paralel belum
restart). Saat verifikasi simulator, endpoint SUDAH mendarat (server
di-restart builder paralel; PID 3247 lama sudah tidak ada):

- `GET /api/settings` → `{"perTradeCapUsd":25,"dailyCapUsd":100,
  "allowlistEnabled":true,"defaults":{…},"isDefault":true}`.
- `POST /api/settings {"perTradeCapUsd":30}` → 200, nilai berubah.
  `POST {"perTradeCapUsd":999}` → 200 juga (server tidak memvalidasi langkah;
  app hanya pernah mengirim nilai langkah, jadi tidak masalah).
- `POST /api/settings/reset` → 200 defaults, `isDefault:true`.
- `POST /api/voice {"text":"Close position 99"}` →
  `{"ok":false,"action":"close","transcript":"Close position 99",
  "reason":"No open position #99"}` — persis bentuk yang dipakai cabang
  `!ok` app (reason → Positions).
- `POST /api/voice {"text":"Set per-trade cap to 10"}` →
  `{"ok":true,"action":"settings","transcript":"…",
  "settings":{"perTradeCapUsd":10,…,"isDefault":false}}` — persis bentuk yang
  dipakai cabang `ok` app (refresh + tampil Settings). Setelah uji, settings
  di-reset ke defaults ($25/$100/ON, `isDefault:true`).
- `POST /api/voice {"text":"Close position 2"}` SENGAJA TIDAK diuji — itu
  akan menutup posisi tes #2. Bentuk sukses close (`{ok:true,
  action:'close', position:{id, realizedPnl, …}}`) hanya dipercaya dari
  kontrak tugas; verifikasi live-nya menjadi bagian E2E close koordinator.

## 4. Verifikasi simulator (0.9.5, automation port 9898)

Simulator di-restart untuk sesi ini
(`xvfb-run -a evenhub-simulator --automation-port 9898 http://localhost:5173`,
`GET /api/ping` → `pong`). Screenshot via `/api/screenshot/glasses`, isi
layar di kanal ALPHA (metode Day 3); lit px = kanal alpha > 10, 576×288.
Console sepanjang sesi: **63 entri, 0 error**.

### (a) Home → scroll → Positions — TERVERIFIKASI
- Home render 2829 lit px (`day4-home.png`): `Book $0.00 · 4 open`.
- `POST /api/input {"action":"up"}` → `textEvent eventType:1`
  (SCROLL_TOP) → screen pindah ke Positions. Screenshot pertama (2 dtk
  setelah input) MASIH menampilkan Home — ini jebakan timing, bukan bug
  navigasi: `refreshData()` menunggu `GET /api/markets` yang butuh **3,37 dtk**
  (diukur via curl; `/api/paper` 0,8 ms, `/api/settings` 0,6 ms). Bukti
  navigasi sudah terjadi: log console berikutnya `tap: screen= positions`.
  Screenshot ulang setelah 5 dtk: Positions 3367 lit px
  (`day4-positions2.png`): `POSITIONS · PAPER` / `Book $-0.51 · 4 open` /
  `> #2 YES $10 · PnL $0.00` / `#3 YES $10 · PnL $0.00` /
  `#4 YES $10 · PnL $-0.51` / `#5 YES $10 · PnL $0.00` / `Settings` /
  `← Back`. PnL nyata dan berubah selama sesi (#4 $0.00 → $-0.51).

### (b) Seleksi pindah — TERVERIFIKASI
- Dari `> #2`, 2x scroll up → `> #4` (`day4-positions-sel2.png`, 3367 lit
  px). Pindah seleksi hanya `refreshDisplay()` (tanpa fetch), render cepat.

### (c) Tap posisi → CloseConfirm; scroll → batal — TERVERIFIKASI
- Tap saat `> #2` → `CLOSE #2?` / `YES $10 @ $0.47 · PnL $0.00` /
  `Tap to confirm · swipe to cancel` (`day4-closeconfirm.png`, 1539 lit px).
- Scroll → batal kembali ke Positions — bukti screenshot-nya
  `day4-positions2.png` (diambil setelah scroll batal; layar Positions
  dengan `> #2`, sama seperti §4a). **Tap confirm TIDAK pernah
  ditekan — tidak ada posisi yang ditutup dari app.**

### (d) Settings + toggle Allowlist — TERVERIFIKASI
- Dari Positions, 2x scroll (posSel 2→4 `Settings`) + tap → layar Settings
  2017 lit px (`day4-settings.png`): `SETTINGS · PAPER` /
  `> Per-trade cap $25` / `Daily cap $100` / `Allowlist ON` /
  `Reset defaults` / `← Back` — nilai nyata.
- 2x scroll ke `Allowlist` + tap → `> Allowlist OFF`
  (`day4-settings-off.png`, 2029 lit px); server mengonfirmasi
  `allowlistEnabled:false, isDefault:false`.
- Tap lagi → `Allowlist ON` (`day4-settings-on.png`, 2017 lit px); server
  `allowlistEnabled:true, isDefault:true`. Settings kembali ke defaults.
- Tap baris cap (cycle 25→30) TIDAK diuji via simulator (sudah tercakup
  helper + POST HTTP §3; toggle membuktikan jalur POST + render ulang yang
  sama). Reset via tap juga tidak diuji via simulator (POST reset teruji
  HTTP §3).

### (e) Back → Positions → Home — TERVERIFIKASI
- Settings: 2x scroll ke `← Back` + tap → Positions
  (`day4-back-positions.png`, 3367 lit px), seleksi tetap di `> Settings`.
- Positions: 1x scroll ke `← Back` + tap → Home
  (`day4-back-home.png`, 2824 lit px): `Book $-0.51 · 4 open`.

### (f) Regresi Day 2/3 — TERVERIFIKASI
- Home tap → Market 3300 lit px (`day4-market2.png`): odds, volume, ends,
  kaki `Ring / swipe: voice · tap: home` — sama seperti Day 3.
- Market tap → Home 2824 lit px (`day4-home2.png`).
- `POST /api/input {"action":"double_click"}` (catatan: `doubleclick` tanpa
  underscore DITOLAK API: `invalid action 'doubleclick', expected: up, down,
  click, double_click, long_press, long_press_release, context_menu`) →
  `eventType:3` (DOUBLE_CLICK_EVENT) → framebuffer kosong, **0 lit px**
  (`day4-exit.png`). Console 0 error (63 entri).

## 5. Yang BELUM terverifikasi + kenapa

1. **Layar `closed` di kaca: BELUM.** Hanya bisa dicapai lewat close sukses
   (tap confirm atau voice close) — keduanya menutup posisi sungguhan dan
   dilarang untuk #1–#5. Logika konten + routing responsnya ditinjau baris
   per baris dan bentuk respons suksesnya ada di kontrak; render live-nya
   menjadi bagian E2E close koordinator (posisi tes khusus).
2. **Voice close/settings end-to-end lewat mic: BELUM.** Simulator tidak
   bisa injeksi audio PCM maupun ring tap (`source=2` tidak pernah terlihat;
   tap simulator mengisi `source=1`). Yang terverifikasi: bentuk respons
   server untuk kedua aksi di level HTTP (§3) cocok persis dengan cabang
   yang ditulis app, dan jalur error mic / `No audio heard` kembali ke layar
   asal sudah ada kodenya (`voiceOrigin`) — tapi belum pernah dieksekusi
   live. Butuh hardware G2 + ring, atau E2E koordinator.
3. **Layar kosong `No open positions`: BELUM.** Membutuhkan 0 posisi open;
   tidak bisa dibuat tanpa menutup #2–#5. Hanya tinjauan kode.
4. **Tap cap cycle + tap Reset di simulator: BELUM** (lihat §4d). Jalur POST
   yang sama terbukti lewat toggle Allowlist; `nextStep()` lolos unit test;
   POST cap/reset teruji HTTP. Risiko sisa kecil.
5. **Render lambat saat masuk Positions (~3,4 dtk): CATATAN, bukan blocker.**
   `refreshData()` menunggu `GET /api/markets` (3,37 dtk) sebelum render
   apa pun, jadi layar Positions baru muncul ~3,4 dtk setelah swipe — layar
   sempat menampilkan Home lama. Perilaku ini berasal dari Day 2/3
   (`refreshData` dipakai bersama) dan TIDAK diubah di Day 4; perbaikan
   (render posisi dari cache dulu / fetch markets paralel tanpa blokir)
   diserahkan ke koordinator bila dianggap perlu.

## 6. Perubahan ledger selama sesi (bukan oleh app ini)

- Awal sesi: open 4 (#2–#5), closed 1 (#1), daily $50, totalPnl $0.00.
- Selama sesi, server di-restart builder paralel (PID 3247 hilang) dan
  `data/paper.json` mendapat **posisi #6 (closed)** — dibuat + ditutup oleh
  pengujian builder paralel (atau koordinator), BUKAN oleh app ini: app
  tidak pernah `POST /api/paper/close` (tidak ada tap confirm; `grep
  paper/close server.log` = 0), dan #2–#5 tetap open sepanjang sesi.
- Akhir sesi: open 4 (#2–#5), closed 2 (#1, #6), daily $60.
  TotalPnl bergerak $0.00 → $-0.51 (live mark #4) selama verifikasi.
- Settings akhir: defaults ($25/$100/ON, `isDefault:true`) — dipulihkan
  setelah uji toggle + uji HTTP.

## 7. File untuk di-upload ke repo (app side)

```
app/src/main.ts
app/src/voice.ts
docs/day4-app-notes.md
docs/screenshots/day4-home.png
docs/screenshots/day4-home-alpha.png
docs/screenshots/day4-positions2.png
docs/screenshots/day4-positions2-alpha.png
docs/screenshots/day4-positions-sel2.png
docs/screenshots/day4-positions-sel2-alpha.png
docs/screenshots/day4-closeconfirm.png
docs/screenshots/day4-closeconfirm-alpha.png
docs/screenshots/day4-settings.png
docs/screenshots/day4-settings-alpha.png
docs/screenshots/day4-settings-off.png
docs/screenshots/day4-settings-off-alpha.png
docs/screenshots/day4-settings-on.png
docs/screenshots/day4-settings-on-alpha.png
docs/screenshots/day4-back-positions.png
docs/screenshots/day4-back-positions-alpha.png
docs/screenshots/day4-back-home.png
docs/screenshots/day4-back-home-alpha.png
docs/screenshots/day4-market2.png
docs/screenshots/day4-market2-alpha.png
docs/screenshots/day4-home2.png
docs/screenshots/day4-home2-alpha.png
docs/screenshots/day4-exit.png
docs/screenshots/day4-exit-alpha.png
```

Do NOT upload: `server/data/paper.json` (ledger tes), `server/server.log`.
