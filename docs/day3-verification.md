# Day 3 verification — Gatekeeper G2, Even Realities DoraHacks

Date: 2026-11-24 (WIB = UTC+7; server times below are UTC unless noted).
Scope of this file: **SERVER** section (voice loop). App (G2 client) section is
written by the app builder.

## Files created / changed (server)

| File | Change |
|---|---|
| `server/src/voice.js` | **NEW** — voice loop: WAV/PCM/multipart parsing, Whisper + intent LLM via Groq, in-memory draft store (5 min TTL), confirm/cancel handlers, surrogate mint-per-call via authd socket. |
| `server/src/index.js` | **CHANGED** — wiring only: routes `POST /api/voice`, `POST /api/voice/confirm`, `POST /api/voice/cancel`, `GET /api/voice/draft/:id`; `readRaw()` helper; 503/502 mapping for `VoiceUnavailable`/`GroqError`. No gate/markets/paper logic touched. |
| `server/run-with-groq.py` | **NEW** — dev launcher: mints `custom.groq` surrogate via authd socket, sets `GROQ_API_KEY`, execs `node src/index.js`. Never prints the surrogate. |
| `server/tests/voice.test.js` | **NEW** — 14 unit tests (node:test, no network). |
| `server/package.json` | **CHANGED** — `test` script now runs `tests/gate.test.js tests/voice.test.js`. |
| `server/README.md` | **CHANGED** — voice usage (env key or launcher) + new endpoints + voice flow + file table. |
| `server/test-audio/` | **NEW** — real-voice fixtures (gTTS, see below): `buy-ten-yes.wav`, `yes.wav`, `no-cancel.wav` (+ source `.mp3`), all PCM s16le 16 kHz mono. |
| `server/data/paper.json` | Created by the server during E2E (paper ledger; test positions inside). |
| `server/server.log` | Dev run log (no secrets). |

NOT changed: `server/src/gate.js`, `server/src/markets.js`, `server/src/paper.js`,
`server/tests/gate.test.js`, anything under `app/`. No secrets/keys in any file
(verified by grep: only the literal `hsurr:` prefix appears in code/comments).

## 1. Unit tests

Command:

```bash
cd ~/workspace/even-realities/server && npm test
```

Result: **18/18 pass** (gate 4/4 unchanged + voice 14/14 new).

```
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

Voice tests cover: `parseIntentJson` (plain/embedded/default-side/unsupported),
`normalizeYesNo` (yes/no/unclear incl. "don't do it" → no), WAV validation
(valid 16 kHz mono / empty / truncated / bad rate / bad bit depth), PCM→WAV
wrap + `detectAudio`, multipart `audio` part extraction, draft store
(create/get/delete, 5-min expiry + 410-able raw read).

## 2. Surrogate test (step b)

Direct test (before the server code relied on it) — one surrogate minted via
`dynamic_credential_entry('custom.groq')`, used for **two** Groq chat calls:

```
surrogate prefix: hsurr:ea8b24 len: 38 placement: bearer_header
call 1: HTTP 200 content='OK'
call 2: HTTP 200 content='OK'
```

**Verdict: surrogate is REUSABLE, not single-use.** `voice.js` still mints a
fresh surrogate per Groq call when `GROQ_API_KEY` starts with `hsurr:` (cheap
local authd socket call) and falls back to the env surrogate if minting fails,
so it works either way. Node `fetch` to `api.groq.com` was verified separately
(HTTP 200, 11 models) — `NODE_USE_ENV_PROXY=1` is set in this environment.

Server started via the launcher:

```bash
cd ~/workspace/even-realities/server && python3 run-with-groq.py
# Gatekeeper server listening on http://127.0.0.1:8787
curl -s http://127.0.0.1:8787/health
# {"ok":true,"time":"2026-11-24T09:33:38.344Z"}
```

## 3. Test audio — real voice (step c)

gTTS path worked on the first try (after a `pip --user` quirk: Python running
as root ignores user site-packages, so `PYTHONPATH=/home/hatch/.local/lib/python3.12/site-packages`
was needed). espeak-ng was **not** needed / not tried beyond gTTS succeeding.

```bash
python3 -m pip install --user --break-system-packages gtts   # gtts-2.5.4
PYTHONPATH=/home/hatch/.local/lib/python3.12/site-packages python3 - <<'EOF'
from gtts import gTTS
for name, text in [("buy-ten-yes","Buy ten dollars YES"),("yes","Yes"),("no-cancel","No, cancel that")]:
    gTTS(text=text, lang="en").save(f"{name}.mp3")
EOF
for f in buy-ten-yes yes no-cancel; do
  ffmpeg -y -v error -i $f.mp3 -ar 16000 -ac 1 -c:a pcm_s16le $f.wav
done
# ffprobe: pcm_s16le,16000,1,16 for all three
# buy-ten-yes.wav 60750 B | yes.wav 30030 B | no-cancel.wav 53838 B
```

## 4. E2E via curl (step d)

Ledger was clean at start (`GET /api/paper` → `openCount 0, dailyVolumeUsd 0`).

### 4.1 First `/api/voice` — WAV "Buy ten dollars YES" (Groq calls #1 STT + #2 chat)

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: audio/wav' --data-binary @buy-ten-yes.wav
# HTTP 200 time=3.08s
```

Real response (abridged):

```json
{
  "ok": true,
  "draftId": "dft_98e212c18e71bd96",
  "transcript": "Buy $10 yes.",
  "intent": {"action": "buy", "side": "YES", "sizeUsd": 10},
  "draft": {
    "marketId": "7222313",
    "question": "Yokohama: Ryo Ono vs Lennon Roark Jones",
    "side": "YES", "sizeUsd": 10, "price": 0.475,
    "gate": {"verdict": "PASS", "failedRules": []}
  },
  "gate": {"verdict": "PASS", "failedRules": []}
}
```

All 7 gate checks passed (allowlist, side, per-trade cap $10 ≤ $25, daily cap
$0.00/$100, price sanity 0.475 within 2% of live 0.475, duplicate guard,
cooldown).

### 4.2 Second `/api/voice` — same WAV (Groq calls #3 + #4)

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: audio/wav' --data-binary @buy-ten-yes.wav
# HTTP 200 time=1.92s
# ok: True draftId: dft_a5a2d368838c04be transcript: "Buy $10 yes."
# intent: {'action': 'buy', 'side': 'YES', 'sizeUsd': 10} gate: PASS
```

Second consecutive voice call succeeded — surrogate/mint-per-call path works
across repeated calls. No Groq 401.

### 4.3 Confirm draft #1 → paper fill

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice/confirm \
  -H 'Content-Type: application/json' -d '{"draftId":"dft_98e212c18e71bd96"}'
# HTTP 200
# filled: true
# position: {id: 1, marketId: "7222313", side: "YES", sizeUsd: 10,
#   entryPrice: 0.475, shares: 21.05263157894737, status: "open",
#   createdAt: "2026-11-24T09:34:01.914Z"}
# gate: PASS
curl -s http://127.0.0.1:8787/api/paper
# openCount: 1, dailyVolumeUsd: 10, positions: [id 1 ... livePrice 0.475, unrealizedPnl 0]
```

### 4.4 GET draft + close position 1 (setup for the yes/no turns)

```bash
curl -s http://127.0.0.1:8787/api/voice/draft/dft_a5a2d368838c04be
# draft id: dft_a5a2d368838c04be | market: 7222313 | gate: PASS
curl -s -X POST http://127.0.0.1:8787/api/paper/close \
  -H 'Content-Type: application/json' -d '{"id":1}'
# closed: True | status: closed | realizedPnl: 0
```

### 4.5 Incident 09:35 UTC — /tmp wiped, server died, stray restart

Between 09:34:09 and 09:35:33 UTC the first server process died and all
`/tmp/*.json` evidence files vanished (`/tmp` mtime 09:35; only system dirs
remained). A different `node src/index.js` (PID 2946, started 09:35) was found
listening on 8787 **without** `GROQ_API_KEY` (`/api/voice` → 503) — it was not
started by this task. In-memory drafts from §4.1–4.2 were lost with the old
process (paper ledger in `data/paper.json` survived: position 1 closed,
daily $10, `lastOrderAt` 09:34:01 UTC). PID 2946 was already gone when
re-checked ("No such process"); the server was restarted via
`run-with-groq.py` with `setsid nohup`, log now at
`server/server.log` (workspace, not /tmp). All steps below ran against the
restarted server (PID 3247, health OK 09:36:15 UTC). The §4.1–4.3 results above
are quoted from the live tool output recorded before the incident.

### 4.6 Draft A via JSON text + GET draft

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/json' -d '{"text":"Buy ten dollars YES","marketId":"7222313"}'
# HTTP 200
# ok: True draftId: dft_2c756d4fa238a87c transcript: "Buy ten dollars YES"
# intent: {'action': 'buy', 'side': 'YES', 'sizeUsd': 10} gate: PASS
# market: 7222313 price: 0.475
curl -s http://127.0.0.1:8787/api/voice/draft/dft_2c756d4fa238a87c
# GET draft: dft_2c756d4fa238a87c | gate: PASS
```

### 4.7 Yes-turn via WAV "Yes" → filled

```bash
curl -s -X POST 'http://127.0.0.1:8787/api/voice?draftId=dft_2c756d4fa238a87c' \
  -H 'Content-Type: audio/wav' --data-binary @yes.wav
# HTTP 200 time=0.70s
# {ok: true, heard: "yes", transcript: "Yes.", filled: true,
#  position: {id: 2, marketId: "7222313", side: "YES", sizeUsd: 10,
#    entryPrice: 0.475, shares: 21.05263157894737, status: "open",
#    createdAt: "2026-11-24T09:36:25.532Z"}, gate: PASS}
curl -s http://127.0.0.1:8787/api/paper
# open: 1 daily: 20 | pos 2 7222313 YES $10 @ 0.475 shares 21.05 open
```

### 4.8 No-turn via WAV "No, cancel that" → cancelled

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/json' -d '{"text":"Buy ten dollars YES","marketId":"7222313"}'
# draftB: dft_c18c34b745477f4e gate: REJECT failedRules: ['duplicate guard', 'cooldown']
# (expected: position 2 open on the same market+side, last order seconds ago;
#  the draft is still created — confirm re-checks the gate fresh)
curl -s -X POST 'http://127.0.0.1:8787/api/voice?draftId=dft_c18c34b745477f4e' \
  -H 'Content-Type: audio/wav' --data-binary @no-cancel.wav
# HTTP 200 time=1.21s
# {ok: true, heard: "no", transcript: "No, cancel that.", cancelled: true}
curl -s http://127.0.0.1:8787/api/voice/draft/dft_c18c34b745477f4e
# {"error":"draft not found"} HTTP 404   (draft gone after cancel)
```

### 4.9 Error cases

```bash
curl -s -X POST http://127.0.0.1:8787/api/voice/confirm \
  -H 'Content-Type: application/json' -d '{"draftId":"dft_tidakada123"}'
# {"error":"draft not found"} HTTP 404
curl -s -X POST http://127.0.0.1:8787/api/voice/cancel \
  -H 'Content-Type: application/json' -d '{"draftId":"dft_tidakada123"}'
# {"error":"draft not found"} HTTP 404
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: audio/wav' --data-binary @/dev/null
# {"error":"empty request body: send audio (WAV/PCM) or JSON {text}"} HTTP 400
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/json' -d '{}'
# {"error":"JSON body needs a non-empty \"text\" field"} HTTP 400
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/json' -d '{"text":"Hello, how are you today?"}'
# {"ok":false,"transcript":"Hello, how are you today?","reason":"Greeting not a trade command."} HTTP 200
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/json' -d '{"text":"Sell ten dollars YES"}'
# {"ok":false,"transcript":"Sell ten dollars YES","reason":"Not a buy command"} HTTP 200
```

### 4.10 Extra input paths (same session)

```bash
# multipart/form-data, part audio + field marketId
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -F "audio=@buy-ten-yes.wav;type=audio/wav" -F "marketId=3215007"
# HTTP 200 | ok: True draftId: dft_0e80d712f783a2ef transcript: "Buy $10 yes."
# intent: buy YES $10 | market: 3215007 | gate: PASS
# raw PCM (WAV header stripped), application/octet-stream — server wraps to WAV
curl -s -X POST http://127.0.0.1:8787/api/voice \
  -H 'Content-Type: application/octet-stream' --data-binary @raw.pcm
# HTTP 200 | ok: True draftId: dft_9a798d086e83e9d7 transcript: "Buy $10 yes"
# intent: buy YES $10 | gate: REJECT (duplicate guard — position 2 open)
# confirm on the REJECT draft → fresh gate, 403, draft deleted
curl -s -X POST http://127.0.0.1:8787/api/voice/confirm \
  -H 'Content-Type: application/json' -d '{"draftId":"dft_9a798d086e83e9d7"}'
# filled: False | gate: REJECT | failed: ['duplicate guard']  (HTTP 403)
curl -s http://127.0.0.1:8787/api/voice/draft/dft_9a798d086e83e9d7
# {"error":"draft not found"} HTTP 404
# cancel the multipart draft
curl -s -X POST http://127.0.0.1:8787/api/voice/cancel \
  -H 'Content-Type: application/json' -d '{"draftId":"dft_0e80d712f783a2ef"}'
# {"cancelled":true} HTTP 200
```

## 5. Regression Day 2 (step e)

Market #2 from `GET /api/markets`: `6977205` "New NVIDIA CEO named by
December 31, 2026?" (YES 0.9995). Cooldown observed between fills
(last fill 09:36:25 UTC → next place 09:37:25 UTC).

```bash
curl -s -X POST http://127.0.0.1:8787/api/paper/place \
  -H 'Content-Type: application/json' -d '{"marketId":"6977205","side":"YES","sizeUsd":10}'
# filled: True | pos id: 3 | gate: PASS  (HTTP 200)
curl -s -X POST http://127.0.0.1:8787/api/paper/place \
  -H 'Content-Type: application/json' -d '{"marketId":"6977205","side":"YES","sizeUsd":30}'
# filled: False | gate: REJECT | failed: ['per-trade cap', 'duplicate guard', 'cooldown']  (HTTP 403)
# (per-trade cap is the decisive rule; the other two also tripped because the
#  $30 attempt came seconds after the $10 fill)
# ... waited 62 s for cooldown ...
curl -s -X POST http://127.0.0.1:8787/api/paper/place \
  -H 'Content-Type: application/json' -d '{"marketId":"6977205","side":"YES","sizeUsd":10}'
# filled: False | gate: REJECT | failed: ['duplicate guard']  (HTTP 403)
# (clean duplicate-only failure: cooldown had expired)
```

Final paper state: `openCount 2, closedCount 1, dailyVolumeUsd 30` —
position 1 (7222313 YES $10, closed, realizedPnl 0), position 2 (7222313 YES
$10 @ 0.475, open), position 3 (6977205 YES $10 @ 0.9995, shares 10.005, open).
All Day 2 behaviour unchanged: `place $10 PASS`, `place $30 REJECT`,
duplicate `place` 403.

## 6. What is NOT verified yet

- **Draft expiry (410) end-to-end**: the 5-min TTL is unit-tested
  (`createDraftStore` with a fake clock) but no live draft was left to expire
  for 5 minutes during E2E. The 404 path (unknown/expired-after-delete) is
  verified live; the 410 branch shares the same code path.
- **Real G2 microphone audio**: all E2E audio is gTTS (real speech, but not
  from the glasses mic). The server accepts the exact format the G2 sends
  (WAV s16le 16 kHz mono) plus raw PCM; on-device capture is the app
  builder's scope.
- **Server survival across the 09:35 incident**: the restarted server
  (PID 3247, `setsid nohup python3 run-with-groq.py`) was healthy at the end
  of verification, but the cause of the 09:35 process death + /tmp wipe was
  not established (another agent/process was active in `app/` at the same
  time). The server was left running; if it is down later, restart with
  `python3 run-with-groq.py` from `server/`.

## 7. Files to upload to the repo (server side)

```
server/src/voice.js
server/src/index.js
server/run-with-groq.py
server/tests/voice.test.js
server/package.json
server/README.md
server/test-audio/buy-ten-yes.wav
server/test-audio/yes.wav
server/test-audio/no-cancel.wav
server/test-audio/buy-ten-yes.mp3
server/test-audio/yes.mp3
server/test-audio/no-cancel.mp3
docs/day3-verification.md   (this file)
```

Do NOT upload: `server/data/paper.json` (local test ledger),
`server/server.log` (dev log), `server/test-audio/raw.pcm` (in /tmp, already
gone with the wipe — regenerate if needed: strip the first 44 bytes of
`buy-ten-yes.wav`).

---

# Bagian APP — G2 client (ringkasan; detail lengkap di `docs/day3-app-notes.md`)

Tanggal: 2026-11-24. File: `app/src/main.ts` (ditulis ulang — layar `draft` +
`filled`, mic, buffer PCM → WAV, confirm/cancel, auto-listen Yes/No di Draft,
cleanup mic saat exit), `app/src/voice.ts` (BARU — helper murni: normalisasi
PCM 3 bentuk, rakit WAV RIFF 44-byte 16 kHz mono, `fmtPrice`,
`summarizeGate` + self-test 27 assertion OK). `app.json` TIDAK diubah
(whitelist + `g2-microphone` sudah ada). Tidak ada dependensi baru, tidak ada
secret.

## Keputusan trigger suara

- SDK TIDAK punya long-press (`OsEventTypeList` hanya CLICK / SCROLL_TOP /
  SCROLL_BOTTOM / DOUBLE_CLICK / foreground / exit / IMU). Batal draft TIDAK
  bisa pakai long-press.
- `EventSourceType`: DUMMY=0, GLASSES_R=1, **RING=2**, GLASSES_L=3; field
  `eventSource` HANYA ada di `Sys_ItemEvent` (Text_ItemEvent tidak membawa
  sumber). `undefined` → dianggap tap kacamata (perilaku Day 2 utuh).
- **Ring tap di Market/Home → mulai listening; ring di Draft → confirm.**
  **Fallback bila host tidak mengisi `eventSource`: swipe (SCROLL) di Market
  → listening** (Day 2 mengabaikan scroll). Tap di Market tetap toggle
  home/market (Day 2 tidak berubah); double-tap tetap exit.
- Batal draft (non-suara): suara "No" di jendela Yes/No, atau **swipe di
  layar Draft** → `POST /api/voice/cancel` + kembali ke Market, atau tap saat
  gate REJECT / confirm ditolak → dismiss.
- Layar Draft: `BUY $10 YES @ 64¢` · `Gate: PASS 7/7` (jumlah nyata server,
  bukan 5 seperti contoh DESIGN) / `REJECT — <aturan pertama>` ·
  `Tap / ring / "Yes" to confirm` (atau `Tap to dismiss` bila REJECT).
  Layar Filled: `FILLED $10 YES @ 64¢ · Position #3 · PAPER` (id +
  entryPrice nyata). Harga: `fmtPrice` — 0.64 → `64¢`, 0.475 → `$0.48`.
- Mic: `audioControl(true)` saat listening, `audioControl(false)` saat
  stop/batal/pindah layar/exit; gagal buka → `Mic unavailable` di Market
  (tidak crash). Tanpa chunk 10 dtk → stop, `No audio heard`. Cap 30 dtk
  (draft) / 8 dtk (yes/no, maks 2x unclear lalu mic mati). Draft REJECT →
  mic Yes/No TIDAK menyala. Render `textContainerUpgrade` di-debounce 120 ms.
- Dua bug ditemukan dari membaca kontrak server dan diperbaiki sebelum build
  final: (1) "yes" yang ditolak gate datang sebagai HTTP 403 — jangan dibaca
  network error; routing berdasarkan `heard` dulu. (2) "yes" yang ditolak
  JANGAN confirm ulang — server sudah menghapus draft (confirm kedua 404).

## Verifikasi app

- `npm run build` (tsc + vite): **BERSIH** — `dist/assets/index-BTpCoQKY.js
  81.45 kB`, built ~600 ms. String Day 3 terkonfirmasi ada di bundle produksi
  (`Say Yes or No`, `FILLED`, `Mic unavailable`, `TOUCH_EVENT_FROM_RING`,
  `Ring / swipe: voice · tap: home`).
- Loop voice level HTTP (request persis seperti app, wav `test-audio/`):
  JSON text → draft PASS; WAV mentah → draft REJECT (`duplicate guard` +
  `cooldown`, benar); WAV ke market lain → PASS 7/7; multipart `yes.wav` +
  draftId → `heard:'yes'`, `filled:true`, position #4 @ 0.039; multipart
  `no-cancel.wav` → `heard:'no'`, `cancelled:true`; confirm draft REJECT →
  HTTP 403.
- Simulator 0.9.5 (`--automation-port 9898`, setelah VM restart ~09:34 UTC
  yang menghapus install global simulator + `libwebkit2gtk` — install ulang,
  `apt-get update` 12,5 mnt + install `libwebkit2gtk-4.1-0`): `GET /api/ping`
  → `pong`, `Page created: success`, console 0 error. Home render 2832 lit
  px (alpha); tap (`source=1` GLASSES_R — host simulator MENGISI
  `eventSource`) → Market 3300 lit px + kaki baru `Ring / swipe: voice ·
  tap: home`; swipe up → SCROLL_TOP_EVENT → voice entry →
  `audioControl(true)` gagal (tanpa mic di VM) → **`Mic unavailable` tampil
  di Market tanpa crash**; double-click → shutdown, framebuffer kosong
  (sama seperti Day 2). Screenshot: `docs/screenshots/day3-home.png`,
  `day3-market.png`, `day3-mic-unavailable.png` (+ varian `-alpha.png` —
  isi layar ada di kanal alpha, RGB hijau polos; metode ukur sama dengan
  Day 2).
- Review kode baris-per-baris untuk logika layar Draft/Filled (pengganti
  render yang tidak bisa diuji — lihat "Belum terverifikasi"): routing tap
  per layar, timer 8/10/30 dtk, `unclearCount`, exit cleanup, frame audio
  tidak pernah dibaca sebagai tap. Detail di `docs/day3-app-notes.md` §4d.

## Belum terverifikasi (app)

1. **Render layar Draft/Filled di kaca + mic sungguhan**: hanya bisa di
   hardware G2 + ring. Terverifikasi: logika konten, request HTTP, unit test.
2. **Ring tap (`source=2`)**: automation API simulator tidak punya injeksi
   ring/audio; nilai `1` (GLASSES_R) yang terisi membuktikan field-nya hidup,
   tapi cabang ring spesifik butuh hardware.
3. Simulator tidak bisa injeksi audio PCM → Draft/Filled tidak bisa dicapai
   di simulator (butuh draft dari audio).

## File untuk di-upload ke repo (app side)

```
app/src/main.ts
app/src/voice.ts
docs/day3-app-notes.md
docs/screenshots/day3-home.png
docs/screenshots/day3-home-alpha.png
docs/screenshots/day3-market.png
docs/screenshots/day3-market-alpha.png
docs/screenshots/day3-mic-unavailable.png
docs/screenshots/day3-mic-unavailable-alpha.png
```

---

# Integrasi — verifikasi koordinator (24 Nov ~16:58 WIB)

Re-verifikasi setelah kedua builder selesai (server PID 3247 masih jalan,
health OK):

- `cd server && npm test` → **18/18 pass** (gate 4/4 + voice 14/14).
- `cd app && npm run build` → **bersih** (tsc + vite, bundle
  `index-BTpCoQKY.js` 81.45 kB — hash sama dengan build builder app).
- Grep secret: tidak ada `gsk_` di file repo (server/app/docs, di luar
  node_modules/dist).
- E2E koordinator (multipart, market 7222310 "Yokohama: Jie Cui vs Benjamin
  Hassan", dipilih karena belum ada posisi open):
  - `POST /api/voice -F audio=@test-audio/buy-ten-yes.wav -F marketId=7222310`
    → transcript nyata **"Buy $10 yes."**, intent buy YES $10, draft
    `dft_f32fde79d56a886c`, price 0.525, **gate PASS 7/7**.
  - `POST /api/voice/confirm {draftId}` → **filled:true, position #5, YES
    $10 @ 0.525, 19.05 shares**. `GET /api/paper` → open 4, daily $50,
    totalPnl -0.26.
- Kontrak server↔app cocok (draft/confirm/cancel/yes-no sudah diuji kedua
  builder dari kedua sisi dengan hasil yang sama: posisi #4 via yes-turn,
  posisi #5 via confirm koordinator).
- Keadaan akhir ledger (posisi tes, PAPER): #1 closed (realized $0.00), #2
  7222313 YES $10 @ 0.475 open, #3 6977205 YES $10 @ 0.9995 open, #4
  3215007 YES $10 @ 0.039 open, #5 7222310 YES $10 @ 0.525 open. Daily
  volume $50/$100. **Jangan upload `server/data/paper.json`** (ledger tes).
