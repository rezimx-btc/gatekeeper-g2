# Day 5 — Rencana video demo (Gatekeeper G2)

Tanggal rencana: 24 Nov 2026 · Rekam: Day 6 (28 Nov) · Durasi maks: **3 menit**
Naskah = DESIGN.md §2 "The moment", 7 langkah (tanpa Telegram — mirror DITUNDA,
tanpa token; jangan tampilkan di video). Status Day 5: E2E lengkap TERBUKTI di
simulator (posisi tes PAPER #9 voice-Yes → fill, #10 tap-confirm → fill,
keduanya ditutup lagi via tap; ledger akhir open 3, closed 7, daily $100,
totalPnl +$3.76). Video merekam ulang alur yang sama, live.

## 1. Setup perekaman

### Jalur utama — screen-record Xvfb + suara nyata (DIUTAMAKAN)

Kenapa ini jalur utama: satu take menangkap **interaksi live + suara asli**
— suara WAV dimainkan ke virtual mic saat app listening, Whisper + intent
jalan, layar Draft/Filled ter-render. Ini membuktikan voice loop end-to-end,
bukan slideshow. Day 3/4 tidak bisa begini ("Mic unavailable"); Day 5 virtual
mic sudah berhasil (PulseAudio + null sink `virtmic` + remap source
`virtmic_src`, simulator `--aid alsa:default`, WAV gTTS 16 kHz mono via
`paplay --device=virtmic`).

Perintah contoh (**DIUJI Day 5, 24 Nov — koordinator**; take uji 10 detik
berhasil, file valid, frame berisi jendela simulator):

```bash
# Display Xvfb saat ini :104 (cek ulang tiap sesi: ps / /proc/<pid>/environ)
export DISPLAY=:104 XAUTHORITY=/tmp/xvfb-run.3vbaf8/Xauthority
ffmpeg -y -f x11grab -video_size 1280x1024 -framerate 15 -i :104 \
  -t 10 -c:v libx264 -preset veryfast -crf 18 /tmp/day5-x11grab-test.mp4
# Hasil uji: 10,00 dtk, 1280x1024, h264, 15 fps, 44.761 byte, frame terbaca.
# Isi frame: panel kiri "Companion app is running" (kosong — webview tidak
# merender app), panel kanan KACA hijau terbaca ("GATEKEEPER · PAPER / New
# NVIDIA CEO... / YES 100% · 24h $3.2M / Book +$3.76 · 3 open") + tombol
# kontrol simulator (Up/Down/Click/Double Click/Long Press/Menu) di bawahnya.
# Area kaca di frame 1280x1024 kira-kira x 640-1270, y 100-330 — crop
# post ke area itu (atau rekam full window dulu, crop belakangan).
# Uji 20 detik tetap WAJIB di Day 6 sebelum take final (display bisa
# berganti nomor tiap restart simulator).
```

- Rekam **full window dulu, crop belakangan** (posisi jendela kaca di Xvfb
  bisa bergeser; cari koordinatnya saat rekam via `xwininfo`/`xdotool`).
- Alternatif sekali jalan: `-vf "crop=576:288:x:y"` — hanya bila x:y sudah
  diukur pasti sebelum take.
- Rekam audio narasi terpisah (mic laptop/HP) lalu gabung di edit; suara
  perintah (WAV) JANGAN masuk track narasi — itu input ke app, bukan VO.
- Uji dulu di Day 6 sebelum take final: 1 take uji 20 detik → cek file
  bisa diputar, frame tidak hitam, suara perintah terdengar di log server.
  (Take uji 10 detik SUDAH berhasil di Day 5, lihat §1 — display :104.)

### Fallback — rangkaian screenshot + narasi

Dipakai **hanya bila** x11grab gagal (display tidak bisa direkam / ffmpeg
error / frame hitam): ambil screenshot per layar via
`GET /api/screenshot/glasses` (isi di **kanal alpha**, 576×288 — pakai varian
`-alpha.png` atau composite di atas latar hitam), susun berurutan, narasi
menjelaskan tiap langkah + selipkan klip audio perintah. Kelemahan: tidak
membuktikan interaksi live; jadi ini plan B, bukan plan A.

## 2. Resolusi / frame — layar kaca 576×288 mono hijau

- Layar kaca **576×288, monokrom hijau, teks kecil**. Di video 1080p, tampilkan
  **crop area kaca di-zoom 2–3x** (576×288 → ~1152×576 atau 1728×864) di atas
  latar gelap, dengan label babak di bawahnya. Jangan upscale blur:
  pakai **nearest-neighbour** (`-vf "scale=1152:576:flags=neighbor"`) agar
  piksel teks tetap tajam, bukan interpolasi halus yang mengaburkan huruf.
- Jangan tampilkan seluruh window simulator 1280×1024 apa adanya — teks kaca
  jadi tak terbaca. Crop ketat ke area kaca saja; bila perlu, sisipkan satu
  frame lebar (full window) di awal sebagai konteks "ini simulator", lalu
  selebihnya close-up kaca.
- Screenshot automation 576×288 = resolusi asli kaca; untuk video, skala
  dengan `neighbor` seperti di atas, jangan upscale dari PNG RGB (isi layar
  ada di kanal alpha — RGB-nya hijau polos).

## 3. Naskah per babak (total ≤ 180 detik)

| # | Babak | Durasi | Narasi (singkat) | Aksi automation + WAV |
|---|-------|--------|------------------|------------------------|
| 0 | Intro | ~10 dtk | "Gatekeeper: lihat peluang, tanya agen, konfirmasi dengan satu ketuk — tanpa order tanpa penjaga." | Home sudah tampil |
| 1 | Glance | ~15 dtk | "Sambil jalan, lirik pasar teratas: BTC ≥ $120K, 64% YES. Buku paper +$42 hari ini." | — (Home render) |
| 2 | Voice | ~20 dtk | "Saya bicara: Buy ten dollars YES." | Swipe/ring → listening, lalu `paplay --device=virtmic buy-ten-yes.wav` |
| 3 | Gate | ~25 dtk | "Agen menyusun draf; gate memeriksa: allowlist, cap $10 dari $25, harian, harga live, duplikat — PASS 7/7." | Tunggu Draft render (lag framebuffer, §5); **take opsional REJECT:** `buy-thirty-yes.wav` → REJECT per-trade cap |
| 4 | Confirm | ~15 dtk | "Tiga baris di kaca: BUY $10 YES, gate PASS, ketuk atau ucap Yes." | `paplay --device=virtmic yes.wav` (atau tap/klik confirm) |
| 5 | Filled | ~15 dtk | "Filled. Posisi PAPER tercatat, harga entry tertera." | Tunggu layar Filled render |
| 6 | Positions | ~30 dtk | "Layar Positions: PnL live tiap posisi, langsung dari harga pasar." | Scroll ke Positions; tunggu render (~3,4 dtk cache dingin — hangatkan dulu, §4) |
| 7 | Close | ~20 dtk | "Tutup posisi: pilih, ketuk, selesai — Closed, PnL terealisasi." | Tap pilih posisi → tap confirm close |
| — | Outro | ~10 dtk | "Gatekeeper — paper trading dengan penjaga di kacamata." | — |

**Total: ~160 detik** (sisa ~20 detik buffer untuk lag/jeda). File WAV di
`server/test-audio/`: `buy-ten-yes.wav` (babak 2), `yes.wav` (babak 4),
`buy-thirty-yes.wav` (take REJECT opsional), `unclear.wav` (take error
opsional: suara tak jelas → "unclear", mic mati setelah 2x — tunjukkan hanya
bila sempat), `close-ten.wav` tersedia bila close mau via suara.
**Jangan janjikan** di narasi: mic G2 asli + ring tap (butuh hardware),
layar `No open positions` (belum terverifikasi).

## 4. Checklist pra-rekam (Day 6)

- [ ] Server hidup: `cd server && python3 run-with-groq.py` → `/health` OK
      (Groq surrogate via launcher; jangan jalankan `node` langsung tanpa key).
- [ ] Simulator jalan dengan **`--aid alsa:default`** (tanpa ini mic mati).
- [ ] PulseAudio + `virtmic` jalan: `pactl list sinks | grep virtmic`,
      `pactl list sources | grep virtmic_src`; uji `paplay` 1x sebelum take.
- [ ] Vite `:5173` merespons 200; simulator `GET /api/ping` → pong.
- [ ] **Daily cap PENUH — PERINGATAN:** ledger akhir Day 5 daily **$100/$100**
      (sudah penuh hari ini). Rekaman Day 6 butuh headroom $10 untuk posisi
      demo baru: **naikkan daily cap sementara** via
      `POST /api/settings {"dailyCapUsd":200}` sebelum rekam, lalu
      **reset ke $100** setelah selesai (`POST /api/settings/reset`).
      Menutup posisi TIDAK membebaskan daily volume (volume dihitung dari
      fill, bukan posisi open).
- [ ] Posisi demo baru akan bernomor **#11+** (tes Day 5 berakhir di #10) —
      jangan sebut nomor posisi di narasi bila belum pasti; biarkan layar
      yang menampilkannya.
- [ ] Hangatkan cache pasar: `curl /api/markets` 1x sebelum take (hindari
      render Positions ~3,4 dtk saat cache dingin 30 dtk).
- [ ] Uji x11grab 20 detik dulu (§1) sebelum take final.

## 5. Risiko + mitigasi

| Risiko | Mitigasi |
|--------|----------|
| **Framebuffer lag ~5 dtk** — screenshot/tampilan sesaat setelah aksi masih layar lama | Tunggu **5–7 dtk** setelah tiap aksi sebelum menilai/mengambil gambar; jeda ini masuk ke durasi babak (§3), jangan potong di edit sampai layar baru tampil |
| **Groq lambat / gagal** (Whisper + LLM ~2–3 dtk per panggilan) | Rekam saat Groq sehat (cek `/health` + 1 panggilan `/api/voice` uji); bila timeout, ulang take — jangan paksa lanjut dengan draft basi |
| **Pasar top berubah → draft REJECT duplicate** (posisi open sudah ada di market+side yang sama) | Sebelum rekam: cek `GET /api/markets` (top market hari itu) + `GET /api/paper` (posisi open); **tutup dulu posisi duplikat** bila ada, atau pilih market lain yang belum ada posisinya |
| **Render Positions lambat ~3,4 dtk** (cache `/api/markets` dingin 30 dtk) | Hangatkan cache sebelum take (§4); bila masih lambat, tunggu di take — jangan potong sebelum angka PnL tampil |
| **x11grab belum teruji** | Uji 20 detik di awal Day 6; bila gagal, langsung fallback screenshot + narasi (§1b) — jangan habiskan waktu debug rekam |
| **Daily cap penuh** (lihat §4) | Naikkan cap sementara + reset setelah rekam; verifikasi `GET /api/settings` akhir = defaults |
