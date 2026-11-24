// gate.js — policy engine. Every proposed trade must pass ALL rules before the
// user can confirm it. A failing rule is shown on the glasses in plain words.

import { isAllowlisted, livePrice } from './markets.js'
import { openPositions, dailyVolumeUsd, lastOrderAt } from './paper.js'
import { settingsStore } from './settings.js'

export const POLICY = {
  perTradeCapUsd: 25,
  dailyCapUsd: 100,
  priceSanityPct: 0.02, // draft price must be within ±2% of the live mid
  cooldownMs: 60_000, // 60 s between orders
}

const SIDES = new Set(['YES', 'NO'])

/**
 * check({ marketId, side, sizeUsd, price? }) → { verdict, checks }
 * verdict: 'PASS' | 'REJECT'. price defaults to the live mid (sanity passes).
 */
export async function check({ marketId, side, sizeUsd, price }) {
  // Effective policy: caps + allowlist toggle come from the settings store
  // (user-tunable via /api/settings); price sanity + cooldown stay fixed.
  const s = settingsStore.get()
  const policy = {
    perTradeCapUsd: s.perTradeCapUsd,
    dailyCapUsd: s.dailyCapUsd,
    allowlistEnabled: s.allowlistEnabled,
    priceSanityPct: POLICY.priceSanityPct,
    cooldownMs: POLICY.cooldownMs,
  }
  const checks = []
  const fail = (rule, detail) => ({ rule, pass: false, detail })
  const ok = (rule, detail) => ({ rule, pass: true, detail })

  // 1. Market allowlist — top-volume Polymarket markets only.
  //    With the allowlist OFF, any market passes this rule.
  if (!policy.allowlistEnabled) {
    checks.push(ok('allowlist', 'Allowlist OFF — any market allowed'))
  } else {
    const listed = await isAllowlisted(marketId)
    checks.push(
      listed
        ? ok('allowlist', 'Market is in the top-volume allowlist')
        : fail('allowlist', 'Market is not in the allowlist'),
    )
  }

  // 2. Side must be YES or NO.
  if (!SIDES.has(side)) {
    checks.push(fail('side', `Side must be YES or NO, got ${String(side)}`))
  } else {
    checks.push(ok('side', `Side ${side}`))
  }

  // 3. Per-trade cap (settings).
  const size = Number(sizeUsd)
  if (!Number.isFinite(size) || size <= 0) {
    checks.push(fail('per-trade cap', `Size must be a positive number, got ${String(sizeUsd)}`))
  } else if (size > policy.perTradeCapUsd) {
    checks.push(
      fail('per-trade cap', `$${size} exceeds the $${policy.perTradeCapUsd} per-trade cap`),
    )
  } else {
    checks.push(ok('per-trade cap', `$${size} ≤ $${policy.perTradeCapUsd}`))
  }

  // 4. Daily cap (settings).
  const daily = dailyVolumeUsd()
  if (Number.isFinite(size) && size > 0 && daily + size > policy.dailyCapUsd) {
    checks.push(
      fail(
        'daily cap',
        `$${daily.toFixed(2)} already used today; +$${size} would exceed $${policy.dailyCapUsd}`,
      ),
    )
  } else {
    checks.push(ok('daily cap', `$${daily.toFixed(2)} used today of $${policy.dailyCapUsd}`))
  }

  // 5. Price sanity ±2% of the live mid.
  const live = await livePrice(marketId, side)
  if (live == null) {
    checks.push(fail('price sanity', 'No live price available for this market'))
  } else {
    const draft = price == null ? live : Number(price)
    if (!Number.isFinite(draft) || draft <= 0) {
      checks.push(fail('price sanity', `Draft price must be a positive number`))
    } else {
      const drift = Math.abs(draft - live) / live
      checks.push(
        drift <= policy.priceSanityPct
          ? ok('price sanity', `Draft ${draft} within 2% of live ${live}`)
          : fail(
              'price sanity',
              `Draft ${draft} is ${(drift * 100).toFixed(1)}% away from live ${live}`,
            ),
      )
    }
  }

  // 6. No duplicate open position on the same market + side.
  const dup = openPositions().some(
    (p) => p.marketId === String(marketId) && p.side === side,
  )
  checks.push(
    dup
      ? fail('duplicate guard', `An open ${side} position already exists on this market`)
      : ok('duplicate guard', 'No open position on this market + side'),
  )

  // 7. 60 s cooldown between orders.
  const sinceLast = Date.now() - lastOrderAt()
  if (sinceLast < policy.cooldownMs) {
    const wait = Math.ceil((policy.cooldownMs - sinceLast) / 1000)
    checks.push(fail('cooldown', `Last order was ${Math.floor(sinceLast / 1000)}s ago; wait ${wait}s`))
  } else {
    checks.push(ok('cooldown', 'No order in the last 60s'))
  }

  const failed = checks.filter((c) => !c.pass)
  return {
    verdict: failed.length === 0 ? 'PASS' : 'REJECT',
    checks,
    failedRules: failed.map((c) => c.rule),
    policy,
  }
}
