// paper.js — paper ledger: positions, place/cancel/close, live mark-to-market PnL.
// PAPER ONLY. No real funds, no wallet, no custody. State persists to data/paper.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { livePrice } from './markets.js'

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const DATA_FILE = join(DATA_DIR, 'paper.json')

function todayKey() {
  return new Date().toISOString().slice(0, 10) // UTC date
}

function load() {
  try {
    if (existsSync(DATA_FILE)) return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    // corrupted file: start fresh rather than crash the server
  }
  return { positions: [], daily: {}, lastOrderAt: 0, seq: 0 }
}

function save(state) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(state, null, 2))
}

let state = load()

export function listPositions() {
  return state.positions
}

export function openPositions() {
  return state.positions.filter((p) => p.status === 'open')
}

export function dailyVolumeUsd() {
  return state.daily[todayKey()] ?? 0
}

export function lastOrderAt() {
  return state.lastOrderAt
}

/** Mark-to-market PnL for one open position at the live price. */
export async function markPosition(p) {
  const live = await livePrice(p.marketId, p.side)
  if (live == null) return { ...p, livePrice: null, unrealizedPnl: null }
  const unrealizedPnl = (live - p.entryPrice) * p.shares
  return { ...p, livePrice: live, unrealizedPnl }
}

export async function summary() {
  const open = openPositions()
  const marked = []
  let unrealized = 0
  for (const p of open) {
    const m = await markPosition(p)
    marked.push(m)
    if (m.unrealizedPnl != null) unrealized += m.unrealizedPnl
  }
  const realized = state.positions
    .filter((p) => p.status === 'closed')
    .reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0)
  return {
    openCount: open.length,
    closedCount: state.positions.length - open.length,
    unrealizedPnl: round2(unrealized),
    realizedPnl: round2(realized),
    totalPnl: round2(unrealized + realized),
    dailyVolumeUsd: round2(dailyVolumeUsd()),
    positions: marked,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/** Fill a paper order at the live mid. Assumes the gate already passed. */
export async function place({ marketId, question, side, sizeUsd }) {
  const entryPrice = await livePrice(marketId, side)
  if (entryPrice == null || entryPrice <= 0) {
    throw new Error('no live price for this market')
  }
  const shares = sizeUsd / entryPrice
  state.seq += 1
  const position = {
    id: state.seq,
    marketId: String(marketId),
    question: question ?? '',
    side,
    sizeUsd,
    entryPrice,
    shares,
    status: 'open',
    createdAt: new Date().toISOString(),
    closedAt: null,
    closePrice: null,
    realizedPnl: null,
  }
  state.positions.push(position)
  state.daily[todayKey()] = (state.daily[todayKey()] ?? 0) + sizeUsd
  state.lastOrderAt = Date.now()
  save(state)
  return position
}

/** Close an open position at the live mid. */
export async function close(id) {
  const p = state.positions.find((x) => x.id === Number(id) && x.status === 'open')
  if (!p) return null
  const live = await livePrice(p.marketId, p.side)
  if (live == null) throw new Error('no live price for this market')
  p.status = 'closed'
  p.closePrice = live
  p.closedAt = new Date().toISOString()
  p.realizedPnl = round2((live - p.entryPrice) * p.shares)
  save(state)
  return p
}

/**
 * Cancel an open position at its entry price (realized PnL 0).
 * Paper semantic: the fill is unwound because nothing real ever moved.
 */
export function cancel(id) {
  const p = state.positions.find((x) => x.id === Number(id) && x.status === 'open')
  if (!p) return null
  p.status = 'cancelled'
  p.closePrice = p.entryPrice
  p.closedAt = new Date().toISOString()
  p.realizedPnl = 0
  save(state)
  return p
}

/** Test/ops helper: wipe the ledger. */
export function reset() {
  state = { positions: [], daily: {}, lastOrderAt: 0, seq: 0 }
  save(state)
}
