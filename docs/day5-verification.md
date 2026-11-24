# Day 5 verification — Gatekeeper G2, Even Realities DoraHacks

Date: 2026-11-24 (WIB = UTC+7; server times below are UTC unless noted).
Scope: **polish + proof** (BUILD-PLAN.md Day 5). Telegram mirror still
DEFERRED (no token from user — not attempted, not asked). No DoraHacks
submit, no GitHub upload/push, no demo video recorded, no README change,
no submission-form dry run (all Day 6/7, parent scope).

Koordinator: semua E2E + error states dijalankan live oleh koordinator
sendiri (virtual mic, lihat §0). `docs/day5-video-plan.md` ditulis oleh
subagent (1 anak), diintegrasi + diverifikasi koordinator (x11grab diuji
koordinator, §6).

## 0. Prasyarat baru — virtual mic (kunci seluruh Day 5)

Day 3/4: layar Draft/Filled TIDAK PERNAH ter-render di simulator karena
simulator tidak bisa injeksi audio ("Mic unavailable"). Day 5 memecahkan
ini dengan mic virtual — pertama kali voice loop penuh jalan di kaca:

```bash
apt-get install -y pulseaudio pulseaudio-utils libasound2-plugins alsa-utils
pulseaudio --start --exit-idle-time=-1        # XDG_RUNTIME_DIR=/tmp/xdg-runtime-root
pactl load-module module-null-sink sink_name=virtmic sink_properties=device.description=virtmic
pactl load-module module-remap-source master=virtmic.monitor source_name=virtmic_src source_properties=device.description=virtmic_src
pactl set-default-source virtmic_src ; pactl set-default-sink virtmic
# /etc/asound.conf: pcm.!default { type pulse } + ctl.!default { type pulse }
evenhub-simulator --list-audio-input-devices  # → alsa:null, alsa:pulse, alsa:default
# Simulator di-restart: xvfb-run -a evenhub-simulator --automation-port 9898 --aid alsa:default http://localhost:5173
paplay --device=virtmic server/test-audio/buy-ten-yes.wav   # saat app listening
```

Bukti plumbing: `parec --device=virtmic_src` sambil memutar WAV menangkap
suara nyata (max amplitude 19237, 11517/54414 sampel > |500|). Bukti
ujung-ke-ujung: console simulator menampilkan event `audioPcm` yang
mengalir, layar Listening tampil (bukan "Mic unavailable"), Whisper
mentranskrip "Buy $10 yes." → draft → fill. File test: `/tmp/test-virtmic.sh`
(di /tmp, tidak di repo).

Catatan: VM tidak punya audio stack sama sekali sebelumnya (tanpa
`/dev/snd`, tanpa pactl/arecord). PulseAudio + null sink adalah instalasi
baru di VM ini; Day 6 harus memastikan daemon + modul masih jalan
(cek `pactl list sinks | grep virtmic` — ada di checklist video plan).

## Files created / changed

| File | Change |
|---|---|
| `app/src/main.ts` | **CHANGED** — `refreshData()` (§5): paper + settings diterapkan + render dulu, markets menyusul. Tidak ada perubahan perilaku lain. |
| `server/test-audio/buy-thirty-yes.wav` (+`.mp3`) | **NEW** — gTTS "Buy thirty dollars YES", PCM s16le 16 kHz mono. |
| `server/test-audio/unclear.wav` (+`.mp3`) | **NEW** — gTTS "Um, uh, hmm", PCM s16le 16 kHz mono. |
| `server/test-audio/close-ten.wav` (+`.mp3`) | **NEW** — gTTS "Close position ten" (dibuat; belum dipakai — opsi close via suara Day 6). |
| `docs/day5-video-plan.md` | **NEW** — setup perekaman video Day 6 (subagent; §6). |
| `docs/day5-verification.md` | **NEW** — file ini. |
| `docs/shot.py`, `docs/poll.py` | **NEW** — helper dev: screenshot glasses + ekstraksi kanal alpha + hitung lit px; polling lit px (ukur lag). Dipindah dari `docs/screenshots/` supaya folder itu hanya berisi PNG. |
| `docs/screenshots/day5-*.png` (+ `-alpha.png`) | **NEW** — 31 pasang bukti (§1–§5). Varian `-alpha.png` = kanal alpha sebagai grayscale (isi layar ada di alpha, RGB hijau polos). |
| `BUILD-PLAN.md` | **CHANGED** — checklist Day 5 dicentang. |

NOT changed: `server/src/*` (tidak ada perubahan server), `app/app.json`,
`app/README.md`, `README.md` (Day 6). Tidak ada secret di file atau
laporan (grep: tidak ada `gsk_` di `app/src/main.ts` + `server/src/*.js`).

## 1. Unit tests + build (final, setelah perbaikan §5)

```bash
cd ~/workspace/even-realities/server && npm test
# tests 31, pass 31, fail 0 (gate 4/4 + voice 19/19 + settings 8/8)

cd ~/workspace/even-realities/app && npm run build
# tsc --noEmit && vite build — BERSIH
# dist/assets/index-Bf_FaZnG.js  86.29 kB │ gzip: 33.69 kB
```

## 2. E2E lengkap di simulator (tanpa Telegram)

Ledger awal: open 3 (#2, #4, #5 — #3 sudah ditutup Day 4? TIDAK: awal Day 5
open 4 #2–#5, closed 4, daily $80, totalPnl +$3.76). Top market sepanjang
hari: `6977205` "New NVIDIA CEO named by December 31, 2026?" YES 0.9995
(app selalu memakai `markets[0]` untuk voice buy). Spot: BTC $59.796 /
ETH $1.683,87.

| # | Langkah | Bukti | Hasil |
|---|---|---|---|
| 1 | Glance Home | `day5-home.png` (2836 lit px) | `GATEKEEPER · PAPER` / NVIDIA CEO / `YES 100% · 24h $3.2M` / `Book +$3.76 · 4 open` / `Tap → market` |
| 2 | Tap → Market | `day5-market.png` (3300 lit px) | Odds YES 100% / NO 0%, Vol 24h $3.2M, ends 2027-01-01, kaki `Ring / swipe: voice · tap: home` |
| 3 | Swipe di Market → listening | `day5-listening.png` (1409 lit px) | `Listening... / Say 'buy $10 YES' / Tap to send` — mic TERBUKA (virtual mic), bukan "Mic unavailable" |
| 4 | Voice "Buy ten dollars YES" → draft | `day5-draft-reject.png` | **REJECT — duplicate guard** (posisi #3 open di 6977205 YES). Ini error state (a), lihat §3. Draft di-dismiss via tap. |
| 5 | Tutup #3 via tap (membebaskan top market) | `day5-closeconfirm3.png` → `day5-closed3.png` | `CLOSE #3? / YES $10 @ $1.00 · PnL $0.00` → `CLOSED #3 · $0.00 · PAPER`. Ledger: open 3, closed 5, daily $80. |
| 6 | Voice buy ulang → draft PASS | `day5-yesno-listening.png` (1295 lit px) | Layar `Say Yes or No / Listening...` — layar ini HANYA muncul setelah draft PASS (auto-listen Yes/No). Gate independen: `GET /api/gate/check?marketId=6977205&side=YES&sizeUsd=10` → PASS 7/7. |
| 7 | Voice "Yes" → fill | `day5-filled9.png` (1817 lit px) | **`FILLED $10 YES @ $1.00 · Position #9 · PAPER`**. Ledger: open 4, closed 5, daily $90. Posisi #9: 6977205 YES $10 @ 0.9995, 10.005 shares. |
| 8 | Positions (PnL live) | `day5-positions-with-9.png` (3403 lit px) | `Book +$3.76 · 4 open` / `#2, #4, #5, #9 YES $10 · PnL` (live, #4 -$0.38) / `Settings` / `← Back` |
| 9 | Tutup #9 via tap | `day5-closeconfirm9b.png` → `day5-closed9.png` | `CLOSE #9? / YES $10 @ $1.00 · PnL $0.00` → `CLOSED #9 · $0.00 · PAPER`. Ledger: open 3, closed 6, daily $90. |
| 10 | (Regresi build baru, §5) Voice buy → Yes → fill #11 | `day5-filled11.png` | `FILLED $10 YES @ $1.00 · Position #11 · PAPER` (daily cap dinaikkan sementara ke $200, lalu reset — lihat §5). |
| 11 | Tutup #11 via tap | `day5-closeconfirm11.png` → `day5-closed11.png` | `CLOSE #11?` → `CLOSED #11 · $0.00 · PAPER`. Ledger akhir: open 3, closed 8, daily $110. |

Catatan langkah 6: layar Draft PASS sendiri hampir tidak mungkin ditangkap
langsung — setelah draft PASS, app langsung membuka listening Yes/No
(~100 ms) sehingga layarnya tertutup. Draft PASS berhasil difoto di
percobaan terpisah (langkah 6b, lihat bawah).

### 6b. Layar Draft PASS (difoto via 2x unclear)

Setelah #10 ditutup (langkah 9b di bawah), voice buy ketiga dibuat
(daily cap sementara $200 supaya PASS; #10 sudah ditutup jadi tidak
duplikat). Setelah draft PASS + auto-listen Yes/No, audio unclear
dimainkan 2x (tanpa tap pada yang kedua — dikirim oleh timer 8 dtk):
`unclearCount` mencapai 2 → mic mati → layar kembali ke Draft dan
menetap. Screenshot:

- `day5-draft-pass3.png`: **`BUY $10 YES @ $1.00` · `Gate: PASS 7/7` ·
  `Tap / ring / "Yes" to confirm`** — layar uang persis seperti
  DESIGN.md §2 (7 checks, bukan 5 seperti contoh desain).
- Draft lalu dibatalkan via scroll (`day5-after-cancel3.png` → Market);
  TIDAK di-fill (daily tetap $100 saat itu). Settings di-reset ke
  defaults segera setelahnya (`isDefault:true`).

### 9b. Posisi #10 (tap-confirm, di antara #9 dan #11)

Setelah #9 ditutup: voice buy → draft PASS → Yes/No listening →
unclear #1 (tap kirim, heard unclear, hitung 1, listen ulang) →
unclear #2 (timer 8 dtk mengirim, heard unclear, hitung 2, mic mati)
→ layar Draft PASS → **tap** (bukan suara) → fill. Hasil:
`day5-filled10.png`: `FILLED $10 YES @ $1.00 · Position #10 · PAPER`.
#10 lalu ditutup via tap (`day5-closeconfirm10.png` →
`day5-closed10.png`, `CLOSED #10 · $0.00 · PAPER`). Ledger saat itu:
open 3, closed 7, daily $100.

Insiden selama E2E (bukan bug app): pada percobaan tutup #9, seleksi
sempat mendarat di #4 bukan #9 (posSel bertahan dari kunjungan
sebelumnya — perilaku seleksi yang persisten, bukan reset ke baris
pertama). CloseConfirm #4 tampil (`day5-closeconfirm9.png`, lalu
dihapus) — TIDAK dikonfirmasi; scroll membatalkan, seleksi dipindah
ke #9 (`day5-positions-sel9.png`), baru ditutup. Pelajaran untuk
demo Day 6: selalu baca layar CloseConfirm sebelum tap confirm.

## 3. Error states — ketiganya dibuktikan live

### (a) Gate REJECT dengan alasan di layar — TERBUKTI (2 varian)

- **Duplicate guard:** `day5-draft-reject.png` — `BUY $10 YES @ $1.00` /
  `Gate: REJECT — duplicate guard` / `Tap to dismiss`. Gate independen:
  6/7 PASS, hanya duplicate FAIL ("An open YES position already exists
  on this market"). Draft di-dismiss, tidak ada fill.
- **Per-trade cap ($30):** `day5-draft-reject30.png` — `BUY $30 YES @ $1.00`
  / `Gate: REJECT — per-trade cap` / `Tap to dismiss`. HTTP: draft
  dibuat, gate REJECT, `failedRules: ['per-trade cap', 'daily cap']`
  (daily juga trip: $80+$30 > $100 — per-trade cap yang tampil karena
  aturan gagal pertama). Draft di-dismiss, tidak ada fill.

### (b) API down — TERBUKTI (3 fase)

Server dimatikan (`kill` PID 41266; `GET /health` gagal):

1. **Data basi tanpa peringatan (temuan, §7):** dengan data lama di
   cache app, Home + Positions tetap menampilkan data lama TANPA
   indikasi error apa pun (`day5-apidown-home-stale.png`,
   `day5-apidown-positions-stale.png` — identik dengan sebelum mati).
2. **Fresh start → layar error jelas:** simulator di-restart saat
   server masih mati → `day5-apidown-home-fresh.png`: **`Market data
   unavailable. / Load failed / Tap to retry`**.
3. **Pulih:** server di-restart (`python3 run-with-groq.py`, PID baru;
   Groq terbukti hidup via `/api/voice` greeting → ok:false) → tap di
   simulator → `day5-apidown-recovered.png`: Market live kembali
   (NVIDIA CEO, YES 100% / NO 0%, Vol $3.2M).

### (c) Voice unclear — TERBUKTI (2 jalur)

Audio: gTTS "Um, uh, hmm" (`server/test-audio/unclear.wav`).

- **Mode draft:** `day5-unclear-market.png` — Market menampilkan
  `Hum, uh, hum: unrecognized command` (+ kaki normal). HTTP:
  transcript "Um, uh, hem." → `{ok:false, reason:"Unrecognized
  command."}` — tidak ada draft, tidak ada fill. (Transkripsi live
  sedikit berbeda dengan HTTP — "Hum, uh, hum." vs "Um, uh, hem." —
  variansi Whisper, hasil sama.)
- **Mode Yes/No:** 2x unclear → `unclearCount` 2 → mic mati, layar
  tetap di Draft (jalur ini yang dipakai untuk memfoto Draft PASS,
  §2 langkah 6b). Tidak ada fill liar pada kedua jalur.

## 4. Simulator screenshots (headless, automation API)

Semua via `GET /api/screenshot/glasses` (port 9898) + input via
`POST /api/input` (`up`/`down`/`click`/`double_click`). Isi layar ada
di kanal **alpha** (RGBA 576×288); helper `docs/shot.py` mengekstrak
alpha → `-alpha.png` + hitung lit px (alpha > 10).

Daftar bukti baru (36 pasang): `day5-home`, `day5-home2`,
`day5-market`, `day5-listening`, `day5-yesno-listening`,
`day5-draft-reject`, `day5-draft-reject30`, `day5-draft-pass3`,
`day5-filled9`, `day5-filled10`, `day5-filled11`,
`day5-positions`, `day5-positions-sel3`, `day5-positions-sel9`,
`day5-positions-with-9`, `day5-positions-with-10`,
`day5-positions-with-11`, `day5-positions-after-close3`,
`day5-closeconfirm3/9b/10/11`, `day5-closed3/9/10/11`,
`day5-unclear-market`, `day5-apidown-home-stale`,
`day5-apidown-positions-stale`, `day5-apidown-home-fresh`,
`day5-apidown-recovered`, `day5-positions-fast-1s`,
`day5-positions-fast-4s`, `day5-after-dismiss`,
`day5-after-dismiss30`, `day5-after-cancel3`.

Catatan framebuffer basi (sudah dikenal Day 3/4): screenshot 2 dtk
setelah aksi sering masih menampilkan layar lama. Semua screenshot
bukti di atas diambil ulang 5–7 dtk setelah aksi (file yang terbukti
basi dihapus saat sesi: `day5-closed3` pertama + `day5-closeconfirm9`
pertama + duplikat `day5-listening-now-alpha`).

## 5. Perbaikan kecil — render Positions lambat (SELESAI + terverifikasi)

Temuan (Day 4, dikonfirmasi Day 5): masuk Positions menunggu
`/api/markets` — 0,03 dtk saat cache hangat, **3,49 dtk saat cache
dingin (30 dtk)**; `/api/paper` 0,008 dtk, `/api/settings` 0,007 dtk.
`refreshData()` lama menunggu ketiganya (Promise.all) + parse markets
dulu sebelum menerapkan paper.

Perbaikan (`app/src/main.ts`, `refreshData()` saja — tidak ada jalur
lain yang berubah): paper + settings diterapkan + `refreshDisplay()`
dulu, markets menyusul; gagalnya markets tidak lagi membuang paper
yang sudah segar.

Pengukuran sesudah perbaikan (server + simulator di-restart fresh —
cache markets dingin, state app kosong; probe `/tmp/lag-probe.py`):
Home render 4,43 dtk setelah start; scroll ke Positions; **+1,0 dtk:
layar Positions sudah menampilkan daftar lengkap** (`#2, #4, #5` +
PnL — `day5-positions-fast-1s.png`); +4,0 dtk identik. Pembanding
Day 4: screenshot 2 dtk setelah input MASIH menampilkan Home.
Caveat jujur: lag framebuffer simulator (~5 dtk) membuat pengukuran
waktu lewat screenshot tidak presisi milidetik; yang diukur adalah
waktu tampil daftar posisi (bukan janji latensi jaringan). Mekanisme
didukung angka server (markets 3,49 dtk dingin vs paper 0,008 dtk).

Regresi setelah perbaikan (build baru, simulator fresh):

```bash
# npm test 31/31 + npm run build bersih (lihat §1).
# Voice buy → draft PASS → voice "Yes" → fill #11 → tap close #11:
#   FILLED $10 YES @ $1.00 · Position #11 · PAPER (daily cap sementara
#   $200, lalu reset ke defaults — isDefault:true terverifikasi).
#   CLOSED #11 · $0.00 · PAPER.
# HTTP (tanpa fill): place $30 → 403 failed ['per-trade cap','daily cap',
#   'cooldown']; duplicate 7222313 YES $10 → 403 failed ['daily cap',
#   'duplicate guard','cooldown']; voice buy JSON → draft dibuat, gate
#   REJECT (daily cap — daily $110/$100 saat itu).
# Catatan: 'cooldown' ikut trip pada dua cek pertama karena #11 baru
#   di-fill <60 dtk sebelumnya — perilaku benar, bukan bug. Aturan
#   decisif (per-trade cap / duplicate guard) hadir di keduanya.
# "place $10 PASS" tidak diulang via HTTP setelah perbaikan karena daily
#   penuh ($110/$100); sudah terbukti live 2x di build baru via voice
#   fill #11 (dan #9/#10 sebelum perbaikan — jalur place tidak berubah).
```

## 6. Setup perekaman video demo Day 6

`docs/day5-video-plan.md` (ditulis subagent, 121 baris): jalur utama
ffmpeg x11grab atas display Xvfb + suara nyata via virtual mic;
fallback rangkaian screenshot + narasi; naskah 7 babak ~160 dtk;
checklist pra-rekam (termasuk peringatan daily cap penuh — naikkan
sementara lalu reset); risiko + mitigasi.

**Diuji koordinator (bukan cuma rencana):** take uji 10 dtk
`ffmpeg -f x11grab -video_size 1280x1024 -framerate 15 -i :103`
→ file valid (10,00 dtk, h264, 1280×1024, 15 fps, 44.761 byte).
Frame yang dibaca: panel kiri "Companion app is running" (kosong —
webview tidak merender app), panel kanan **kaca hijau terbaca**
("GATEKEEPER · PAPER / New NVIDIA CEO... / YES 100% · 24h $3.2M /
Book +$3.76 · 3 open") + tombol kontrol simulator. Area kaca di frame
1280×1024 kira-kira **x 640–1270, y 100–330** — crop ke area itu
(atau rekam full window, crop di post). Display Xvfb BERGANTI tiap
restart simulator (saat ini **:104** — cek ulang di Day 6).
File uji di /tmp (`/tmp/day5-x11grab-test.mp4`), tidak di repo.

## 7. Known issues / belum terverifikasi

1. **Data basi tanpa peringatan (BARU, dari §3b):** saat server mati
   tapi app sudah punya data cache, Home/Positions menampilkan data
   lama tanpa indikasi apa pun. Layar error hanya muncul saat start
   segar (markets kosong). Perbaikan (indikator "stale/offline" saat
   `lastError` terisi) TIDAK dilakukan Day 5 — menyentuh layout
   semua layar di 576×288 yang sudah padat; dicatat sebagai known
   issue untuk Day 6/7 bila sempat, bukan blocker demo.
2. **Mic G2 asli + ring tap (`source=2`):** tetap butuh hardware.
   Semua voice Day 5 lewat virtual mic (simulator) + HTTP.
   Automation API tidak punya injeksi ring/audio.
3. **Layar `No open positions`:** tetap belum terfoto (butuh 0 posisi
   open; tidak dibuat — ledger dipertahankan). Hanya code-review.
4. **Tap cap-cycle + tap Reset di simulator:** tetap belum difoto
   (jalur POST yang sama terbukti via toggle Allowlist Day 4 +
   `nextStep()` unit test + POST cap/reset HTTP Day 4/5).
5. **Draft expiry 410 E2E:** tetap hanya unit-test.
6. **Seleksi Positions persisten** (bukan reset ke baris pertama):
   perilaku yang diamati §2 — bukan bug, tapi demonstran Day 6 harus
   membaca layar CloseConfirm sebelum tap confirm.
7. **Draf voice-buy JSON** yang dibuat saat regresi §5 (market
   3215006, gate REJECT daily cap) tidak sempat di-cancel eksplisit —
   kedaluwarsa sendiri dalam 5 menit (TTL draft), tanpa efek ledger.

## 8. Keadaan akhir (24 Nov ~10:56 UTC)

- Server: PID 79103 (`python3 run-with-groq.py`, `http://127.0.0.1:8787`,
  health OK, Groq hidup). Simulator: PID 79132 (`--automation-port
  9898 --aid alsa:default`, Xvfb **:104**, ping pong). Vite `:5173` 200.
  PulseAudio + `virtmic`/`virtmic_src` jalan (daemon root,
  `XDG_RUNTIME_DIR=/tmp/xdg-runtime-root`).
- Settings: **defaults** ($25/$100/allowlist ON, `isDefault:true`).
- Ledger (PAPER, `server/data/paper.json` — JANGAN upload): open 3 —
  #2 (7222313 YES $10 @ 0.475), #4 (3215007 YES $10 @ 0.039),
  #5 (7222310 YES $10 @ 0.525); closed 8 — #1, #3, #6, #7, #8, #9,
  #10, #11 (tiga terakhir: #9 voice-Yes, #10 tap-confirm, #11 voice-Yes
  di build baru; semuanya realized $0.00). Daily **$110/$100**
  (penuh — Day 6 butuh naikkan cap sementara untuk posisi demo baru,
  lihat video plan §4). totalPnl **live** (berfluktuasi dengan harga:
  +$3.76 pada 10:55 UTC, +$4.01 pada 10:57 UTC), realized +$4.14.
- Xvfb yatim :99–:103 dimatikan; hanya :104 yang jalan.

## 9. Files to upload to the repo (parent via browser)

```
app/src/main.ts
server/test-audio/buy-thirty-yes.wav
server/test-audio/buy-thirty-yes.mp3
server/test-audio/unclear.wav
server/test-audio/unclear.mp3
server/test-audio/close-ten.wav
server/test-audio/close-ten.mp3
docs/day5-video-plan.md
docs/day5-verification.md          (this file)
docs/shot.py
docs/poll.py
docs/screenshots/day5-*.png        (36 pasang, lihat §4)
```

Do NOT upload: `server/data/paper.json`, `server/data/settings.json`,
`server/server.log`, `app/dist/`, `/tmp/*` (lag-probe.py,
test-virtmic.sh, x11grab test mp4/frame, cap-test.wav).
