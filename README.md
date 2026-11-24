# Gatekeeper for Even G2

**Proof-gated DeFi actions on your glasses — glance, ask, confirm with one tap.**

> Heads Up: Even Realities Hackathon (DoraHacks, TVM Ventures & Daos Hub)
> Track 02 · Crypto & DeFi · Solo entry by rezimx-btc

Gatekeeper is a DeFi action assistant for the Even Realities G2 smart glasses. It reads
live prediction-market odds (Polymarket), drafts an action through an AI agent, and
**gates it** before anything executes: market allowlist, per-trade cap, daily cap,
live-price sanity, duplicate guard. Only then can you confirm with one tap, a ring
gesture, or a voice "Yes".

**Paper trading only. No real funds, no wallet connection, no custody.**

## The moment

1. Glance: `BTC ≥ $120K by Dec 31 — 64% YES · +3pts today · Paper book +$42`
2. Voice: *"Buy ten dollars YES."*
3. Gate checks 5/5 → glasses show the 3-line draft → tap / ring / "Yes"
4. `FILLED $10 YES @ 64¢ · Position #3 · PAPER`
5. The same proposal mirrors to Telegram — approving there also confirms.

## What existed before 23 Nov 2026

Per the hackathon rules, the build starts 23 Nov. Before that date this repo held only
the scaffold: `README.md`, `LICENSE`, `DESIGN.md`, `BUILD-PLAN.md`, `.gitignore`, and
empty `app/` / `server/` / `docs/` directories. **All app code was written during the
build week, 23–29 Nov 2026.**

## Structure

```
app/        Vite + TypeScript Even Hub app (G2 UI, 576×288 monochrome)
server/     Node backend — markets, paper ledger, gate policy, voice, Telegram
docs/       Demo script, simulator screenshots, kickoff notes
DESIGN.md   Full design: concept, architecture, risks, sources
```

## Setup (from 23 Nov)

```bash
# Tooling (once)
npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator

# App (from the official minimal template)
npx degit even-realities/evenhub-templates/minimal app
cd app && npm install

# Backend
cd ../server && npm install

# Run: terminal 1 — Vite dev server; terminal 2 — simulator
cd ../app && npm run dev
evenhub-simulator http://localhost:5173
```

Backend needs `GROQ_API_KEY` (server-side only, never in the app) for Whisper STT +
agent LLM, and optionally `TELEGRAM_BOT_TOKEN` for the approval mirror.

## Track & rules compliance

- **Track 02 apps used:** Polymarket, Hyperliquid (read-only mids), CoinGecko.
  All market reads are public APIs — no keys, no accounts.
- **Money safety:** paper trading only. The Hyperliquid testnet faucet requires a prior
  mainnet deposit, so no real testnet orders are in scope.
- **Telegram** is used only as an approval/notify channel (the $1,000 Best Telegram
  integration special prize is explicitly open to projects from any track).
- Demo video: ≤ 3 min, recorded in the Even Hub simulator (no G2 hardware).

## License

MIT — see [LICENSE](LICENSE).
