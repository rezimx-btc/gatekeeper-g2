# Kickoff notes — Even Realities tech briefing (23 Nov 2026)

Kickoff was 23 Nov 12:00 Dubai (15:00 WIB). No separate briefing recording/notes
were published publicly; the notes below are taken from the live DoraHacks event
page (crawled 2026-11-24) + Even Hub docs (first-app, 2026-11-24) + the public
Even Hub catalogue (checked 2026-11-24).

## What makes a G2 app successful (organizer's own words)

> "It shows one thing that matters, then lets you act on it in seconds: reply by
> voice, confirm with a tap on the glasses or the R1 ring. We call this **read and
> write**, and it is what we judge first."

- **Design for a glance:** one thing on screen and a few words. Think "trading
  session" or "inbox in 30 seconds", not dashboards.
- One app on screen at a time; when the user switches away it cannot show anything
  or pop up alerts. No access to other apps' notifications — talk to the service
  directly through its API.
- **Bring your own speech-to-text.** The SDK gives raw microphone audio; send it to
  your own server (e.g. Whisper).
- **Use a backend.** External calls must be whitelisted in `app.json` and pass CORS.
  Route API calls through your own server and never ship API keys inside the app.
- **Sign-in:** Google sign-in does not work inside the WebView. Use a separate login
  page or a pairing code. (Gatekeeper needs no sign-in at all.)
- Display 576×288 monochrome green per eye; inputs: mic, temple touch, R1 ring.
  No camera, no speaker on the glasses.
- Money safety: demos use testnet, paper trading or read-only data. Do not hold user
  funds. No financial advice. Never commit API keys or secrets.

## Judging weights — LIVE page vs DESIGN.md

The live DoraHacks page (crawled 2026-11-24) weights:
Usefulness 25% · Read and write 20% · Technical execution 20% · UX 15% ·
Business potential and safety 20%.

DESIGN.md (written 21 Nov from an earlier crawl) says 30/25/20/15/10. **The live
page governs.** Consequence: the safety/business story is worth 20%, not 10% —
the gate IS the safety story, so this helps Gatekeeper. Prize table also differs
slightly: 2nd place per track is **$375** on the live page (DESIGN.md says $500);
Grand $2,000, 1st/track $1,250, Best Telegram $1,000, Community Partner up to
$500 all confirmed.

## Even Hub catalogue — differentiation check (2026-11-24)

- Catalogue: 200+ plugins (public catalogue, Nov 2026). Top apps: Weather,
  OcuClaw, Navigaze, DisplayPlus Music, Books, Live News.
- **Markets apps that exist:** ER Market and My Markets (stocks + crypto tickers),
  Stocks Indicator (live portfolio). All are **read-only tickers**.
- **No Polymarket / prediction-market app found. No trading app with a gated
  write path found.** No app combines live odds + voice draft + policy gate +
  paper execution.
- Differentiation for Gatekeeper: it is the only catalogue entrant that lets the
  user ACT on a market from the glasses — and the gate (allowlist, caps, price
  sanity, duplicate guard) is the feature, not an afterthought. That maps directly
  onto "read and write", the criterion the organizers say they judge first.

## Track 02 confirmation

Track 02 apps: Gram Wallet · Polymarket · Hyperliquid · Trust Wallet.
Track brief: "Check a wallet balance, live odds or an open position — place a
testnet bet or order by voice and confirm with one tap." Gatekeeper matches
exactly (paper execution against live prices is explicitly allowed: "testnet,
paper trading or read-only data").

## Sources

- https://dorahacks.io/hackathon/even-realities/detail (crawled 2026-11-24)
- https://hub.evenrealities.com/docs/get-started/quickstart/first-app
- https://www.hinty.eu/blog/even-hub-apps (catalogue, 13 Nov 2026)
- https://blog.constella.app/blog/best-even-g2-apps (catalogue, 11 Nov 2026)
