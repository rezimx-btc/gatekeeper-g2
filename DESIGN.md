# DESIGN.md — Gatekeeper for Even G2

**Event:** Heads Up: Even Realities Hackathon (DoraHacks, TVM Ventures & Daos Hub)
**Team:** rezimx-btc (solo) · **Track:** 02 · Crypto & DeFi
**Build window:** 23–29 Nov 2026 · **Submit deadline:** 29 Nov 23:59 Dubai = **30 Nov 02:59 WIB**
**Demo Day:** 3 Dec 2026, 14:00–18:00 Dubai (Daos Hub) — remote demo, no G2 hardware
**Prizes:** $10,000 USDT for 10 winners + up to 10 pairs of G2 · Grand $2,000 + 2 G2 · 1st/track $1,250 + 1–2 G2 · 2nd/track $500 · **Best Telegram integration $1,000** · cash paid in USDT within 7 days of Demo Day
**Status:** RESEARCH + DESIGN ONLY (21 Nov). App code starts at kickoff, 23 Nov 15:00 WIB.

---

## 1. The problem

Prediction markets and perps move while you walk. Checking them means pulling out your
phone, opening an app, reading a dashboard — and placing an order means typing numbers
into a tiny form, with no guardrail between a fat-fingered tap and real money.

On glasses the problem is sharper: a 576×288 monochrome display can show one thing, and
voice is the only fast input. A G2 trading app that only shows prices is a notification.
A G2 trading app that lets you trade with no checks is a loaded gun.

## 2. The concept — Gatekeeper

**One line:** *Glance at live prediction-market odds, ask your agent, and confirm a
proof-gated paper trade with one tap — never an unguarded order.*

Gatekeeper is a DeFi action assistant for Even G2. It reads live markets, drafts an
action, and **gates** it before anything executes — the Proof Gatekeeper pattern
(Uzan's Agent Games entry + Aevum "Proof-Gated Payee" build) applied to prediction
markets. Every proposed trade must pass a policy proof — market allowlist, per-trade
cap, daily cap, live-price sanity, duplicate guard — before the user can confirm it
with one tap, a ring gesture, or a voice "Yes".

This is deliberately NOT a price ticker. The judging weights say why:
- **Usefulness on G2 (30%)** — one real moment: "should I act on this market right now?"
- **Read and write (25%)** — the user doesn't just see odds; they act in seconds.
- **Technical execution (20%)** — works end to end: voice → agent → gate → fill → PnL.
- **UX for display and voice (15%)** — one screen, a few words, one action.
- **Business potential and safety (10%)** — the gate IS the safety story; TVM Ventures'
  stated thesis is DeFi + payments + **security**.

### Why Track 02, why this concept (and not the others)

| Option | Verdict |
|---|---|
| Track 04 AI Assistants (inbox triage) | Crowded — every AI coder builds it. Gmail OAuth is painful in a WebView (Google sign-in doesn't work; pairing code needed). No edge for Uzan. |
| Track 01 Messaging (Telegram reply) | Most obvious entry; doesn't use Uzan's security/payments edge. Kept only as the Telegram approval layer (special prize). |
| Track 03 Exchanges (Binance/OKX paper trading) | Needs exchange API keys; crowded with trading bots; weaker security story. |
| **Track 02 Crypto & DeFi — Gatekeeper** | **Chosen.** Only entrant likely to bring a security-gated write path. TVM's thesis (DeFi + payments + security) matches exactly. All read data is free/public (no keys, no accounts). The write is paper — explicitly allowed by the rules. |

### The moment (demo script)

1. Walking. Glance: `BTC ≥ $120K by Dec 31 — 64% YES · +3pts today · Paper book +$42`.
2. Voice: *"Buy ten dollars YES."*
3. Agent drafts; gate checks (allowlist ✓, $10 ≤ $25 cap ✓, daily $30/$100 ✓, price within 2% of live mid ✓, no duplicate position ✓).
4. Glasses show 3 lines: `BUY $10 YES @ 64¢` · `Gate: PASS 5/5` · `Tap / ring / "Yes" to confirm`.
5. Tap. `FILLED $10 YES @ 64¢ · Position #3 · PAPER`.
6. Same proposal mirrors to the user's Telegram bot; approving there also confirms (special-prize layer).
7. Positions screen: live PnL per position, close by voice + tap.

## 3. Architecture

```
G2 glasses (576×288 mono green, mic, temple touch, R1 ring)
   │ Bluetooth — Even Hub SDK bridge
   ▼
Even Realities App (phone) — WebView running the Vite + TS app
   │ HTTPS (whitelisted origin in app.json; no keys in the app)
   ▼
Gatekeeper server (Node, server/) — all secrets live here, never in the app
   ├── /api/markets   Polymarket Gamma (public) + CoinGecko free + Hyperliquid testnet /info mids (public read)
   ├── /api/paper     paper ledger: positions, place/cancel/close, live mark-to-market PnL
   ├── /api/gate      policy engine: allowlist, caps, price sanity, duplicate + cooldown guards
   ├── /api/voice     Groq Whisper (STT) + Groq LLM (intent → drafted action)
   └── /api/telegram  Telegram Bot API: mirror proposals, Approve/Reject buttons
```

**G2 app (`app/`, Vite + TypeScript, Even Hub SDK `@evenrealities/even_hub_sdk`):**
- 4 screens max, one thing per screen, text containers (576×288), `textContainerUpgrade`
  for flicker-free updates, `rebuildPageContainer` only for layout changes.
- Input: temple tap = confirm/select, double-tap = back/exit (mode 1 exit dialog on root),
  swipe = scroll list, long-press = cancel draft, R1 ring = same gesture set.
- Voice: raw mic audio via SDK `audioControl` → streamed to server `/api/voice`.
- `app.json` manifest: `package_id: com.rezimx.gatekeeper-g2`, edition `202601`,
  `network` permission whitelisting ONLY the backend origin, `g2-microphone` permission.

**Server (`server/`, Node + TypeScript):**
- Market data cached server-side (30 s) to respect CoinGecko free rate limits.
- Paper engine: positions in memory + JSON file; fills at live mid price; PnL marked live.
- Gate policy (defaults, user-configurable in settings):
  - Market allowlist: top-volume Polymarket markets + BTC/ETH reference markets only.
  - Per-trade cap: $25 paper. Daily cap: $100 paper.
  - Price sanity: draft price within 2% of live mid, else REJECT with reason on screen.
  - No duplicate open position on same market + side. 60 s cooldown between orders.
  - Every gate verdict is shown on the glasses (PASS 5/5 or the failing rule, in plain words).
- Telegram: Bot API polling (no webhook needed for demo); Approve/Reject inline buttons
  map to the same gate + paper execution path as the glasses tap.

**Money safety (hard rule, from the event rules):**
- **PAPER ONLY.** No real funds, no wallet connection, no custody, no financial advice.
  Every trade screen is labelled `PAPER`.
- **No real Hyperliquid testnet orders in the hackathon build** — see §6: the official
  testnet faucet (1,000 mock USDC) only pays addresses that already deposited on
  Hyperliquid mainnet. Uzan has no such deposit, and a mainnet deposit is real money
  outside the free-only mandate. Paper execution against live prices is explicitly
  allowed by the event rules ("testnet, paper trading or read-only data").

## 4. Data sources (all free, no accounts, no keys)

| Source | Use | Access |
|---|---|---|
| Polymarket Gamma API `https://gamma-api.polymarket.com` | Live markets, outcomes, prices, volume | Public, no key |
| Polymarket CLOB read `https://clob.polymarket.com` | Order book / price history (read-only) | Public, no key |
| CoinGecko free API | BTC/ETH spot prices | Public, rate-limited — cached 30 s server-side |
| Hyperliquid testnet `https://api.hyperliquid-testnet.xyz/info` | Perps mids (read-only) | Public, no key, no faucet needed for reads |
| Groq (connected account) | Whisper STT + LLM agent brain | Server-side key only, never in the app |
| Telegram Bot API | Approval mirror (special prize layer) | Free; bot token from @BotFather (user step, 2 min) |

## 5. Screens (576×288, monochrome green)

1. **Home** — top market (question, YES %, 24h move) + paper book PnL today. One tap → market.
2. **Market** — odds, volume, ends date; voice hint `Say "buy $10 YES"`.
3. **Draft / Confirm** — action + gate verdict + `Yes / No`. The money screen: 3 lines max.
4. **Positions** — scrollable list, live PnL each, voice/tap to close.
5. **Settings** (small) — caps, allowlist on/off, Telegram link status.

Design rules from the event page: one thing on screen, a few words, one action by tap /
ring / short phrase. No dashboards. Exit via mode-1 confirmation dialog on the root page.

## 6. Risks + open questions

1. **Hyperliquid testnet real orders are NOT freely available.** Faucet needs a prior
   mainnet deposit. Mitigation: paper engine (allowed). Optional upgrade (user decision
   only): a mainnet deposit unlocks real testnet orders — NOT in hackathon scope, do not
   ask for it during the build.
2. **Groq Whisper/LLM availability.** Fallback: preset voice commands + typed commands
   in the demo; verify Groq STT early (24 Nov) before building the voice loop on it.
3. **Simulator on a headless VM.** The simulator is a desktop LVGL window; use the
   headless automation API (`--automation-port`) for screenshots/CI. The 3-min demo video
   may need a display — decide 27 Nov (screen-record the simulator window if a display
   is available; otherwise assemble from automation screenshots + narration).
4. **Even Hub catalogue duplicates.** Check the catalogue at kickoff (23 Nov 15:00 WIB)
   for existing Polymarket/trading plugins; differentiate on the gate if one exists.
5. **Kickoff tech briefing (23 Nov 12:00 Dubai).** Even Realities shares "what makes a
   G2 app successful" — review before finalizing UI copy and screen flow.
6. **Telegram bot token** needs the user (2 min in @BotFather on his phone). Core app
   works without it; the Telegram layer is a bonus for the $1,000 special prize.
7. **Track-rule nuance:** Track 02 lists only the six DeFi apps; the special prize
   explicitly opens Telegram to "projects from any track". Telegram is used ONLY as an
   approval/notify channel; all market actions stay inside track-02 apps. If a judge
   reads the rule strictly, the entry still stands on its track-02 core.
8. **CoinGecko free rate limits** — mitigated by 30 s server-side caching.

## 7. Repo plan

```
even-realities/
├── DESIGN.md            ← this file
├── BUILD-PLAN.md        ← day-by-day plan 23–29 Nov
├── README.md            ← problem, setup, track, what existed before 23 Nov (scaffold only)
├── LICENSE              ← MIT
├── .gitignore
├── app/                 ← Vite + TS G2 app (scaffolded 23 Nov from `minimal` template)
│   ├── src/main.ts      ← bridge, screens, input routing (built 23–27 Nov)
│   ├── app.json         ← Even Hub manifest (package_id com.rezimx.gatekeeper-g2)
│   └── public/icon.png  ← 24×24 greyscale icon
├── server/              ← Node backend (markets, paper engine, gate, voice, telegram)
└── docs/                ← demo script, simulator screenshots, kickoff notes
```

- GitHub repo (public, `rezimx-btc/gatekeeper-g2` — name confirmed at build time) is
  created **23 Nov or later**, after the build starts. README must state what existed
  before 23 Nov: scaffold + DESIGN.md only.
- Deliverables: public repo + demo video ≤ 3 min (simulator) + short description
  (problem, who, how, track). Optional: packaged `.ehpk` build.

## 8. What the user needs to do (nothing before 23 Nov)

- **Nothing now.** Build starts at kickoff.
- Optional, during build: create a Telegram bot via @BotFather (2 min) and send the token
  for the approval layer — only if he wants the special-prize shot.
- Optional, NOT recommended: Hyperliquid mainnet deposit (real money) — only if he ever
  wants real testnet orders; not needed for this hackathon.
- Demo Day 3 Dec (remote): be available for a remote demo slot if Gatekeeper is a
  finalist — time TBD by organizers.

## 9. Sources (checked 21 Nov 2026)

- Event page: https://dorahacks.io/hackathon/even-realities/detail
- Even Hub docs: https://hub.evenrealities.com/docs/get-started/quickstart/first-app
- Device APIs: https://hub.evenrealities.com/docs/build/device-apis
- Simulator: https://hub.evenrealities.com/docs/test/simulator
- Templates: `npx degit even-realities/evenhub-templates/minimal` (also `text-heavy`, `asr`, `image`)
- Tooling (npm registry, verified 21 Nov): `@evenrealities/evenhub-cli` 0.2.0,
  `@evenrealities/evenhub-simulator` 0.9.5, `@evenrealities/even_hub_sdk` 0.0.16;
  local Node v24.22.1, npm 10.9.4
- Polymarket Gamma API: https://gamma-api.polymarket.com (public, no key)
- Hyperliquid testnet: https://api.hyperliquid-testnet.xyz (read public; faucet needs a
  prior mainnet deposit — https://app.hyperliquid-testnet.xyz/drip)
- CoinGecko free API (public, rate-limited)
