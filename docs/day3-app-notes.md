# Day 3 — Voice loop (app) — catatan builder

Tanggal: 24 Nov 2026. App: `app/src/main.ts` (+ baru `app/src/voice.ts`).
Server TIDAK disentuh. Tidak ada submit DoraHacks / GitHub / push. Tidak ada
secret di file atau laporan ini.

## File yang dibuat / diubah

- `app/src/main.ts` — ditulis ulang: layar `draft` + `filled`, mic
  (`audioControl`), buffer PCM → WAV, kirim `/api/voice`, confirm/cancel,
  auto-listen Yes/No di layar Draft, cleanup mic saat exit.
- `app/src/voice.ts` — BARU: helper murni tanpa bridge (normalisasi PCM,
  rakit WAV, `fmtPrice`, `summarizeGate`, baris Draft) + self-test bawaan.
- `app/app.json` — TIDAK diubah (whitelist `http://localhost:8787` dan
  permission `g2-microphone` sudah ada sejak Day 2).
- Tidak ada dependensi npm baru.

## 1. Keputusan trigger suara + alasan

Fakta SDK (dibaca dari `node_modules/@evenrealities/even_hub_sdk/dist/index.d.ts`):

- `OsEventTypeList` HANYA: CLICK=0, SCROLL_TOP=1, SCROLL_BOTTOM=2,
  DOUBLE_CLICK=3, FOREGROUND_ENTER/EXIT, ABNORMAL/SYSTEM_EXIT, IMU_DATA_REPORT.
  **Tidak ada long-press.** Jadi batal draft TIDAK bisa pakai long-press.
- `EventSourceType`: DUMMY=0, GLASSES_R=1, **RING=2**, GLASSES_L=3.
- Field sumber (`eventSource`) HANYA ada di `Sys_ItemEvent`. `Text_ItemEvent`
  (tap pada text container) TIDAK membawa sumber. Tap bisa datang lewat
  envelope mana pun; Day 2 menangani keduanya.
- Protobuf menghilangkan field bernilai nol, jadi `eventSource` yang tidak
  terisi terbaca `undefined` — dan itu TIDAK bisa dibedakan dari "bukan ring".

Keputusan implementasi (`eventSourceOf()` di `main.ts`):

- Baca sumber dari `sysEvent.eventSource` / `EventSource` (camelCase maupun
  nama proto), plus `jsonData.eventSource` sebagai fallback; terima angka
  maupun string nama (`"TOUCH_EVENT_FROM_RING"`).
- Bila sumber == RING (2) → perilaku ring. Bila sumber `undefined` → anggap
  tap kacamata (perilaku Day 2 dipertahankan persis — tidak ada tebak-tebakan
  yang bisa merusak toggle yang sudah bekerja).
- **Ring tap di Market (atau Home) → mulai listening** (mode draft).
  Ring tap di Draft → confirm (sama seperti tap). Ring tap di Filled → Home.
- **Fallback bila host tidak pernah mengisi `eventSource`:** SCROLL
  (swipe) di layar Market → mulai listening. Day 2 mengabaikan scroll, jadi
  ini tidak mengubah perilaku apa pun yang sudah ada. Tap di Market tetap
  toggle home/market (Day 2, tidak berubah).
- Setiap tap mencatat `console.log('tap: screen=… listening=… source=…')`
  supaya di hardware nanti langsung kelihatan apakah host mengisi
  `eventSource` saat ring tap mendarat.
- **Yang belum bisa dibuktikan tanpa hardware:** apakah tap ring di dunia
  nyata datang sebagai `sysEvent` dengan `eventSource=2`, atau sebagai
  `textEvent` tanpa sumber (maka ring tidak terbedakan dan voice hanya bisa
  lewat swipe di Market). Verifikasi ini butuh G2 + ring sungguhan.

## 2. Cara batal draft (non-suara)

Long-press tidak ada di SDK, double-tap = exit app. Yang dipakai:

- **Suara "No"** saat mic Yes/No menyala di layar Draft → server membatalkan,
  kembali ke Market. (Terverifikasi via HTTP: `heard:'no'`, `cancelled:true`.)
- **SCROLL (swipe) di layar Draft** → `POST /api/voice/cancel {draftId}`
  (best-effort) + kembali ke Market. Konsisten dengan DESIGN "swipe = scroll
  list" yang belum terpakai di layar ini.
- **Tap di Draft saat gate REJECT** (atau saat confirm ditolak server) →
  dismiss → kembali ke Market (cancel best-effort juga dikirim).
- Tap di Draft saat gate PASS → confirm (bukan batal).

## 3. Perilaku voice yang diimplementasi

- Mic: `audioControl(true)` saat mulai listening; `audioControl(false)` saat
  stop / batal / pindah layar / double-tap exit / `SYSTEM_EXIT` /
  `ABNORMAL_EXIT` / `beforeunload`. Bila `audioControl(true)` gagal (return
  `false` / throw) → tampil `Mic unavailable` di layar Market, tidak crash.
- Buffer semua chunk `audioEvent.audioPcm`, normalisasi tiga bentuk
  (Uint8Array / number[] / string base64); chunk panjang ganjil di-pad satu
  byte nol supaya alignment s16le terjaga. Rakit WAV: header RIFF 44-byte,
  PCM s16le 16 kHz mono. Kirim `POST ${SERVER_URL}/api/voice?marketId=<id
  market teratas>` dengan `Content-Type: audio/wav`.
- Tap (kacamata atau ring) saat listening → stop + kirim. Tidak ada chunk
  dalam 10 dtk → stop otomatis, `No audio heard` di Market (tidak mengirim
  sunyi). Cap pengaman 30 dtk untuk mode draft.
- Layar Draft masuk → mic OTOMATIS menyala untuk jawaban Yes/No (maks ~8 dtk,
  lalu mati). Kirim sebagai multipart FormData: part `audio` + field `draftId`.
  `heard:'yes'` → Filled (posisi dari respons; bila respons tidak membawa
  fill, JANGAN confirm ulang — server sudah menjalankan gate dan menghapus
  draft saat menolak); `heard:'no'` → batal + Market; `heard:'unclear'` →
  tanya sekali lagi (maks 2x unclear, lalu mic mati, hanya tap/ring).
- Confirm via tap/ring: `POST /api/voice/confirm {draftId}` → sukses →
  Filled; 403 → alasan gate fresh tampil di Draft + `Tap to dismiss`;
  404/410 (draft kedaluwarsa) → kembali Market + `Draft expired`.
- Layar Draft (4 baris; baris header `GATEKEEPER · PAPER` dipertahankan dari
  pola Day 2 karena aturan "setiap layar trade berlabel PAPER", tiga baris
  isi verbatim sesuai DESIGN §2):
  - `BUY $10 YES @ 64¢`
  - `Gate: PASS 7/7` (jumlah nyata dari server — server punya 7 checks,
    bukan 5 seperti contoh di DESIGN) atau `Gate: REJECT — <aturan pertama>`
  - `Tap / ring / "Yes" to confirm` (atau `Tap to dismiss` bila REJECT)
- Layar Filled: `FILLED $10 YES @ 64¢ · Position #3 · PAPER` — memakai
  `position.id` + `entryPrice` nyata dari respons. Tap → Home + refresh data.
- Harga: `fmtPrice` — 0.64 → `64¢`; bila bukan nilai sen bulat (mis. 0.475
  → `$0.48`, 0.039 → `$0.04`) tampil dolar 2 desimal, tidak pernah angka
  mentah. Ukuran: `$10` bulat tanpa desimal.
- Render `textContainerUpgrade` di-debounce 120 ms (antrean BLE lambat,
  pola template ASR).
- Home/Market Day 2 tidak berubah kecuali baris kaki Market: `Ring /
  swipe: voice · tap: home` (sebelumnya `Say "buy $10 YES"`).

## 4. Yang diuji (perintah + hasil nyata)

### a. Build + unit test helper murni

```
cd ~/workspace/even-realities/app && npm run build
# tsc --noEmit && vite build — BERSIH
# vite v5.4.21 building… ✓ 6 modules transformed
# dist/assets/index-BTpCoQKY.js  81.45 kB │ gzip: 32.16 kB ✓ built in 822ms

node --experimental-strip-types src/voice.ts
# 27 assertion OK (PCM 3 bentuk, concat+padding, header WAV lengkap +
# round-trip payload, fmtPrice/fmtSizeUsd, summarizeGate PASS/REJECT,
# draftLine1/2) — SELF-TEST PASSED
```

String Day 3 terkonfirmasi ada di bundle produksi (`dist/assets/*.js`):
`Say Yes or No`, `Tap / ring`, `FILLED`, `No audio heard`,
`Mic unavailable`, `Tap to dismiss`, `Listening`, `Gate: REJECT`,
`audioControl`, `TOUCH_EVENT_FROM_RING`, `Ring / swipe: voice · tap: home`.

### b. Kontrak server (dibaca, bukan diubah) — cocok dengan app

Server builder sudah mendaratkan `server/src/voice.js` (belum ada saat
pemeriksaan pertama; 404 saat itu). Kontrak terverifikasi dari sumbernya:

- Draft: `{ok, draftId, transcript, intent:{action,side,sizeUsd},
  draft:{marketId,question,side,sizeUsd,price}, gate:{verdict,checks,failedRules}}`
  — sama dengan yang dipakai app.
- Gate: `verdict 'PASS'|'REJECT'`, `checks:[{rule,pass,detail}]` (7 checks),
  `failedRules:[nama-aturan]` — `summarizeGate` di app menangani bentuk ini
  (termasuk `pass:false` dan `failedRules` string).
- Yes/No: multipart part `audio` + field `draftId` diterima
  (`parseMultipartAudio`); `heard 'yes'` → server langsung confirm
  (200 `{filled,position,gate}`) atau 403 `{filled:false,gate}`; `heard
  'no'` → `{cancelled:true}`; `unclear` → 200 `{ok:true,heard:'unclear'}`.
- Confirm: 200 `{filled:true,position,gate}` / 403 `{filled:false,gate}` /
  404/410. Cancel: 200 `{cancelled:true}`.
- Posisi: `{id (seq number), entryPrice, …}` — sesuai yang dibaca app.
- **Dua bug yang ditemukan dari membaca kontrak ini dan sudah diperbaiki
  di app sebelum build final:** (1) respons "yes" yang ditolak gate datang
  sebagai HTTP 403 — versi awal app salah membacanya sebagai network error
  dan membuang draft; sekarang routing berdasarkan `heard` dulu.
  (2) "yes" yang ditolak TIDAK boleh confirm ulang — server sudah menghapus
  draft saat menolak (confirm kedua akan 404); sekarang app memakai
  `gate` dari respons itu untuk `draftBlockedReason`.

### c. Loop voice end-to-end di level HTTP (server jalan via launcher-nya
###    sendiri `server/run-with-groq.py`; Groq key = surrogate in-process,
###    tidak pernah dicetak/disimpan — request yang dikirim app disimulasikan
###    persis dengan curl + file `server/test-audio/*.wav`)

Server: `python3 run-with-groq.py` (pid 3247, 09:36 UTC), `/api/markets` 200.

1. JSON `{text:"buy ten dollars yes"}` → 200, draft `dft_ebf07491076b3152`,
   transcript `buy ten dollars yes`, intent buy YES $10, gate PASS.
2. WAV mentah `buy-ten-yes.wav` (16 kHz mono 16-bit, 30336 frame) via
   `POST /api/voice?marketId=7222313` + `Content-Type: audio/wav` →
   transcript `Buy $10 yes.`, intent buy YES $10, gate **REJECT**,
   `failedRules: ['duplicate guard','cooldown']`, checks 5/7 —
   benar: sudah ada posisi open #2 di market itu. Bentuk inilah yang
   dirender app sebagai `BUY $10 YES @ $0.48` / `Gate: REJECT — duplicate
   guard` / `Tap to dismiss`.
3. WAV yang sama ke `?marketId=3215007` → draft `dft_d1b743b128a4b9ff`,
   price 0.039, gate **PASS** 7/7.
4. Multipart `yes.wav` + `draftId=dft_d1b743b128a4b9ff` →
   `{ok:true, heard:'yes', transcript:'Yes.', filled:true, position:{id:4,
   entryPrice:0.039, sizeUsd:10, side:'YES'}}` — inilah yang dirender app
   sebagai `FILLED $10 YES @ $0.04 · Position #4 · PAPER`.
5. Draft baru di `3215006` (PASS) + multipart `no-cancel.wav` →
   `{ok:true, heard:'no', transcript:'No, cancel that.', cancelled:true}`.
6. `POST /api/voice/confirm {draftId}` pada draft REJECT →
   **HTTP 403** `{filled:false, gate:{verdict:'REJECT', …}}` — jalur yang
   dipakai app untuk `draftBlockedReason`.

Catatan: ledger paper dipakai bersama builder server yang sedang menguji
paralel (posisi #2 09:36:25 dan #3 09:37:29 dibuat bukan oleh pengujian
ini); cooldown 60 dtk sempat menggagalkan dua percobaan draft sebelum
berhasil — itu perilaku gate yang benar, bukan bug app.

### d. Review kode cermat untuk logika layar Draft/Filled (pengganti
###    pengujian render yang tidak bisa dilakukan — lihat §5)

Yang diperiksa baris per baris di `main.ts`:

- `currentContent()`: saat `listening` selalu tampil listening screen;
  selain itu switch `home|market|draft|filled` — tidak ada layar yang bisa
  tertukar; `draftContent()`/`filledContent()` punya fallback `No draft` /
  `No fill` bila state kosong.
- `draftContent()`: tiga varian (PASS / REJECT / confirm-ditolak) —
  `draftBlockedReason` mengalahkan tampilan PASS, tap pada varian itu
  dismiss (bukan confirm). `draftLine2` dari `summarizeGate` memakai
  `failedRules[0]`.
- Tap routing: `listening` → stop+send dulu (tidak ada tap yang lolos ke
  handler layar); `draft` + REJECT/blocked → `cancelDraft()`; `draft` +
  PASS → `confirmDraft()`; `filled` → home + `refreshData()`; ring di
  home/market → `startListening('draft')`; tap biasa → toggle Day 2.
- `startListening('yesno')` hanya dipanggil bila gate PASS (di
  `sendDraftVoice`); bila gate REJECT, mic tidak menyala — benar.
- `stopListeningAndSend()`: mode `yesno` tanpa audio → tetap di Draft
  (tidak loncat ke Market); mode `draft` tanpa audio → Market +
  `No audio heard`. Timer: `noAudioTimer` 10 dtk dibatalkan saat chunk
  pertama masuk; `maxListenTimer` 8 dtk (yesno) / 30 dtk (draft) memanggil
  stop+send — di mode yesno timer 8 dtk selalu menang atas timer 10 dtk,
  jadi tidak ada lompatan layar yang salah.
- `sendYesNo()`: routing berdasarkan `heard` mendahului cek HTTP status
  (alasan: 403 yes). `unclearCount` naik hanya pada `unclear`, reset saat
  draft baru dibuat dan saat cancel; setelah 2x unclear mic mati.
- `confirmDraft()`: 404/410 → `Draft expired` + Market; 403/lainnya →
  `draftBlockedReason` dari `gate.failedRule` / `reason` / fallback
  `confirm refused (HTTP …)`.
- Exit: double-tap → `stopListeningSilent()` (mic mati) lalu
  `shutDownPageContainer(1)`; `SYSTEM_EXIT`/`ABNORMAL_EXIT`/`beforeunload`
  → `cleanupMicAndUnsubscribe()` (mic mati + unsubscribe).
- Audio branch: `normalizePcm` dipanggil hanya saat `listening`; frame
  audio tidak pernah dibaca sebagai tap (jebakan yang diperingatkan
  template ASR — `eventTypeOf` tidak dipanggil untuk envelope audio).
- `refreshData()` 30 dtk tetap jalan dan memanggil `refreshDisplay()`,
  yang me-render layar aktif saat itu (termasuk Draft/Filled) — tidak
  menimpa state layar.

### e. Simulator (0.9.5, automation API) — Home/Market + trigger swipe + error mic

- `GET /api/ping` → `pong`; console: `Page created: success`, 0 error.
- Home render 2832 lit px (kanal alpha, lihat §5.2 soal cara ukur):
  `docs/screenshots/day3-home.png` (+ `-alpha.png`).
- `POST /api/input {"action":"click"}` → tap `source= 1` (GLASSES_R —
  host simulator MENGISI `eventSource`) → Market 3300 lit px
  (`day3-market.png`), kaki baru `Ring / swipe: voice · tap: home` tampil.
- `POST /api/input {"action":"up"}` → SCROLL_TOP_EVENT → voice entry →
  `audioControl(true)` gagal (tanpa mic di VM) → layar **`Mic
  unavailable`** di Market, tanpa crash (`day3-mic-unavailable.png`).
- Double-click → `shutDownPageContainer(1)`, framebuffer kosong (0 lit px),
  sama seperti Day 2.
- Yang TIDAK bisa diuji di simulator: ring tap (`source=2`), audio PCM,
  render Draft/Filled — lihat §5.

Yang diperiksa baris per baris di `main.ts`:

- `currentContent()`: saat `listening` selalu tampil listening screen;
  selain itu switch `home|market|draft|filled` — tidak ada layar yang bisa
  tertukar; `draftContent()`/`filledContent()` punya fallback `No draft` /
  `No fill` bila state kosong.
- `draftContent()`: tiga varian (PASS / REJECT / confirm-ditolak) —
  `draftBlockedReason` mengalahkan tampilan PASS, tap pada varian itu
  dismiss (bukan confirm). `draftLine2` dari `summarizeGate` memakai
  `failedRules[0]`.
- Tap routing: `listening` → stop+send dulu (tidak ada tap yang lolos ke
  handler layar); `draft` + REJECT/blocked → `cancelDraft()`; `draft` +
  PASS → `confirmDraft()`; `filled` → home + `refreshData()`; ring di
  home/market → `startListening('draft')`; tap biasa → toggle Day 2.
- `startListening('yesno')` hanya dipanggil bila gate PASS (di
  `sendDraftVoice`); bila gate REJECT, mic tidak menyala — benar.
- `stopListeningAndSend()`: mode `yesno` tanpa audio → tetap di Draft
  (tidak loncat ke Market); mode `draft` tanpa audio → Market +
  `No audio heard`. Timer: `noAudioTimer` 10 dtk dibatalkan saat chunk
  pertama masuk; `maxListenTimer` 8 dtk (yesno) / 30 dtk (draft) memanggil
  stop+send — di mode yesno timer 8 dtk selalu menang atas timer 10 dtk,
  jadi tidak ada lompatan layar yang salah.
- `sendYesNo()`: routing berdasarkan `heard` mendahului cek HTTP status
  (alasan: 403 yes). `unclearCount` naik hanya pada `unclear`, reset saat
  draft baru dibuat dan saat cancel; setelah 2x unclear mic mati.
- `confirmDraft()`: 404/410 → `Draft expired` + Market; 403/lainnya →
  `draftBlockedReason` dari `gate.failedRule` / `reason` / fallback
  `confirm refused (HTTP …)`.
- Exit: double-tap → `stopListeningSilent()` (mic mati) lalu
  `shutDownPageContainer(1)`; `SYSTEM_EXIT`/`ABNORMAL_EXIT`/`beforeunload`
  → `cleanupMicAndUnsubscribe()` (mic mati + unsubscribe).
- Audio branch: `normalizePcm` dipanggil hanya saat `listening`; frame
  audio tidak pernah dibaca sebagai tap (jebakan yang diperingatkan
  template ASR — `eventTypeOf` tidak dipanggil untuk envelope audio).
- `refreshData()` 30 dtk tetap jalan dan memanggil `refreshDisplay()`,
  yang me-render layar aktif saat itu (termasuk Draft/Filled) — tidak
  menimpa state layar.

## 5. Yang BELUM terverifikasi + kenapa

1. **Render layar Draft/Filled di kaca + mic sungguhan: BELUM.**
   Hanya bisa di hardware G2 + ring. Yang terverifikasi adalah logika
   kontennya (§4d), request HTTP-nya (§4c), dan unit test helper-nya (§4a).
2. **Simulator Day 3: TERVERIFIKASI (setelah catatan awal ditulis).**
   Rangkaian pemulihan pasca-restart VM:
   - `evenhub-simulator` global hilang → install ulang
     `npm install -g @evenrealities/evenhub-simulator@0.9.5` (7 dtk).
   - Simulator lokal `app/node_modules` (0.7.3) gagal start:
     `libwebkit2gtk-4.1.so.0: cannot open shared object file` — paket apt
     ikut hilang saat restart. `apt-get update` (71,4 MB, 12 mnt 35 dtk,
     mirror lambat 94,6 kB/s) + `apt-get install -y libwebkit2gtk-4.1-0`
     berhasil; `ldconfig -p` memastikan `libwebkit2gtk-4.1.so.0` ada.
   - Vite dev `:5173` (200) + server `:8787` (200, via
     `run-with-groq.py`) + simulator 0.9.5 `--automation-port 9898`
     (`GET /api/ping` → `pong`).
   - **Temuan penting soal screenshot:** `/api/screenshot/glasses`
     mengembalikan PNG RGBA 576×288 yang kanal RGB-nya hijau polos
     `(0,255,0)` — isi layar ada di kanal **ALPHA**. Screenshot Day 2
     yang tersimpan (`sim-home-20261124.png`) juga hijau polos; varian
     `-alpha.png` (1152×576) adalah kanal alpha yang diperbesar 2x.
     "Lit px" di kickoff-notes dihitung dari kanal alpha 576×288
     (Day 2 Home: 10508/4 = 2627). Metode yang sama dipakai di sini.
   - **Home render (Day 3):** 2832 lit px (alpha).
     `docs/screenshots/day3-home.png` + `day3-home-alpha.png` —
     `GATEKEEPER · PAPER` / `New NVIDIA CEO named by December 31, 2026?` /
     `YES 100% · 24h $3.2M` / `Book $-0.26 · 3 open` / `Tap → market`.
   - **Tap → Market:** `POST /api/input {"action":"click"}` → console
     `tap: screen= home listening= false source= 1` — **host simulator
     MENGISI `eventSource` (1 = GLASSES_R)** dan `eventSourceOf()` saya
     membacanya dengan benar. Market render 3300 lit px
     (`day3-market.png` + `-alpha.png`): odds, volume, ends, plus baris
     kaki baru `Ring / swipe: voice · tap: home`.
   - **Trigger suara via swipe, TERVERIFIKASI di simulator:**
     `POST /api/input {"action":"up"}` → `textEvent` dengan
     `eventType: 1` (SCROLL_TOP_EVENT) → handler scroll memanggil
     `startListening('draft')` → `audioControl(true)` gagal (tidak ada
     perangkat mic di VM headless) → layar menampilkan **`Mic
     unavailable`** di Market, tanpa crash (`day3-mic-unavailable.png` +
     `-alpha.png`, 1510 lit px). Ini membuktikan jalur trigger + jalur
     error mic sampai ke kaca.
   - **Double-click → exit:** `eventType: 3` via sysEvent,
     `shutDownPageContainer(1)` terpanggil (bridge intercept), framebuffer
     jadi kosong (0 lit px) — sama seperti observasi Day 2 (dialog
     konfirmasi mode-1 tidak muncul di framebuffer simulator 0.9.5).
   - **Console sepanjang sesi: 0 error** (19 entri, semua log/debug:
     bridge init, `Page created: success`, tap/scroll/double-click events,
     bridge intercepts).
3. **Trigger suara di simulator: SEBAGIAN terverifikasi.** Yang terbukti:
   swipe → listening → mic gagal → error tampil. Yang TIDAK BISA diuji di
   simulator: ring tap (automation API tidak punya injeksi ring;
   `source=2` belum pernah terlihat), audio PCM sungguhan (tidak ada
   injeksi audio; mic VM tidak ada), dan render layar Draft/Filled
   (tidak bisa dicapai tanpa draft — dan draft butuh audio). Ketiganya
   tetap butuh hardware G2 + ring.
   Catatan: `eventSource=1` yang terisi di simulator membuat keyakinan
   pada jalur ring lebih tinggi — field-nya memang dipopulasi host,
   bukan sekadar deklarasi tipe — tapi nilai `2` (RING) spesifiknya
   belum teramati.
4. **Server `/api/voice` saat pemeriksaan pertama mengembalikan 404**
   (server builder belum mendaratkan `voice.js`); setelah VM restart,
   `voice.js` sudah ada dan semua jalur di §4c terverifikasi. Bila server
   di-restart tanpa `run-with-groq.py`, `/api/voice` menjawab 503
   `voice unavailable: GROQ_API_KEY not configured` — app akan menampilkan
   itu sebagai `Voice failed: …` di Market (jalur error sudah ada).
