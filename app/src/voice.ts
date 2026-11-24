// Gatekeeper — Day 3 voice helpers (pure, no bridge, no DOM).
//
// Kept separate from main.ts so the byte-level logic (WAV header, PCM
// normalisation, price/gate rendering) can be unit-tested in plain Node:
//   node --experimental-strip-types src/voice.ts  (self-test at the bottom)
// or imported by tests without booting the Even Hub bridge.
//
// Mic facts (from the ASR template + SDK types):
//   • G2 mic emits PCM s16le @ 16 kHz, mono, via bridge.audioControl(true).
//   • Each audioEvent.audioPcm is ONE chunk: Uint8Array, number[], or a
//     base64 string (host JSON transport) — normalise all three.

export const PCM_SAMPLE_RATE = 16_000
export const PCM_CHANNELS = 1
export const PCM_BITS = 16

/** Normalise one audioPcm chunk to raw s16le bytes. Returns null when the
 *  value is not a recognisable PCM shape. */
export function normalizePcm(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (Array.isArray(raw)) {
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = Number(raw[i]) & 0xff
    return out
  }
  if (typeof raw === 'string') {
    try {
      const bin = atob(raw)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    } catch {
      return null
    }
  }
  return null
}

/** Concatenate PCM chunks into one byte buffer. A chunk with an odd byte
 *  length would break s16le sample alignment, so it is padded with one
 *  zero byte (a single silent half-sample, inaudible). */
export function concatPcm(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length + (c.length % 2)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
    if (c.length % 2 === 1) out[off++] = 0
  }
  return out
}

/** Wrap raw s16le PCM bytes in a 44-byte RIFF/WAVE header (16 kHz, mono).
 *  Returns the full WAV file bytes. */
export function buildWav(pcmBytes: Uint8Array): Uint8Array {
  const dataSize = pcmBytes.length
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true) // ChunkSize
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size (PCM)
  view.setUint16(20, 1, true) // AudioFormat = PCM
  view.setUint16(22, PCM_CHANNELS, true)
  view.setUint32(24, PCM_SAMPLE_RATE, true)
  view.setUint32(28, (PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_BITS) / 8, true) // ByteRate
  view.setUint16(32, (PCM_CHANNELS * PCM_BITS) / 8, true) // BlockAlign
  view.setUint16(34, PCM_BITS, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buf, 44).set(pcmBytes)
  return new Uint8Array(buf)
}

/** Render a price as cents when it is a clean cent value (0.64 -> "64¢"),
 *  otherwise as dollars (0.645 -> "$0.65"). Never prints a raw float. */
export function fmtPrice(price: number): string {
  const cents = price * 100
  if (price > 0 && price < 1 && Math.abs(cents - Math.round(cents)) < 1e-6) {
    return `${Math.round(cents)}¢`
  }
  return `$${price.toFixed(2)}`
}

/** Render a USD size: whole dollars without decimals ($10), else 2dp. */
export function fmtSizeUsd(sizeUsd: number): string {
  return Number.isInteger(sizeUsd) ? `$${sizeUsd}` : `$${sizeUsd.toFixed(2)}`
}

/** Day 4 — settings cap steps (server contract). Tap cycles to the next
 *  step, wrapping to the first after the last. */
export const PER_TRADE_CAP_STEPS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100]
export const DAILY_CAP_STEPS = [25, 50, 75, 100, 150, 200, 300, 500, 1000]

/** First step strictly greater than `current`; wraps to steps[0] when
 *  `current` is at/above the last step. A current value between steps
 *  (e.g. 12) jumps to the next step above it. */
export function nextStep(steps: number[], current: number): number {
  for (const s of steps) if (s > current) return s
  return steps[0]
}

export type GateSummary = {
  verdict: 'PASS' | 'REJECT'
  /** e.g. "PASS 5/5" — null when the server gave no countable checks. */
  score: string | null
  /** First failing rule, for REJECT. */
  failedRule: string | null
}

/**
 * Summarise a server gate object {verdict, checks, failedRules}.
 * Defensive: checks may be an array of rule objects/strings or absent;
 * failedRules may be strings or {rule, reason} objects; verdict may be
 * "PASS"/"REJECT"/"pass"/"fail". Unknown shapes degrade to a bare verdict
 * instead of crashing the render.
 */
export function summarizeGate(gate: unknown): GateSummary {
  const g = (gate ?? {}) as Record<string, any>
  const verdictRaw = String(g.verdict ?? g.result ?? '').toUpperCase()
  const failedRules: unknown[] = Array.isArray(g.failedRules)
    ? g.failedRules
    : Array.isArray(g.failed)
      ? g.failed
      : []
  const firstFailed = (v: unknown): string | null => {
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') {
      const o = v as Record<string, any>
      const s = o.rule ?? o.name ?? o.reason ?? o.message
      return typeof s === 'string' ? s : null
    }
    return null
  }
  const failedRule = failedRules.length > 0 ? firstFailed(failedRules[0]) : null
  const verdict: 'PASS' | 'REJECT' =
    verdictRaw.includes('REJECT') || verdictRaw.includes('FAIL') || failedRule !== null
      ? 'REJECT'
      : 'PASS'
  let score: string | null = null
  const checks: unknown[] = Array.isArray(g.checks) ? g.checks : []
  if (checks.length > 0) {
    const passed = checks.filter((c) => {
      if (typeof c === 'string') return true
      if (c && typeof c === 'object') {
        const o = c as Record<string, any>
        return o.passed !== false && o.pass !== false && o.ok !== false && o.failed !== true
      }
      return true
    }).length
    score = `${passed}/${checks.length}`
  } else if (typeof g.passed === 'number' && typeof g.total === 'number') {
    score = `${g.passed}/${g.total}`
  }
  return { verdict, score, failedRule }
}

/** Draft line 1, e.g. "BUY $10 YES @ 64¢". */
export function draftLine1(sizeUsd: number, side: string, price: number): string {
  return `BUY ${fmtSizeUsd(sizeUsd)} ${String(side).toUpperCase()} @ ${fmtPrice(price)}`
}

/** Draft line 2, e.g. "Gate: PASS 5/5" or "Gate: REJECT — duplicate position". */
export function draftLine2(gate: GateSummary): string {
  if (gate.verdict === 'REJECT') {
    return gate.failedRule ? `Gate: REJECT — ${gate.failedRule}` : 'Gate: REJECT'
  }
  return gate.score ? `Gate: PASS ${gate.score}` : 'Gate: PASS'
}

// ── Self-test (run: node --experimental-strip-types src/voice.ts) ────────
// Kept tiny and dependency-free; exercises the byte-level paths only.
// `process` is read off globalThis so this file still type-checks under the
// browser tsconfig (no @types/node in the app).
const nodeProcess = (globalThis as { process?: { argv?: string[]; exitCode?: number } }).process
if (nodeProcess && nodeProcess.argv?.[1]?.endsWith('voice.ts')) {
  const setExit = (code: number): void => {
    if (nodeProcess) nodeProcess.exitCode = code
  }
  const assert = (cond: boolean, msg: string): void => {
    if (!cond) {
      console.error(`FAIL: ${msg}`)
      setExit(1)
    } else {
      console.log(`ok: ${msg}`)
    }
  }
  // normalizePcm: all three shapes
  assert(normalizePcm(new Uint8Array([1, 2]))?.length === 2, 'pcm Uint8Array')
  assert(normalizePcm([1, 2, 300])?.join(',') === '1,2,44', 'pcm number[] (&0xff)')
  assert(normalizePcm('AQID')?.join(',') === '1,2,3', 'pcm base64 string')
  assert(normalizePcm('!!!not-base64!!!') === null, 'pcm invalid base64 -> null')
  assert(normalizePcm(42) === null, 'pcm number -> null')
  // concatPcm: odd chunk padded, alignment kept
  const joined = concatPcm([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])])
  assert(joined.join(',') === '1,2,3,0,4,5', 'concat pads odd chunk')
  // buildWav: header fields + round-trip
  const wav = buildWav(new Uint8Array([0x00, 0x80, 0xff, 0x7f]))
  const dv = new DataView(wav.buffer)
  const str = (o: number, n: number): string =>
    Array.from(wav.slice(o, o + n), (b) => String.fromCharCode(b)).join('')
  assert(str(0, 4) === 'RIFF' && str(8, 4) === 'WAVE', 'wav RIFF/WAVE')
  assert(dv.getUint32(4, true) === 40, 'wav ChunkSize = 36 + dataSize')
  assert(dv.getUint16(20, true) === 1, 'wav format PCM')
  assert(dv.getUint16(22, true) === 1, 'wav mono')
  assert(dv.getUint32(24, true) === 16000, 'wav 16 kHz')
  assert(dv.getUint32(28, true) === 32000, 'wav ByteRate 32000')
  assert(dv.getUint16(32, true) === 2 && dv.getUint16(34, true) === 16, 'wav BlockAlign/bits')
  assert(str(36, 4) === 'data' && dv.getUint32(40, true) === 4, 'wav data chunk')
  assert(wav.slice(44).join(',') === '0,128,255,127', 'wav payload round-trip')
  // fmtPrice / fmtSizeUsd
  assert(fmtPrice(0.64) === '64¢', 'price 0.64 -> 64¢')
  assert(fmtPrice(0.05) === '5¢', 'price 0.05 -> 5¢')
  assert(fmtPrice(0.645) === '$0.65', 'price 0.645 -> $0.65 (not clean cents)')
  assert(fmtPrice(1.2) === '$1.20', 'price >= 1 -> dollars')
  assert(fmtSizeUsd(10) === '$10', 'size 10 -> $10')
  assert(fmtSizeUsd(2.5) === '$2.50', 'size 2.5 -> $2.50')
  // summarizeGate
  const g1 = summarizeGate({
    verdict: 'PASS',
    checks: [{ rule: 'a', passed: true }, { rule: 'b', passed: true }],
    failedRules: [],
  })
  assert(g1.verdict === 'PASS' && g1.score === '2/2', 'gate PASS 2/2')
  assert(draftLine2(g1) === 'Gate: PASS 2/2', 'draft line2 PASS')
  const g2 = summarizeGate({
    verdict: 'REJECT',
    checks: ['a', 'b', 'c'],
    failedRules: ['duplicate position'],
  })
  assert(g2.verdict === 'REJECT' && g2.failedRule === 'duplicate position', 'gate REJECT first rule')
  assert(draftLine2(g2) === 'Gate: REJECT — duplicate position', 'draft line2 REJECT')
  const g3 = summarizeGate({ verdict: 'PASS' })
  assert(g3.verdict === 'PASS' && g3.score === null, 'gate PASS no checks -> no score')
  assert(draftLine1(10, 'yes', 0.64) === 'BUY $10 YES @ 64¢', 'draft line1')
  // nextStep (Day 4 settings caps)
  assert(nextStep(PER_TRADE_CAP_STEPS, 25) === 30, 'nextStep per-trade 25 -> 30')
  assert(nextStep(PER_TRADE_CAP_STEPS, 100) === 5, 'nextStep per-trade 100 wraps -> 5')
  assert(nextStep(PER_TRADE_CAP_STEPS, 12) === 15, 'nextStep per-trade 12 -> 15')
  assert(nextStep(DAILY_CAP_STEPS, 100) === 150, 'nextStep daily 100 -> 150')
  assert(nextStep(DAILY_CAP_STEPS, 1000) === 25, 'nextStep daily 1000 wraps -> 25')
  console.log(nodeProcess.exitCode ? 'SELF-TEST FAILED' : 'SELF-TEST PASSED')
}
