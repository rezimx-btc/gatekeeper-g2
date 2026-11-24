// Gatekeeper — G2 app (Day 2: Home + Market screens, live data from the server).
// One screen, one thing, one action. All money is PAPER — every screen says so.
// Screens: Home (top market + book PnL) → tap → Market (odds, volume, ends).
// Double-tap anywhere → exit (mode 1, system confirmation dialog, required on root).
// Voice draft/confirm lands on Day 3; the mic permission is already declared.

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

// In the simulator the backend runs on the same machine. On real hardware this
// becomes the deployed backend origin (whitelisted in app.json).
const SERVER_URL = 'http://localhost:8787'
const REFRESH_MS = 30_000

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
}

const bridge = await waitForEvenAppBridge()

let screen: 'home' | 'market' = 'home'
let markets: Market[] = []
let paper: PaperSummary | null = null
let lastError = ''

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
    `Book ${pnl} · ${open} open`,
    '',
    'Tap → market',
  ].join('\n')
}

function marketContent(): string {
  const top = markets[0]
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
    'Say "buy $10 YES"',
  ].join('\n')
}

function currentContent(): string {
  return screen === 'home' ? homeContent() : marketContent()
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

function refreshDisplay() {
  bridge.textContainerUpgrade(
    new TextContainerUpgrade({
      containerID: 1,
      containerName: 'main',
      content: currentContent(),
    }),
  )
}

async function refreshData() {
  try {
    const [mRes, pRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/markets`),
      fetch(`${SERVER_URL}/api/paper`),
    ])
    if (!mRes.ok) throw new Error(`markets HTTP ${mRes.status}`)
    if (!pRes.ok) throw new Error(`paper HTTP ${pRes.status}`)
    const mData = (await mRes.json()) as MarketsResponse
    markets = mData.markets ?? []
    paper = (await pRes.json()) as PaperSummary
    lastError = ''
  } catch (err) {
    lastError = String(err instanceof Error ? err.message : err)
    console.error('refreshData failed:', lastError)
  }
  refreshDisplay()
}

void refreshData()
setInterval(() => void refreshData(), REFRESH_MS)

// Event routing (same envelope rules as the minimal template):
//   • CLICK_EVENT is 0; protobuf omits zero-value fields, so a tap arrives
//     with eventType `undefined` — resolve the default INSIDE the envelope.
//   • Double-tap → shutDownPageContainer(1) is root-level: it must fire
//     no matter which envelope the event arrives in.
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    bridge.shutDownPageContainer(1)
    return
  }

  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    screen = screen === 'home' ? 'market' : 'home'
    refreshDisplay()
    return
  }

  if (
    sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
    sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
  ) {
    unsubscribe()
  }
})
