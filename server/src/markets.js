// markets.js — live market data with 30 s server-side cache.
// Sources (all public, no keys): Polymarket Gamma, CoinGecko free, Hyperliquid testnet.

const GAMMA = 'https://gamma-api.polymarket.com/markets'
const COINGECKO =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
const HL_TESTNET = 'https://api.hyperliquid-testnet.xyz/info'

const CACHE_TTL_MS = 30_000

let cache = null // { at, data }
let inflight = null

async function fetchJson(url, options) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...options })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
  return res.json()
}

function parseOutcomes(market) {
  try {
    const prices = JSON.parse(market.outcomePrices || '[]').map(Number)
    const names = JSON.parse(market.outcomes || '["Yes","No"]')
    if (prices.length < 2 || prices.some((p) => !Number.isFinite(p))) return null
    return { yes: prices[0], no: prices[1], yesName: names[0] ?? 'Yes', noName: names[1] ?? 'No' }
  } catch {
    return null
  }
}

export async function getMarkets() {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_TTL_MS) return { ...cache.data, cached: true }
  if (inflight) return inflight

  inflight = (async () => {
    const [gamma, gecko, hl] = await Promise.allSettled([
      fetchJson(
        `${GAMMA}?limit=12&active=true&closed=false&order=volume24hr&ascending=false`,
      ),
      fetchJson(COINGECKO),
      fetchJson(HL_TESTNET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
      }),
    ])

    const markets = []
    if (gamma.status === 'fulfilled' && Array.isArray(gamma.value)) {
      for (const m of gamma.value) {
        const o = parseOutcomes(m)
        if (!o) continue
        markets.push({
          id: String(m.id),
          slug: m.slug ?? null,
          question: m.question ?? '',
          yesPrice: o.yes,
          noPrice: o.no,
          yesName: o.yesName,
          noName: o.noName,
          volume24h: Number(m.volume24hr) || 0,
          volume: Number(m.volume) || 0,
          endDate: m.endDate ?? null,
          source: 'polymarket',
        })
      }
    }

    const spot = {}
    if (gecko.status === 'fulfilled') {
      if (gecko.value.bitcoin?.usd != null) spot.BTC = gecko.value.bitcoin.usd
      if (gecko.value.ethereum?.usd != null) spot.ETH = gecko.value.ethereum.usd
    }
    const perps = {}
    if (hl.status === 'fulfilled') {
      if (hl.value.BTC != null) perps.BTC = Number(hl.value.BTC)
      if (hl.value.ETH != null) perps.ETH = Number(hl.value.ETH)
    }

    const data = {
      asOf: new Date().toISOString(),
      markets,
      spot,
      perps,
      sources: {
        gamma: gamma.status,
        coingecko: gecko.status,
        hyperliquidTestnet: hl.status,
      },
    }
    cache = { at: Date.now(), data }
    inflight = null
    return { ...data, cached: false }
  })()

  return inflight
}

/** Live mid price for one side of a market (yesPrice / noPrice). Null if unknown. */
export async function livePrice(marketId, side) {
  const { markets } = await getMarkets()
  const m = markets.find((x) => x.id === String(marketId))
  if (!m) return null
  return side === 'NO' ? m.noPrice : m.yesPrice
}

/** True when the market is in the current allowlist (top-volume Gamma list). */
export async function isAllowlisted(marketId) {
  const { markets } = await getMarkets()
  return markets.some((x) => x.id === String(marketId))
}

export function clearCache() {
  cache = null
}
