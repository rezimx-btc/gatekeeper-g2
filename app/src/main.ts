// Gatekeeper — G2 app (Day 4: + Positions / Settings / CloseConfirm / Closed).
// One screen, one thing, one action. All money is PAPER — every screen says so.
// Screens: Home (top market + book PnL) → tap → Market (odds, volume, ends)
//   → voice → Draft (action + gate verdict + confirm) → tap/ring/"Yes" → Filled.
//   Home scroll → Positions (open positions, scrollable) → tap position →
//   CloseConfirm (tap = close, swipe = cancel) → Closed; Positions → Settings
//   (per-trade cap / daily cap / allowlist / reset, tap cycles or toggles).
// Double-tap anywhere → exit (mode 1, system confirmation dialog, required on root).
//
// VOICE TRIGGER (Day 3 decision — see docs/day3-app-notes.md):
//   • The SDK HAS an event-source field, but ONLY on Sys_ItemEvent
//     (eventSource: EventSourceType; Text_ItemEvent carries no source).
//     Ring = TOUCH_EVENT_FROM_RING (2). Protobuf omits zero-value fields,
//     so an absent source is treated as a glasses tap — Day 2 behaviour
//     is preserved exactly when the host does not populate the field.
//   • Ring tap on Market (or Home) → start listening.
//   • FALLBACK trigger, because the host may never populate eventSource:
//     SCROLL (swipe) on Market → start listening. Day 2 ignored scroll,
//     so this changes nothing that existed.
//   • Tap on Market/Home still toggles home ↔ market (Day 2, unchanged).
//   • Long-press does NOT exist in this SDK (OsEventTypeList has no such
//     value), so draft cancel is SCROLL on the Draft screen instead —
//     DESIGN's "swipe = scroll list" is unused on that screen.
//   • Mic is opened with audioControl(true) on listen start and closed
//     with audioControl(false) on stop / cancel / exit, always.
//
// DAY 4 NAVIGATION (see docs/day4-app-notes.md):
//   • Home scroll → Positions. Positions/Settings scroll = move selection
//     (SCROLL_TOP = next row, SCROLL_BOTTOM = previous row, wraps).
//     Swipe on Positions/Settings NEVER triggers voice (unlike Market).
//   • Ring tap on Positions/Settings → start listening (draft mode).
//     A voice close/settings reply is routed back to Positions/Settings
//     (voiceOrigin), never forced to Market.
//   • CloseConfirm scroll → cancel back to Positions. Closed tap → Positions.

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
  EventSourceType,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  normalizePcm,
  concatPcm,
  buildWav,
  fmtPrice,
  fmtSizeUsd,
  summarizeGate,
  draftLine1,
  draftLine2,
  PER_TRADE_CAP_STEPS,
  DAILY_CAP_STEPS,
  nextStep,
  type GateSummary,
} from './voice'

// In the simulator the backend runs on the same machine. On real hardware this
// becomes the deployed backend origin (whitelisted in app.json).
const SERVER_URL = 'http://localhost:8787'
const REFRESH_MS = 30_000
// No PCM chunk within this long after listen start = "no audio heard".
const NO_AUDIO_MS = 10_000
// Yes/No answer window on the Draft screen (task: ~8 s).
const YESNO_MS = 8_000
// Safety cap on a draft-mode recording so the buffer cannot grow forever.
const MAX_LISTEN_MS = 30_000
// After this many "unclear" answers the mic stays off; tap/ring only.
const MAX_UNCLEAR = 2
// Render writes are debounced: the BLE render queue is slow (ASR template).
const RENDER_DEBOUNCE_MS = 120

type Market = {
  id: string
  question: string
  yesPrice: number
  noPrice: number
  volume24h: number
  endDate: string | null
}

type MarketsResponse = {
  markets: Market[]
  spot: Record<string, number>
  perps: Record<string, number>
}

type PaperSummary = {
  openCount: number
  unrealizedPnl: number
  realizedPnl: number
  totalPnl: number
  dailyVolumeUsd: number
  positions?: Position[]
}

/** One open paper position, as returned by GET /api/paper (already
 *  marked live by the server). ids are numbers server-side. */
type Position = {
  id: number
  marketId: string
  question: string
  side: string
  sizeUsd: number
  entryPrice: number
  shares: number
  status: string
  livePrice: number | null
  unrealizedPnl: number | null
}

type SettingsState = {
  perTradeCapUsd: number
  dailyCapUsd: number
  allowlistEnabled: boolean
  defaults?: { perTradeCapUsd: number; dailyCapUsd: number; allowlistEnabled: boolean }
  isDefault?: boolean
}

type VoiceDraft = {
  draftId: string
  marketId: string
  question: string
  side: string
  sizeUsd: number
  price: number
  gate: GateSummary
}

type FilledPosition = {
  id: string
  entryPrice: number
}

const bridge = await waitForEvenAppBridge()

type Screen =
  | 'home'
  | 'market'
  | 'draft'
  | 'filled'
  | 'positions'
  | 'settings'
  | 'closeConfirm'
  | 'closed'

let screen: Screen = 'home'
let markets: Market[] = []
let paper: PaperSummary | null = null
let lastError = ''
// Short voice error shown on the Market screen (mic failure, network, …).
let voiceError = ''
// Open positions (from GET /api/paper), in server order.
let openPositions: Position[] = []
// Day 4 — settings state (GET /api/settings; null until the first good fetch).
let settings: SettingsState | null = null
// Short error shown on the Settings screen when a settings POST fails.
let settingsError = ''
// Short voice/close note shown on the Positions screen.
let posNote = ''
// Selected row on Positions (0..openPositions.length+1: positions, Settings, Back).
let posSel = 0
// Selected row on Settings (0..4: per-trade, daily, allowlist, reset, back).
let setSel = 0
// Position awaiting close confirmation, if any.
let closeTarget: Position | null = null
// Last closed position shown on the Closed screen.
let closedInfo: { id: string; realizedPnl: number } | null = null
// Screen a draft-mode voice session started from, so mic/voice failures
// and non-buy replies route back there instead of always to Market.
let voiceOrigin: 'market' | 'positions' | 'settings' = 'market'
// Draft currently on screen, if any.
let draft: VoiceDraft | null = null
// Set when a confirm attempt is refused by the server's fresh gate check:
// the draft stays visible with this reason + "Tap to dismiss".
let draftBlockedReason: string | null = null
// Filled position shown on the Filled screen.
let filled: { draft: VoiceDraft; position: FilledPosition } | null = null

// ── Voice capture state ──────────────────────────────────────────────────
let listening = false
let listenMode: 'draft' | 'yesno' | null = null
let pcmChunks: Uint8Array[] = []
let gotAudio = false
let unclearCount = 0
let noAudioTimer: ReturnType<typeof setTimeout> | null = null
let maxListenTimer: ReturnType<typeof setTimeout> | null = null

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

function fmtUsd(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}$${n.toFixed(2)}`
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

function homeContent(): string {
  if (lastError && markets.length === 0) {
    return `GATEKEEPER · PAPER\n\nMarket data unavailable.\n${truncate(lastError, 40)}\n\nTap to retry`
  }
  const top = markets[0]
  const pnl = paper ? fmtUsd(paper.totalPnl) : '—'
  const open = paper ? paper.openCount : 0
  if (!top) return 'GATEKEEPER · PAPER\n\nLoading markets…'
  const yesPct = Math.round(top.yesPrice * 100)
  return [
    'GATEKEEPER · PAPER',
    '',
    truncate(top.question, 64),
    `YES ${yesPct}% · 24h ${fmtVol(top.volume24h)}`,
    `Book ${pnl} · ${open} open${lastError ? ' · STALE' : ''}`,
    '',
    'Tap → market',
  ].join('\n')
}

function marketContent(): string {
  const top = markets[0]
  if (voiceError) {
    return [
      'GATEKEEPER · PAPER',
      '',
      truncate(voiceError, 90),
      '',
      'Ring / swipe: voice · tap: home',
    ].join('\n')
  }
  if (!top) return 'GATEKEEPER · PAPER\n\nLoading markets…'
  const yesPct = Math.round(top.yesPrice * 100)
  const noPct = 100 - yesPct // derive so YES + NO always sums to 100 (rounding)
  const ends = top.endDate ? top.endDate.slice(0, 10) : '—'
  return [
    'GATEKEEPER · PAPER',
    '',
    truncate(top.question, 90),
    `YES ${yesPct}% · NO ${noPct}%`,
    `Vol 24h ${fmtVol(top.volume24h)} · ends ${ends}`,
    '',
    'Ring / swipe: voice · tap: home',
  ].join('\n')
}

function draftContent(): string {
  if (!draft) return 'GATEKEEPER · PAPER\n\nNo draft'
  const d = draft
  const line1 = draftLine1(d.sizeUsd, d.side, d.price)
  if (draftBlockedReason) {
    // Confirm was refused by the server's fresh gate check: stay on the
    // draft, show the reason, tap dismisses (no confirm offered).
    return [
      'GATEKEEPER · PAPER',
      '',
      line1,
      `Gate: REJECT — ${truncate(draftBlockedReason, 48)}`,
      'Tap to dismiss',
    ].join('\n')
  }
  if (d.gate.verdict === 'REJECT') {
    return [
      'GATEKEEPER · PAPER',
      '',
      line1,
      truncate(draftLine2(d.gate), 64),
      'Tap to dismiss',
    ].join('\n')
  }
  return [
    'GATEKEEPER · PAPER',
    '',
    line1,
    draftLine2(d.gate),
    'Tap / ring / "Yes" to confirm',
  ].join('\n')
}

function filledContent(): string {
  if (!filled) return 'GATEKEEPER · PAPER\n\nNo fill'
  const { draft: d, position } = filled
  return [
    'GATEKEEPER · PAPER',
    '',
    `FILLED ${fmtSizeUsd(d.sizeUsd)} ${d.side.toUpperCase()} @ ${fmtPrice(position.entryPrice)} · Position #${position.id} · PAPER`,
    '',
    'Tap → home',
  ].join('\n')
}

function listeningContent(): string {
  if (listenMode === 'yesno') {
    return [
      'GATEKEEPER · PAPER',
      '',
      'Say Yes or No',
      'Listening…',
      '',
      'Tap to send',
    ].join('\n')
  }
  return [
    'GATEKEEPER · PAPER',
    '',
    'Listening…',
    'Say "buy $10 YES"',
    '',
    'Tap to send',
  ].join('\n')
}

// ── Day 4 screens ────────────────────────────────────────────────────────

function positionsRowCount(): number {
  // Open positions + footer rows (Settings, Back).
  return openPositions.length + 2
}

function clampSelections() {
  const maxPos = Math.max(0, positionsRowCount() - 1)
  if (posSel > maxPos) posSel = maxPos
  if (posSel < 0) posSel = 0
  if (setSel > 4) setSel = 4
  if (setSel < 0) setSel = 0
}

function positionLine(p: Position): string {
  const pnl = p.unrealizedPnl ?? 0
  return `#${p.id} ${String(p.side).toUpperCase()} ${fmtSizeUsd(p.sizeUsd)} · PnL ${fmtUsd(pnl)}`
}

function positionsContent(): string {
  const lines = ['POSITIONS · PAPER']
  const total = paper ? fmtUsd(paper.totalPnl) : '—'
  lines.push(`Book ${total} · ${openPositions.length} open${lastError ? ' · STALE' : ''}`)
  if (openPositions.length === 0) {
    lines.push('No open positions')
  } else {
    for (let i = 0; i < openPositions.length; i++) {
      lines.push(`${posSel === i ? '> ' : '  '}${positionLine(openPositions[i])}`)
    }
  }
  const setIdx = openPositions.length
  const backIdx = openPositions.length + 1
  lines.push(`${posSel === setIdx ? '> ' : '  '}Settings`)
  lines.push(`${posSel === backIdx ? '> ' : '  '}← Back`)
  if (posNote) lines.push(truncate(posNote, 64))
  return lines.join('\n')
}

function settingsContent(): string {
  const lines = ['SETTINGS · PAPER']
  const cap = settings ? `$${settings.perTradeCapUsd}` : '—'
  const daily = settings ? `$${settings.dailyCapUsd}` : '—'
  const allow = settings ? (settings.allowlistEnabled ? 'ON' : 'OFF') : '—'
  const rows = [
    `Per-trade cap ${cap}`,
    `Daily cap ${daily}`,
    `Allowlist ${allow}`,
    'Reset defaults',
    '← Back',
  ]
  for (let i = 0; i < rows.length; i++) {
    lines.push(`${setSel === i ? '> ' : '  '}${rows[i]}`)
  }
  if (settingsError) lines.push(truncate(settingsError, 64))
  return lines.join('\n')
}

function closeConfirmContent(): string {
  if (!closeTarget) return 'POSITIONS · PAPER\n\nNo position selected'
  const p = closeTarget
  const price = p.livePrice ?? p.entryPrice
  const pnl = p.unrealizedPnl ?? 0
  return [
    `CLOSE #${p.id}?`,
    `${String(p.side).toUpperCase()} ${fmtSizeUsd(p.sizeUsd)} @ ${fmtPrice(price)} · PnL ${fmtUsd(pnl)}`,
    'Tap to confirm · swipe to cancel',
  ].join('\n')
}

function closedContent(): string {
  if (!closedInfo) return 'POSITIONS · PAPER\n\nNo close recorded'
  return [
    `CLOSED #${closedInfo.id} · ${fmtUsd(closedInfo.realizedPnl)} · PAPER`,
    'Tap → positions',
  ].join('\n')
}

function currentContent(): string {
  if (listening) return listeningContent()
  switch (screen) {
    case 'home':
      return homeContent()
    case 'market':
      return marketContent()
    case 'draft':
      return draftContent()
    case 'filled':
      return filledContent()
    case 'positions':
      return positionsContent()
    case 'settings':
      return settingsContent()
    case 'closeConfirm':
      return closeConfirmContent()
    case 'closed':
      return closedContent()
  }
}

const mainText = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: 'main',
  content: 'GATEKEEPER · PAPER\n\nLoading markets…',
  isEventCapture: 1,
})

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [mainText],
  }),
)
console.log('Page created:', result === 0 ? 'success' : `failed (${result})`)

let renderTimer: ReturnType<typeof setTimeout> | null = null
function refreshDisplay() {
  if (renderTimer !== null) return
  renderTimer = setTimeout(() => {
    renderTimer = null
    void bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: 1,
        containerName: 'main',
        content: currentContent(),
      }),
    )
  }, RENDER_DEBOUNCE_MS)
}

async function refreshData() {
  try {
    const [mRes, pRes, sRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/markets`),
      fetch(`${SERVER_URL}/api/paper`),
      fetch(`${SERVER_URL}/api/settings`),
    ])
    if (!pRes.ok) throw new Error(`paper HTTP ${pRes.status}`)
    // Day 5 — paper + settings are fast (<10 ms); apply them FIRST so
    // Positions / Settings render immediately instead of waiting ~3.4 s
    // for /api/markets when its upstream cache is cold. Markets apply
    // when ready below; a markets failure no longer discards fresh paper.
    const pData = (await pRes.json()) as PaperSummary
    paper = pData
    // Positions arrive already marked live; keep only the open ones.
    openPositions = (pData.positions ?? []).filter((p) => p.status === 'open')
    // A settings 404 (endpoint not landed yet) must not break the refresh
    // or wipe a good earlier value — keep whatever we already have.
    if (sRes.ok) {
      try {
        settings = (await sRes.json()) as SettingsState
      } catch {
        // Keep the previous settings value.
      }
    }
    clampSelections()
    refreshDisplay()
    if (!mRes.ok) throw new Error(`markets HTTP ${mRes.status}`)
    const mData = (await mRes.json()) as MarketsResponse
    markets = mData.markets ?? []
    lastError = ''
  } catch (err) {
    lastError = String(err instanceof Error ? err.message : err)
    console.error('refreshData failed:', lastError)
  }
  refreshDisplay()
}

/** Fetch settings only (used when entering Settings and after a voice
 *  settings reply). A failure keeps the previous value; never crashes. */
async function refreshSettings() {
  try {
    const res = await fetch(`${SERVER_URL}/api/settings`)
    if (!res.ok) return
    settings = (await res.json()) as SettingsState
    refreshDisplay()
  } catch (err) {
    console.error('refreshSettings failed:', err)
  }
}

/** POST one settings change (or a reset when `url` is the reset endpoint).
 *  On success the server's returned settings become the displayed values;
 *  on failure a short reason is shown on the Settings screen, no crash. */
async function applySettingsRequest(url: string, body: Record<string, unknown> | null) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === null ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new Error(
        String(data.error ?? data.reason ?? `HTTP ${res.status}`),
      )
    }
    settings = data as unknown as SettingsState
    settingsError = ''
  } catch (err) {
    settingsError = truncate(
      String(err instanceof Error ? err.message : err),
      40,
    )
  }
  refreshDisplay()
}

async function postSettings(patch: Record<string, unknown>) {
  await applySettingsRequest(`${SERVER_URL}/api/settings`, patch)
}

async function resetSettings() {
  await applySettingsRequest(`${SERVER_URL}/api/settings/reset`, null)
}

/** Cycle one cap to its next step (wrapping) and POST it. */
function cycleCap(kind: 'perTrade' | 'daily') {
  if (!settings) {
    settingsError = 'Settings unavailable'
    refreshDisplay()
    return
  }
  if (kind === 'perTrade') {
    void postSettings({ perTradeCapUsd: nextStep(PER_TRADE_CAP_STEPS, settings.perTradeCapUsd) })
  } else {
    void postSettings({ dailyCapUsd: nextStep(DAILY_CAP_STEPS, settings.dailyCapUsd) })
  }
}

void refreshData()
setInterval(() => void refreshData(), REFRESH_MS)

// ── Voice capture ────────────────────────────────────────────────────────

function clearListenTimers() {
  if (noAudioTimer !== null) {
    clearTimeout(noAudioTimer)
    noAudioTimer = null
  }
  if (maxListenTimer !== null) {
    clearTimeout(maxListenTimer)
    maxListenTimer = null
  }
}

async function closeMic() {
  try {
    await bridge.audioControl(false)
  } catch (err) {
    console.error('audioControl(false) failed:', err)
  }
}

/** Stop listening without sending (cancel path, screen change, exit). */
async function stopListeningSilent() {
  clearListenTimers()
  listening = false
  listenMode = null
  pcmChunks = []
  gotAudio = false
  await closeMic()
}

/** Show a draft-mode voice failure on the screen the session started
 *  from (Market, Positions, or Settings) and go back there. Yes/No mode
 *  never calls this — it stays on the Draft screen. */
function showVoiceFailure(msg: string) {
  if (voiceOrigin === 'positions') {
    posNote = msg
    screen = 'positions'
  } else if (voiceOrigin === 'settings') {
    settingsError = msg
    screen = 'settings'
  } else {
    voiceError = msg
    screen = 'market'
  }
  refreshDisplay()
}

/** Begin a listening window. Returns false when the mic cannot be opened. */
async function startListening(mode: 'draft' | 'yesno'): Promise<boolean> {
  if (listening) return true
  let opened = false
  try {
    opened = await bridge.audioControl(true)
  } catch (err) {
    console.error('audioControl(true) failed:', err)
  }
  if (!opened) {
    // Mic failure is a screen error, never a crash.
    if (mode === 'draft') {
      draft = null
      showVoiceFailure('Mic unavailable')
    } else {
      voiceError = 'Mic unavailable'
      screen = 'market'
      draft = null
      refreshDisplay()
    }
    return false
  }
  listening = true
  listenMode = mode
  pcmChunks = []
  gotAudio = false
  // No audio at all within the window -> stop, report, do not send silence.
  noAudioTimer = setTimeout(() => {
    if (!listening || gotAudio) return
    void (async () => {
      await stopListeningSilent()
      if (mode === 'draft') {
        showVoiceFailure('No audio heard')
      } else {
        voiceError = 'No audio heard'
        screen = 'market'
        refreshDisplay()
      }
    })()
  }, NO_AUDIO_MS)
  // Hard cap so a forgotten session cannot record / buffer forever.
  maxListenTimer = setTimeout(
    () => {
      if (!listening) return
      void stopListeningAndSend()
    },
    mode === 'yesno' ? YESNO_MS : MAX_LISTEN_MS,
  )
  refreshDisplay()
  return true
}

/** Stop the mic, build the WAV, send it to the server, route the reply. */
async function stopListeningAndSend() {
  if (!listening) return
  const mode = listenMode
  clearListenTimers()
  listening = false
  listenMode = null
  const chunks = pcmChunks
  pcmChunks = []
  const heardAnything = gotAudio
  gotAudio = false
  await closeMic()
  if (!heardAnything || chunks.length === 0) {
    if (mode === 'yesno') {
      // Stay on the draft; tap/ring is still available.
      refreshDisplay()
      return
    }
    showVoiceFailure('No audio heard')
    return
  }
  const wavBytes = buildWav(concatPcm(chunks))
  const wavBlob = new Blob([wavBytes.buffer as ArrayBuffer], { type: 'audio/wav' })
  if (mode === 'yesno') {
    await sendYesNo(wavBlob)
  } else {
    await sendDraftVoice(wavBlob)
  }
}

function shortErr(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return truncate(msg, 40)
}

/** Draft-mode reply: a fresh draft, a non-buy intent, or a network error. */
async function sendDraftVoice(wav: Blob) {
  const topMarket = markets[0]
  const url = topMarket
    ? `${SERVER_URL}/api/voice?marketId=${encodeURIComponent(topMarket.id)}`
    : `${SERVER_URL}/api/voice`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav,
    })
    const data = (await res.json()) as Record<string, any>
    if (res.ok && data.ok && data.draftId && data.draft) {
      const d = data.draft as Record<string, any>
      draft = {
        draftId: String(data.draftId),
        marketId: String(d.marketId ?? topMarket?.id ?? ''),
        question: String(d.question ?? topMarket?.question ?? ''),
        side: String(d.side ?? 'YES'),
        sizeUsd: Number(d.sizeUsd ?? 0),
        price: Number(d.price ?? 0),
        gate: summarizeGate(data.gate),
      }
      draftBlockedReason = null
      unclearCount = 0
      voiceError = ''
      screen = 'draft'
      refreshDisplay()
      // Gate PASS: listen for the spoken Yes/No answer right away.
      if (draft.gate.verdict === 'PASS') {
        await startListening('yesno')
      }
      return
    }
    // Intent understood but not a buy (or server-side rejection).
    const reason = String(data.reason ?? data.error ?? 'not a buy order')
    const transcript = data.transcript ? String(data.transcript) : ''
    const action = String(data.action ?? '')
    // Day 4 — voice close: success shows the Closed screen with the real
    // realised PnL; failure shows the reason on Positions and stays there.
    if (action === 'close') {
      if (data.ok && data.position) {
        const pos = data.position as Record<string, unknown>
        closedInfo = {
          id: String(pos.id ?? '?'),
          realizedPnl: Number(pos.realizedPnl ?? 0),
        }
        closeTarget = null
        posNote = ''
        voiceError = ''
        screen = 'closed'
        refreshDisplay()
        void refreshData()
        return
      }
      posNote = transcript
        ? `${truncate(transcript, 20)}: ${truncate(reason, 20)}`
        : truncate(reason, 40)
      screen = 'positions'
      refreshDisplay()
      return
    }
    // Day 4 — voice settings: success re-fetches settings and shows the
    // Settings screen; failure shows the reason on the screen we came from.
    if (action === 'settings') {
      if (data.ok) {
        await refreshSettings()
        settingsError = ''
        screen = 'settings'
        refreshDisplay()
        return
      }
      showVoiceFailure(truncate(reason, 40))
      return
    }
    showVoiceFailure(
      transcript
        ? `${truncate(transcript, 20)}: ${truncate(reason, 20)}`
        : truncate(reason, 40),
    )
  } catch (err) {
    showVoiceFailure(`Voice failed: ${shortErr(err)}`)
    refreshDisplay()
  }
}

/** Yes/No reply on the Draft screen. */
async function sendYesNo(wav: Blob) {
  if (!draft) {
    screen = 'market'
    refreshDisplay()
    return
  }
  const form = new FormData()
  form.append('audio', wav, 'answer.wav')
  form.append('draftId', draft.draftId)
  try {
    const res = await fetch(`${SERVER_URL}/api/voice`, { method: 'POST', body: form })
    const data = (await res.json()) as Record<string, any>
    // Route on the heard verdict FIRST: a "yes" whose fresh gate check
    // fails comes back as HTTP 403 with heard:'yes' + filled:false — that
    // is a draft outcome, not a network error, and the draft stays on
    // screen with the failing rule. Only a reply with no heard verdict
    // at all (400/503/…) is a genuine voice failure.
    const heard = String(data.heard ?? '')
    if (heard === 'yes') {
      await resolveYes(data)
      return
    }
    if (heard === 'no') {
      await cancelDraft()
      return
    }
    if (heard === 'unclear') {
      // Ask once more, at most MAX_UNCLEAR times.
      unclearCount += 1
      if (unclearCount >= MAX_UNCLEAR) {
        // Mic stays off; tap / ring still confirms or cancels (scroll).
        refreshDisplay()
        return
      }
      await startListening('yesno')
      return
    }
    voiceError = `Voice failed: ${truncate(String(data.reason ?? data.error ?? `HTTP ${res.status}`), 40)}`
    screen = 'market'
    draft = null
    refreshDisplay()
  } catch (err) {
    voiceError = `Voice failed: ${shortErr(err)}`
    screen = 'market'
    draft = null
    refreshDisplay()
  }
}

/** Heard "yes": the server reply already carries the fill on success, or
 *  the fresh gate verdict on refusal. The server already ran the confirm
 *  (and deleted the draft on refusal), so a refused "yes" must NOT call
 *  confirm again — it would 404 on the deleted draft. Show the failing
 *  rule on the draft screen instead; tap dismisses. */
async function resolveYes(data: Record<string, any>) {
  if (!draft) return
  if (data.filled && data.position) {
    showFilled(data.position as Record<string, any>)
    return
  }
  const gate = summarizeGate(data.gate)
  draftBlockedReason =
    gate.failedRule ??
    (typeof data.reason === 'string' ? data.reason : null) ??
    (typeof data.error === 'string' ? data.error : null) ??
    'Confirm refused'
  refreshDisplay()
}

/** Tap / ring confirm on the Draft screen. */
async function confirmDraft() {
  if (!draft) return
  try {
    const res = await fetch(`${SERVER_URL}/api/voice/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: draft.draftId }),
    })
    const data = (await res.json()) as Record<string, any>
    if (res.ok && data.filled && data.position) {
      showFilled(data.position as Record<string, any>)
      return
    }
    if (res.status === 404 || res.status === 410) {
      // Draft is gone server-side (expired / already handled): drop it.
      voiceError = 'Draft expired'
      draft = null
      draftBlockedReason = null
      screen = 'market'
      refreshDisplay()
      return
    }
    // 403 (or any non-fill): fresh gate verdict — stay on the draft,
    // show the failing rule, tap dismisses.
    const gate = summarizeGate(data.gate)
    draftBlockedReason =
      gate.failedRule ??
      (typeof data.reason === 'string' ? data.reason : null) ??
      `confirm refused (HTTP ${res.status})`
    refreshDisplay()
  } catch (err) {
    draftBlockedReason = `Confirm failed: ${shortErr(err)}`
    refreshDisplay()
  }
}

function showFilled(positionRaw: Record<string, any>) {
  if (!draft) return
  const entryPrice = Number(positionRaw.entryPrice ?? draft.price)
  filled = {
    draft,
    position: {
      id: String(positionRaw.id ?? positionRaw.positionId ?? '?'),
      entryPrice: Number.isFinite(entryPrice) ? entryPrice : draft.price,
    },
  }
  draft = null
  draftBlockedReason = null
  screen = 'filled'
  refreshDisplay()
  void refreshData()
}

/** Cancel the draft server-side (best effort) and return to Market. */
async function cancelDraft() {
  const id = draft?.draftId
  draft = null
  draftBlockedReason = null
  unclearCount = 0
  screen = 'market'
  refreshDisplay()
  if (id) {
    try {
      await fetch(`${SERVER_URL}/api/voice/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: id }),
      })
    } catch (err) {
      console.error('cancel draft failed:', err)
    }
  }
}

// ── Day 4 — Positions / Settings / Close ─────────────────────────────────

/** Tap on the Positions screen: a position row opens CloseConfirm, the
 *  Settings row opens Settings (fresh fetch), Back returns Home. */
function positionsTap() {
  const n = openPositions.length
  if (posSel < n) {
    closeTarget = openPositions[posSel]
    screen = 'closeConfirm'
    refreshDisplay()
    return
  }
  if (posSel === n) {
    settingsError = ''
    screen = 'settings'
    void refreshSettings()
    refreshDisplay()
    return
  }
  screen = 'home'
  refreshDisplay()
}

/** Tap on the Settings screen: caps cycle to the next step + POST, the
 *  allowlist toggles + POST, Reset POSTs the reset endpoint, Back returns
 *  to Positions. Every POST re-renders with the server-confirmed values. */
function settingsTapRow() {
  switch (setSel) {
    case 0:
      cycleCap('perTrade')
      return
    case 1:
      cycleCap('daily')
      return
    case 2:
      if (!settings) {
        settingsError = 'Settings unavailable'
        refreshDisplay()
        return
      }
      void postSettings({ allowlistEnabled: !settings.allowlistEnabled })
      return
    case 3:
      void resetSettings()
      return
    default:
      screen = 'positions'
      refreshDisplay()
      return
  }
}

/** Tap on CloseConfirm: POST /api/paper/close. Success → Closed screen
 *  with the real realised PnL. 404 (already closed / gone) → Positions +
 *  refresh. Any other failure → Positions with a short reason, no crash. */
async function confirmClose() {
  if (!closeTarget) {
    screen = 'positions'
    refreshDisplay()
    return
  }
  const id = closeTarget.id
  try {
    const res = await fetch(`${SERVER_URL}/api/paper/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok && (data.closed || data.position)) {
      const pos = (data.position ?? {}) as Record<string, unknown>
      closedInfo = {
        id: String(pos.id ?? id),
        realizedPnl: Number(pos.realizedPnl ?? 0),
      }
      closeTarget = null
      screen = 'closed'
      refreshDisplay()
      void refreshData()
      return
    }
    closeTarget = null
    screen = 'positions'
    if (res.status !== 404) {
      posNote = truncate(
        String(data.error ?? data.reason ?? `Close failed (HTTP ${res.status})`),
        40,
      )
    }
    refreshDisplay()
    void refreshData()
  } catch (err) {
    closeTarget = null
    screen = 'positions'
    posNote = `Close failed: ${shortErr(err)}`
    refreshDisplay()
  }
}

// ── Event routing ────────────────────────────────────────────────────────
//
// Same envelope rules as the Day 2 template:
//   • CLICK_EVENT is 0; protobuf omits zero-value fields, so a tap arrives
//     with eventType `undefined` — resolve the default INSIDE the envelope.
//   • Double-tap → shutDownPageContainer(1) is root-level: it must fire
//     no matter which envelope the event arrives in.
//   • Audio PCM frames arrive as event.audioEvent — a separate branch that
//     must NOT be read as a tap (the Day 2 trap the ASR template warns about).

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

/** Read the tap source. Only Sys_ItemEvent carries eventSource in the SDK
 *  types; Text_ItemEvent does not. The host JSON may use either camelCase
 *  or the proto name, and the value may be a number or a name string.
 *  Returns undefined when the host did not populate it — callers treat
 *  that as a glasses tap (Day 2 behaviour). */
function eventSourceOf(event: EvenHubEvent): EventSourceType | undefined {
  const raw =
    (event.sysEvent as Record<string, any> | undefined)?.eventSource ??
    (event.sysEvent as Record<string, any> | undefined)?.EventSource ??
    (event.jsonData as Record<string, any> | undefined)?.eventSource ??
    (event.jsonData as Record<string, any> | undefined)?.EventSource
  if (typeof raw === 'number') return raw as EventSourceType
  if (typeof raw === 'string') {
    const name = raw.toUpperCase()
    if (name.includes('RING')) return EventSourceType.TOUCH_EVENT_FROM_RING
    if (name.includes('GLASSES_R')) return EventSourceType.TOUCH_EVENT_FROM_GLASSES_R
    if (name.includes('GLASSES_L')) return EventSourceType.TOUCH_EVENT_FROM_GLASSES_L
    const n = Number(raw)
    if (Number.isFinite(n)) return n as EventSourceType
  }
  return undefined
}

function isScroll(type: OsEventTypeList | null): boolean {
  return type === OsEventTypeList.SCROLL_TOP_EVENT || type === OsEventTypeList.SCROLL_BOTTOM_EVENT
}

let cleanedUp = false
async function cleanupMicAndUnsubscribe() {
  if (cleanedUp) return
  cleanedUp = true
  await closeMic()
  unsubscribe()
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  // ── Audio frames ──
  const pcmRaw = event.audioEvent?.audioPcm
  if (pcmRaw !== undefined && listening) {
    const bytes = normalizePcm(pcmRaw as unknown)
    if (bytes && bytes.length > 0) {
      if (!gotAudio && noAudioTimer !== null) {
        clearTimeout(noAudioTimer)
        noAudioTimer = null
      }
      gotAudio = true
      pcmChunks.push(bytes)
    }
    return
  }

  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  // ── Exit (root-level, always wins) ──
  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    void (async () => {
      await stopListeningSilent()
      await bridge.shutDownPageContainer(1)
    })()
    return
  }

  const isClick =
    sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT
  const isScrollEvent = isScroll(sysType) || isScroll(textType)

  if (isScrollEvent) {
    // Scroll on Draft = cancel draft (no long-press exists in this SDK).
    // Scroll on Market = voice fallback trigger (see header comment).
    if (screen === 'draft' && !listening) {
      void cancelDraft()
      return
    }
    if (screen === 'market' && !listening) {
      voiceOrigin = 'market'
      void startListening('draft')
      return
    }
    // Day 4 — Home scroll → Positions (Day 2/3 ignored scroll on Home).
    if (screen === 'home' && !listening) {
      screen = 'positions'
      posNote = ''
      void refreshData()
      return
    }
    // Day 4 — Positions/Settings scroll = move selection, never voice.
    // SCROLL_TOP (swipe up) = next row, SCROLL_BOTTOM = previous, wraps.
    if (screen === 'positions' && !listening) {
      const n = positionsRowCount()
      const dir = sysType === OsEventTypeList.SCROLL_TOP_EVENT || textType === OsEventTypeList.SCROLL_TOP_EVENT ? 1 : -1
      posSel = (posSel + dir + n) % n
      refreshDisplay()
      return
    }
    if (screen === 'settings' && !listening) {
      const dir = sysType === OsEventTypeList.SCROLL_TOP_EVENT || textType === OsEventTypeList.SCROLL_TOP_EVENT ? 1 : -1
      setSel = (setSel + dir + 5) % 5
      refreshDisplay()
      return
    }
    // Day 4 — CloseConfirm scroll = cancel back to Positions.
    if (screen === 'closeConfirm' && !listening) {
      closeTarget = null
      screen = 'positions'
      refreshDisplay()
      return
    }
    return
  }

  if (!isClick) {
    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      void cleanupMicAndUnsubscribe()
    }
    return
  }

  // ── Single tap / ring tap ──
  const source = eventSourceOf(event)
  const isRing = source === EventSourceType.TOUCH_EVENT_FROM_RING
  // Hardware debug: the first time a real ring tap lands, this line proves
  // the host populates eventSource. (Simulator taps show `undefined`.)
  console.log('tap: screen=', screen, 'listening=', listening, 'source=', source)

  // While listening, any tap (glasses or ring) stops and sends.
  if (listening) {
    void stopListeningAndSend()
    return
  }

  if (screen === 'draft') {
    if (draftBlockedReason || (draft && draft.gate.verdict === 'REJECT')) {
      // Tap dismisses a rejected / refused draft.
      void cancelDraft()
      return
    }
    // Tap (or ring tap) confirms a PASS draft.
    void confirmDraft()
    return
  }

  if (screen === 'filled') {
    screen = 'home'
    filled = null
    void refreshData()
    return
  }

  // Day 4 — Positions / Settings tap routing (ring tap = voice entry).
  if (screen === 'positions') {
    if (isRing) {
      voiceOrigin = 'positions'
      posNote = ''
      void startListening('draft')
      return
    }
    positionsTap()
    return
  }

  if (screen === 'settings') {
    if (isRing) {
      voiceOrigin = 'settings'
      settingsError = ''
      void startListening('draft')
      return
    }
    settingsTapRow()
    return
  }

  // Day 4 — CloseConfirm tap = confirm the close; Closed tap → Positions.
  // (A ring tap here acts as a plain tap; voice entry is only defined for
  // Home / Market / Positions / Settings.)
  if (screen === 'closeConfirm') {
    void confirmClose()
    return
  }

  if (screen === 'closed') {
    screen = 'positions'
    closedInfo = null
    void refreshData()
    return
  }

  if (isRing) {
    // Ring tap: voice entry from Home or Market (glasses tap keeps Day 2).
    voiceOrigin = 'market'
    voiceError = ''
    void startListening('draft')
    return
  }

  // Day 2 tap toggle, unchanged.
  screen = screen === 'home' ? 'market' : 'home'
  voiceError = ''
  refreshDisplay()
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void cleanupMicAndUnsubscribe()
  })
}
