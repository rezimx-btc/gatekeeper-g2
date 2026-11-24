# Day 6 — Video demo Gatekeeper G2 (Even Realities DoraHacks)

Tanggal rekam: 24 Nov 2026, ~18:06–18:20 WIB (11:06–11:20 UTC).
Video final: `demo/gatekeeper-g2-demo.mp4` — **155,00 dtk, 1280x720, h264 + aac mono,
15 fps, 2.251.499 byte (~2,15 MB), bitrate total ~116 kbps**. Batas 180 dtk: LOLOS.

## Perintah yang dipakai

Pra-rekam (cek live, semua OK):
```bash
curl -s http://127.0.0.1:8787/health            # {"ok":true}
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173   # 200
curl -s http://127.0.0.1:9898/api/ping          # pong
pactl list sinks/sources | grep virtmic          # virtmic + virtmic_src jalan
curl -s http://127.0.0.1:8787/api/markets        # hangatkan cache
curl -s "http://127.0.0.1:8787/api/gate/check?marketId=6977205&side=YES&sizeUsd=10"
# -> PASS 7/7 (allowlist, side, per-trade $10<=25, daily $110/$200, price 0.9995, no duplicate, cooldown)
```

Display + kaca (diukur, bukan asumsi):
- Xvfb **:104**, `XAUTHORITY=/tmp/xvfb-run.Xbxfdt/Xauthority`
  (dari `ps`: `Xvfb :104 -screen 0 1280x1024x24 -auth /tmp/xvfb-run.Xbxfdt/Xauthority`).
- Area kaca di frame 1280x1024: **x=660, y=112, 576x288, skala 1:1**
  (diukur dengan membandingkan baris teks alpha-PNG 576x288 vs frame x11grab:
  offset x +660, y +112, tinggi baris identik 16 px — bukan perkiraan 640/100).
- Uji x11grab 20 dtk: `ffmpeg -f x11grab -video_size 1280x1024 -framerate 15 -i :104
  -t 20 ... /tmp/day6-x11grab-test.mp4` -> 20,00 dtk, 1280x1024, h264, frame terbaca
  (kaca hijau "CLOSED #11" + panel companion). LOLOS.

Cap harian sementara (wajib — daily $110/$100 penuh):
```bash
curl -s -X POST http://127.0.0.1:8787/api/settings -H 'Content-Type: application/json' \
  -d '{"dailyCapUsd":200}'     # terverifikasi: dailyCapUsd 200, isDefault false
# ... setelah selesai:
curl -s -X POST http://127.0.0.1:8787/api/settings/reset
# terverifikasi: $25/$100/allowlist ON, isDefault:true
```

Perekaman take (script di /tmp — bukan di repo):
- `/tmp/day6-stage1.sh` (take 1, GAGAL — lihat bawah), `/tmp/day6-stage2a.sh`
  (take 2, babak 0–2 + Voice), lalu langkah interaktif: paplay yes.wav + tap,
  navigasi Positions, CloseConfirm, confirm, outro.
- Rekam: `ffmpeg -f x11grab -video_size 1280x1024 -framerate 15 -i :104
  -c:v libx264 -preset veryfast -crf 18 /tmp/day6-take-raw.mp4` (tanpa -t,
  dihentikan SIGINT di akhir).
- Perintah suara: `paplay --device=virtmic server/test-audio/buy-ten-yes.wav`
  dan `yes.wav` (XDG_RUNTIME_DIR=/tmp/xdg-runtime-root).
- Input simulator: `POST http://127.0.0.1:9898/api/input` (click / down / up).
- Narasi: gTTS (en) per babak, `pip3 install --break-system-packages gtts`
  (modul belum ada di VM), file di /tmp/day6-narr/*.mp3, loudnorm -16 LUFS di build.
- Build: `/tmp/day6-build.sh` — crop kaca 576:288:660:112, scale neighbor 2x
  (1152x576), pad 1280x720 latar #0a0a0a, label babak drawtext DejaVuSans 30pt,
  concat 12 segmen, +faststart. Filter di /tmp/day6-filter.txt.

## Take

### Take 1 — DIBUANG (`/tmp/day6-take1-failed.mp4`, 126,67 dtk)
- Gagal di Voice: `buy-ten-yes.wav` tidak jadi draft; layar s-filled2 menunjukkan
  `Groq error 400: {"error":{"message":"Fa...` (pesan terpotong di layar, server
  tidak me-log request — isi lengkap error tidak bisa dipulihkan).
- Penyebab ganda: (1) Groq 400 transien — tes langsung `POST /api/voice` dengan
  WAV yang sama beberapa menit kemudian BERHASIL (transkrip "Buy $10 yes.",
  draft `dft_d3815a21f5cbe6bc`, gate PASS 7/7; draft itu kedaluwarsa sendiri,
  tanpa efek ledger); (2) kesalahan timing saya: `yes.wav` dimainkan saat app
  masih di draft-mode listening (belum ada draft), sebelum auto-send 30 dtk —
  audionya ikut ter-buffer ke panggilan voice yang sama.
- Ledger tidak berubah (open 3, closed 8, daily $110). Rekaman dihentikan (SIGINT).

### Take 2 — DIPAKAI (`/tmp/day6-take-raw.mp4`, 206,13 dtk, 1280x1024 h264 15fps)
Timeline (detik di raw, T0 = 11:11:58 UTC; klasifikasi frame 1 fps vs referensi
alpha, jarak 0.000 = cocok persis):
- 0–11 Home · 12–32 Market · 33–68 Listening · 69–88 Say Yes or No ·
  89–107 Draft PASS · 108–130 Filled · 131–136 Home · 138–173 Positions ·
  174–184 CloseConfirm · 185–206 CLOSED #12.
- Alur sebenarnya (penting, jujur): draft-mode listening auto-send di cap 30 dtk
  (T+62,6); draft PASS -> Yes/No listening; 2x auto-send sunyi (8 dtk) dihitung
  unclear -> mic mati -> layar Draft PASS menetap (T+89). `yes.wav` dimainkan
  11:13:41 saat mic SUDAH mati, jadi fill terjadi via **tap confirm di layar
  Draft** (T+105,3) — persis seperti pola Day 5 langkah 9b. Narasi babak Confirm
  berbunyi "One tap confirms" — sesuai yang terlihat di video.
- Take REJECT opsional (buy-thirty-yes.wav) TIDAK dibuat — 7 babak sudah lengkap,
  tidak ada waktu yang dihabiskan untuk itu.

## Segmen video final (155 dtk)

| # | Babak | Final | Raw | Isi layar |
|---|-------|-------|-----|-----------|
| 0 | Intro | 0–10 | 1–11 | Home |
| 1 | Glance | 10–28 | 12,5–30,5 | Market |
| 2 | Voice | 28–40 | 34–46 | Listening |
| 3 | Gate | 40–60 + 60–72 | 69–89 + 90–102 | Say Yes or No, lalu Draft PASS 7/7 |
| 4 | Confirm | 72–82 | 103–113 | Draft -> tap -> Filled |
| 5 | Filled | 82–96 | 113–127 | FILLED #12 |
| 6 | Positions | 96–111 + 111–123 | 140–155 + 162–174 | Daftar posisi, seleksi pindah ke #12 |
| 7 | Close | 123–135 + 135–145 | 175–187 + 187–197 | CLOSE #12?, lalu CLOSED #12 |
| — | Outro | 145–155 | 196–206 | CLOSED #12 hold |

## Angka live yang dipakai di narasi (semua dari layar/API saat rekam)
- Top market 6977205 "New NVIDIA CEO named by December 31, 2026?" YES 0.9995
  (tampil 100%), NO 0,0005, Vol 24h $3.235.932 (~$3,2M), ends 2027-01-01.
- Book +$3.76, 3 open (lalu 4 open setelah fill), realized +$4.14.
- Posisi demo baru **#12**: 6977205 YES $10 @ 0.9995 (tampil @ $1.00), 10,005 shares.
- Positions: #2 YES $10 PnL $0.00 · #4 YES $10 PnL -$0.38 · #5 YES $10 PnL $0.00 ·
  #12 YES $10 PnL $0.00.
- CloseConfirm: `CLOSE #12? / YES $10 @ $1.00 · PnL $0.00` — dibaca SEBELUM tap confirm.
- Closed: `CLOSED #12 · $0.00 · PAPER`, realized PnL tetap $0.00.
- Gate check independen sebelum rekam: PASS 7/7 (lihat perintah di atas).
- Ledger akhir: open 3 (#2, #4, #5), closed 9, daily $120/$100, totalPnl +$3.76,
  realized +$4.14. Ledger TIDAK di-reset (posisi tes dipertahankan).
- TIDAK dipakai: angka contoh naskah "+$42" / "BTC 64%" — tidak ada di layar.

## Hasil verifikasi video final
- ffprobe: 155,00 dtk, 1280x720, h264 15 fps, aac mono, size 2.251.499 byte.
- 12 frame sampel (t=5,19,34,50,66,77,89,103,117,129,140,150) DILIHAT satu per satu:
  Home, Market, Listening, Say Yes or No, Draft `BUY $10 YES @ $1.00 / Gate: PASS 7/7`,
  Confirm (Draft), FILLED #12, Positions (seleksi #2), Positions (seleksi `> #12`),
  CLOSE #12?, CLOSED #12, Outro (CLOSED #12) — semua tampil, teks tajam
  (scale neighbor), label babak terbaca, TIDAK ada layar error tak disengaja.
- Audio: silencedetect -45 dB — narasi hadir di tiap segmen mulai ~0,5 dtk
  (Intro 0,5–8,5; Glance 10,6–26,9; Voice 28,6–34,9; Gate-a 40,6–54,3;
  Gate-b 60,6–65,1; Confirm 72,6–76,4; Filled 82,6–87,6; Positions-a 96,6–109,8;
  Positions-b 111,6–113,6; Close-a 123,6–133,3; Close-b 135,6–139,7;
  Outro 145,6–149,3). volumedetect: mean -18,3 dB, max -1,4 dB (jelas, tanpa clipping).
- blackdetect: TIDAK berlaku di video ini — latar memang gelap by design
  (hampir semua frame "98% piksel gelap" menurut metrik itu); verifikasi visual
  12 frame di atas yang dipakai sebagai bukti ketiadaan frame hitam kosong.

## Yang belum terverifikasi / catatan jujur
- Isi narasi TIDAK didengarkan telinga manusia — hanya diverifikasi lewat
  silencedetect (kehadiran + posisi) dan volumedetect (level). gTTS en standar;
  pelafalan ("C E O", "P and L") ditulis eja agar terbaca benar, tapi kualitas
  pengucapan tiap kata tidak dicek dengar.
- Suara perintah WAV (buy-ten-yes / yes) TIDAK terdengar di video — x11grab
  tanpa audio, dan WAV memang input ke app (virtmic), bukan track narasi.
  Yang terdengar hanya narasi gTTS.
- Confirm di video ini adalah tap (bukan suara "Yes") — lihat "Alur sebenarnya"
  di atas. Narasi tidak mengklaim voice-confirm; naskah asli ("ketuk atau ucap Yes")
  disederhanakan jadi "One tap confirms" agar sesuai gambar.
- Tidak ada frame lebar full-window simulator di video final (hanya close-up
  kaca 2x + label) — teks kaca jadi prioritas sesuai video plan §2.
- Keadaan akhir app: layar CLOSED #12 (dibiarkan; tidak memengaruhi ledger).
- Tidak ada secret/key di file ini atau di laporan. Tidak ada perubahan kode
  app/server. Tidak ada submit DoraHacks / upload GitHub dari tugas ini.

## File terkait
- Video final: `demo/gatekeeper-g2-demo.mp4`
- Raw take 2: `/tmp/day6-take-raw.mp4` (206,13 dtk) — bukan di repo.
- Raw take 1 (gagal): `/tmp/day6-take1-failed.mp4` (126,67 dtk) — bukan di repo.
- Script take/build/filter: `/tmp/day6-stage1.sh`, `/tmp/day6-stage2a.sh`,
  `/tmp/day6-build.sh`, `/tmp/day6-filter.txt` (bukan di repo).
- Narasi gTTS: `/tmp/day6-narr/*.mp3` (bukan di repo).
- Screenshot bukti per langkah: `docs/screenshots/day5-day6-s2-*.png`
  (nama day5- karena helper shot.py memberi prefix itu; isi Day 6).
