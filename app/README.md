# app/ — Gatekeeper G2 app (Vite + TypeScript + Even Hub SDK 0.0.10)

Scaffolded 24 Nov from the official template:
`npx degit even-realities/evenhub-templates/minimal app`

**Status 24 Nov (Day 2):** Home + Market screens live (`src/main.ts`).
- **Home** — top-volume Polymarket market (question, YES %, 24h volume) + paper
  book PnL. Tap → Market screen.
- **Market** — odds, volume, ends date, voice hint `Say "buy $10 YES"`. Tap → Home.
- Double-tap anywhere → exit (mode 1, system confirmation dialog).
- Data from the Gatekeeper server (`http://localhost:8787`, 30 s refresh);
  error state shown on-glass when the server is unreachable.
- `app.json`: `package_id com.rezimx.gatekeeper-g2`, network whitelist
  `http://localhost:8787` (dev; production origin at pack time) + `g2-microphone`.

**PAPER ONLY. No real funds, no wallet, no custody.**

## Run

```bash
npm install
npm run dev          # Vite on http://localhost:5173
```

Then (server must be running — see `../server`):
- **Simulator:** `npm run simulate` (`evenhub-simulator http://localhost:5173`)
  — needs system libs: `libwebkit2gtk-4.1-0` (apt). Headless VM: run under
  `xvfb-run`.
- **Real glasses:** `npx evenhub qr --url http://<your-ip>:5173` and scan with the
  Even Hub companion app.

## Pack for distribution

```bash
npm run pack
```

Produces an `.ehpk` file.

## What's in here

| File | Purpose |
|---|---|
| `index.html` | WebView host. Viewport meta tag locks zoom; CSS kills iOS double-tap zoom + rubber-band scroll. |
| `src/main.ts` | Bridge, Home + Market screens, tap/double-tap routing, 30 s data refresh. |
| `app.json` | Even Hub manifest (`com.rezimx.gatekeeper-g2`, network + mic permissions). |
| `tsconfig.json` | Standard Vite vanilla-ts config. |
| `vite.config.ts` | Dev server on port 5173, host binding for LAN QR access. |

## Next steps (Day 3–4)

- Draft / Confirm screen (Day 3): action + gate verdict + Yes/No, voice "Yes" →
  paper fill via `/api/paper/place`.
- Positions screen (Day 4): scrollable list, live PnL, voice/tap close.
- Settings screen (Day 4): caps, allowlist toggle.
