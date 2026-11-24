// voice.js — Day 3 voice loop: audio/text → Whisper STT → intent LLM → draft
// → gate → confirm/cancel. Drafts live in memory only (5 min TTL).
// Secrets: GROQ_API_KEY from env only. When it is an hsurr: surrogate, a fresh
// surrogate is minted per Groq call via the authd unix socket (cheap, local);
// a real key is used as-is. The key/surrogate is NEVER logged or printed.

import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { getMarkets, livePrice } from './markets.js'
import { check } from './gate.js'
import { place, close } from './paper.js'
import { settingsStore } from './settings.js'

export const DRAFT_TTL_MS = 5 * 60 * 1000
const GROQ_BASE = 'https://api.groq.com'
const STT_MODEL = 'whisper-large-v3-turbo'
const CHAT_MODEL = 'openai/gpt-oss-20b'
const AUTHD_SOCKET = process.env.JARVIS_AUTHD_SOCK ?? '/run/hatch/auth/authd.sock'

export const INTENT_SYSTEM_PROMPT = [
  'You turn a spoken trading command into JSON. Reply with ONLY a JSON object, no other text.',
  'Buy commands: {"action":"buy","side":"YES"|"NO","sizeUsd":number}.',
  'Side comes from the words YES or NO in the command; default YES when neither is said.',
  'sizeUsd comes from the spoken amount ("ten dollars" -> 10, "twenty five" -> 25, "five bucks" -> 5).',
  'If there is no amount, use 10. If the amount is unclear, use 10.',
  'Close commands ("close position 2", "close my position"): {"action":"close","positionId":number}.',
  'Settings commands:',
  '  set a cap ("set per-trade cap to 10", "set daily cap to 50"): {"action":"set_cap","which":"perTrade"|"daily","value":number}.',
  '  toggle the allowlist ("turn allowlist off", "enable allowlist"): {"action":"toggle_allowlist","enabled":true|false}.',
  '  reset settings ("reset settings"): {"action":"reset_settings"}.',
  'Anything that is NOT a buy, close or settings command — sell, cancel, greeting, question, unclear speech —',
  'reply {"action":"unsupported","reason":"<one short sentence>"}.',
].join('\n')

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/voice.test.js)
// ---------------------------------------------------------------------------

/** Extract and validate the intent JSON from LLM output. */
export function parseIntentJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { action: 'unsupported', reason: 'empty model reply' }
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { action: 'unsupported', reason: 'no JSON in model reply' }
  let obj
  try {
    obj = JSON.parse(match[0])
  } catch {
    return { action: 'unsupported', reason: 'model reply was not valid JSON' }
  }
  if (obj.action === 'unsupported') {
    return { action: 'unsupported', reason: String(obj.reason ?? 'unsupported command') }
  }
  if (obj.action === 'close') {
    const positionId = Number(obj.positionId)
    if (!Number.isInteger(positionId) || positionId <= 0) {
      return { action: 'unsupported', reason: 'no valid position number to close' }
    }
    return { action: 'close', positionId }
  }
  if (obj.action === 'set_cap') {
    const whichRaw = String(obj.which ?? '').toLowerCase().replace(/[^a-z]/g, '')
    const which = whichRaw === 'pertrade' ? 'perTrade' : whichRaw === 'daily' ? 'daily' : null
    const value = Number(obj.value)
    if (!which) return { action: 'unsupported', reason: 'cap must be per-trade or daily' }
    if (!Number.isFinite(value) || value <= 0) {
      return { action: 'unsupported', reason: 'no usable cap value in command' }
    }
    return { action: 'set_cap', which, value }
  }
  if (obj.action === 'toggle_allowlist') {
    if (typeof obj.enabled !== 'boolean') {
      return { action: 'unsupported', reason: 'allowlist toggle needs on or off' }
    }
    return { action: 'toggle_allowlist', enabled: obj.enabled }
  }
  if (obj.action === 'reset_settings') {
    return { action: 'reset_settings' }
  }
  if (obj.action !== 'buy') {
    return { action: 'unsupported', reason: 'not a buy command' }
  }
  const side = String(obj.side ?? 'YES').toUpperCase() === 'NO' ? 'NO' : 'YES'
  const sizeUsd = Number(obj.sizeUsd)
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
    return { action: 'unsupported', reason: 'no usable amount in command' }
  }
  return { action: 'buy', side, sizeUsd }
}

const YES_WORDS = ['yes', 'yeah', 'yep', 'yup', 'confirm', 'confirmed', 'go ahead', 'do it', 'okay', 'ok']
const NO_WORDS = ['no', 'nah', 'nope', 'cancel', "don't", 'do not', 'stop', 'never mind', 'nevermind']

function hasWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/**
 * Normalize a yes/no turn: 'yes' | 'no' | 'unclear'.
 * A bare "no" wins over a "yes" only when no yes-word is present; when both
 * appear ("yes, no wait...") the turn is unclear so the draft is kept.
 */
export function normalizeYesNo(text) {
  if (typeof text !== 'string') return 'unclear'
  // Explicit negation ("don't do it") beats the "do it" yes-word inside it.
  if (/\b(don't|dont|do not)\b/i.test(text)) return 'no'
  const yes = YES_WORDS.some((w) => hasWord(text, w))
  const no = NO_WORDS.some((w) => hasWord(text, w))
  if (yes && !no) return 'yes'
  if (no && !yes) return 'no'
  return 'unclear'
}

/** Validate a WAV buffer (RIFF/WAVE, PCM). Returns {ok, reason?, format}. */
export function validateWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { ok: false, reason: 'empty audio body' }
  }
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, reason: 'not a WAV file (missing RIFF/WAVE header)' }
  }
  const audioFormat = buf.readUInt16LE(20)
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  const bits = buf.readUInt16LE(34)
  if (audioFormat !== 1) return { ok: false, reason: `unsupported WAV format ${audioFormat} (need PCM)` }
  if (channels !== 1 && channels !== 2) return { ok: false, reason: `unsupported channel count ${channels}` }
  if (![8000, 16000, 22050, 32000, 44100, 48000].includes(sampleRate)) {
    return { ok: false, reason: `unsupported sample rate ${sampleRate}` }
  }
  if (bits !== 16) return { ok: false, reason: `unsupported bit depth ${bits} (need 16-bit)` }
  return { ok: true, format: { audioFormat, channels, sampleRate, bits } }
}

/** Wrap raw s16le 16 kHz mono PCM in a WAV header. */
export function wrapPcmToWav(pcm) {
  const dataLen = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(16000 * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataLen, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Classify a raw audio body: 'wav' | 'pcm' | 'invalid'.
 * Non-WAV bodies with even length are treated as raw s16le PCM.
 */
export function detectAudio(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return 'invalid'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return validateWav(buf).ok ? 'wav' : 'invalid'
  }
  if (buf.length >= 320 && buf.length % 2 === 0) return 'pcm'
  return 'invalid'
}

/** Extract the `audio` part (Buffer) + text fields from a multipart/form-data body. */
export function parseMultipartAudio(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '')
  if (!m) return null
  const boundary = Buffer.from(`--${(m[1] ?? m[2]).trim()}`)
  const fields = {}
  let audio = null
  let start = 0
  for (;;) {
    const bIdx = buf.indexOf(boundary, start)
    if (bIdx === -1) break
    let pos = bIdx + boundary.length
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break // closing --boundary--
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2
    else if (buf[pos] === 0x0a) pos += 1
    const headerEnd = buf.indexOf('\r\n\r\n', pos)
    if (headerEnd === -1) break
    const headers = buf.toString('utf8', pos, headerEnd)
    const bodyStart = headerEnd + 4
    let bodyEnd = buf.indexOf(boundary, bodyStart)
    if (bodyEnd === -1) break
    if (buf[bodyEnd - 2] === 0x0d && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 2
    const nameMatch = /name="([^"]+)"/.exec(headers)
    if (nameMatch) {
      if (nameMatch[1] === 'audio') audio = buf.subarray(bodyStart, bodyEnd)
      else fields[nameMatch[1]] = buf.toString('utf8', bodyStart, bodyEnd)
    }
    start = bodyEnd
  }
  return { audio: audio ? Buffer.from(audio) : null, fields }
}

/** In-memory draft store with 5-min expiry. */
export function createDraftStore(now = () => Date.now()) {
  const drafts = new Map()
  return {
    create(draft) {
      const id = `dft_${randomBytes(8).toString('hex')}`
      const createdAt = now()
      const full = { ...draft, id, createdAt, expiresAt: createdAt + DRAFT_TTL_MS }
      drafts.set(id, full)
      return full
    },
    get(id) {
      const d = drafts.get(String(id))
      if (!d) return null
      if (now() > d.expiresAt) {
        drafts.delete(String(id))
        return null
      }
      return d
    },
    /** Get even if expired (lets the caller distinguish 410 from 404). */
    getRaw(id) {
      return drafts.get(String(id)) ?? null
    },
    isExpired(d) {
      return d != null && now() > d.expiresAt
    },
    delete(id) {
      return drafts.delete(String(id))
    },
    size() {
      return drafts.size
    },
  }
}

export const draftStore = createDraftStore()

// ---------------------------------------------------------------------------
// Groq (key never logged)
// ---------------------------------------------------------------------------

export class VoiceUnavailable extends Error {
  constructor() {
    super('voice unavailable: GROQ_API_KEY not configured')
    this.status = 503
  }
}

export class GroqError extends Error {
  constructor(status, message) {
    super(message)
    this.status = 502
    this.groqStatus = status
  }
}

function mintSurrogate() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: 'custom.groq' })
    const req = http.request(
      {
        socketPath: AUTHD_SOCKET,
        path: '/v1/credentials/surrogate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const entry = (payload.credentials ?? []).find((e) => e.name === 'access_token')
            const surrogate = entry?.surrogate
            if (typeof surrogate === 'string' && surrogate.startsWith('hsurr:')) resolve(surrogate)
            else reject(new Error('authd returned no access_token surrogate'))
          } catch (e) {
            reject(new Error(`authd surrogate response unreadable: ${e.message}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(5000, () => req.destroy(new Error('authd surrogate request timed out')))
    req.end(body)
  })
}

/** Fresh key per Groq call when the env value is a surrogate; real key as-is. */
async function groqKey() {
  const env = process.env.GROQ_API_KEY
  if (!env) throw new VoiceUnavailable()
  if (env.startsWith('hsurr:')) {
    try {
      return await mintSurrogate()
    } catch {
      // Fall back to the env surrogate itself (verified reusable in testing).
      return env
    }
  }
  return env
}

function groqErrorBody(status, bodyText) {
  // Never echo the raw provider body (it can contain request echoes); keep it short.
  const hint =
    status === 401
      ? 'Groq rejected the key (401)'
      : status === 429
        ? 'Groq rate limit (429)'
        : `Groq error ${status}`
  return `${hint}: ${String(bodyText ?? '').slice(0, 200).replace(/\s+/g, ' ')}`
}

export async function groqTranscribe(wavBuffer) {
  const key = await groqKey()
  const boundary = `----groq${randomBytes(8).toString('hex')}`
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
  )
  const tail = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${STT_MODEL}` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n--${boundary}--\r\n`,
  )
  const res = await fetch(`${GROQ_BASE}/openai/v1/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, wavBuffer, tail]),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new GroqError(res.status, groqErrorBody(res.status, await res.text().catch(() => '')))
  const data = await res.json()
  const text = String(data.text ?? '').trim()
  if (!text) throw new GroqError(res.status, 'Groq transcription returned empty text')
  return text
}

export async function groqIntent(transcript) {
  const key = await groqKey()
  const res = await fetch(`${GROQ_BASE}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      max_tokens: 200,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new GroqError(res.status, groqErrorBody(res.status, await res.text().catch(() => '')))
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  return parseIntentJson(content)
}

// ---------------------------------------------------------------------------
// Voice flow
// ---------------------------------------------------------------------------

async function resolveMarket(marketId) {
  const { markets } = await getMarkets()
  if (marketId) {
    const m = markets.find((x) => x.id === String(marketId))
    if (m) return m
  }
  return markets[0] ?? null
}

/** Confirm a draft: fresh gate check, then paper fill. Caller deletes the draft. */
export async function confirmDraftById(draftId) {
  const draft = draftStore.getRaw(String(draftId))
  if (!draft) return { status: 404, body: { error: 'draft not found' } }
  if (draftStore.isExpired(draft)) {
    draftStore.delete(draft.id)
    return { status: 410, body: { error: 'draft expired' } }
  }
  const gate = await check({ marketId: draft.marketId, side: draft.side, sizeUsd: draft.sizeUsd, price: draft.price })
  if (gate.verdict !== 'PASS') {
    draftStore.delete(draft.id)
    return { status: 403, body: { filled: false, gate } }
  }
  const position = await place({ marketId: draft.marketId, question: draft.question, side: draft.side, sizeUsd: draft.sizeUsd })
  draftStore.delete(draft.id)
  return { status: 200, body: { filled: true, position, gate } }
}

export function cancelDraftById(draftId) {
  const ok = draftStore.delete(String(draftId))
  if (!ok) return { status: 404, body: { error: 'draft not found' } }
  return { status: 200, body: { cancelled: true } }
}

export function getDraftResponse(draftId) {
  const draft = draftStore.getRaw(String(draftId))
  if (!draft) return { status: 404, body: { error: 'draft not found' } }
  if (draftStore.isExpired(draft)) {
    draftStore.delete(draft.id)
    return { status: 410, body: { error: 'draft expired' } }
  }
  return { status: 200, body: { draft, gate: draft.gate } }
}

/**
 * Handle POST /api/voice.
 * Input: { contentType, body: Buffer, query: URLSearchParams }.
 * Returns { status, body }.
 */
export async function handleVoice({ contentType = '', body, query = new URLSearchParams() }) {
  if (!process.env.GROQ_API_KEY) throw new VoiceUnavailable()
  if (!body || body.length === 0) {
    return { status: 400, body: { error: 'empty request body: send audio (WAV/PCM) or JSON {text}' } }
  }

  let text = null
  let marketId = query.get('marketId') ?? undefined
  let question = query.get('question') ?? undefined
  let draftId = query.get('draftId') ?? undefined
  let wav = null

  if (contentType.includes('application/json')) {
    let parsed
    try {
      parsed = JSON.parse(body.toString('utf8'))
    } catch {
      return { status: 400, body: { error: 'invalid JSON body' } }
    }
    text = typeof parsed.text === 'string' ? parsed.text : null
    marketId = parsed.marketId ?? marketId
    question = parsed.question ?? question
    draftId = parsed.draftId ?? draftId
    if (!text || !text.trim()) {
      return { status: 400, body: { error: 'JSON body needs a non-empty "text" field' } }
    }
  } else if (contentType.includes('multipart/form-data')) {
    const parsed = parseMultipartAudio(body, contentType)
    if (!parsed) return { status: 400, body: { error: 'malformed multipart body (no boundary)' } }
    if (parsed.fields.text) text = parsed.fields.text
    marketId = parsed.fields.marketId ?? marketId
    question = parsed.fields.question ?? question
    draftId = parsed.fields.draftId ?? draftId
    if (parsed.audio) wav = parsed.audio
    if (!text && !wav) {
      return { status: 400, body: { error: 'multipart body needs an "audio" part or a "text" field' } }
    }
  } else if (
    contentType.includes('audio/') ||
    contentType.includes('application/octet-stream') ||
    contentType === ''
  ) {
    wav = body
  } else {
    return { status: 400, body: { error: `unsupported Content-Type: ${contentType}` } }
  }

  // Audio → transcript (skip when text was supplied directly).
  let transcript = text
  if (wav) {
    const kind = detectAudio(wav)
    if (kind === 'invalid') {
      return { status: 400, body: { error: 'body is not valid WAV audio or raw s16le 16kHz PCM' } }
    }
    if (kind === 'pcm') wav = wrapPcmToWav(wav)
    transcript = await groqTranscribe(wav)
  }
  transcript = String(transcript ?? '').trim()
  if (!transcript) return { status: 400, body: { error: 'empty transcript' } }

  // Yes/no turn on an existing draft.
  if (draftId) {
    const heard = normalizeYesNo(transcript)
    if (heard === 'yes') {
      const result = await confirmDraftById(draftId)
      return { status: result.status, body: { ok: result.status === 200, heard, transcript, ...result.body } }
    }
    if (heard === 'no') {
      const result = cancelDraftById(draftId)
      return { status: result.status, body: { ok: result.status === 200, heard, transcript, ...result.body } }
    }
    return { status: 200, body: { ok: true, heard: 'unclear', transcript, draftId } }
  }

  // New command: intent → market → gate → draft.
  const intent = await groqIntent(transcript)

  // Close command: close an open paper position by number (no draft).
  if (intent.action === 'close') {
    let position = null
    try {
      position = await close(intent.positionId)
    } catch (err) {
      return { status: 200, body: { ok: false, action: 'close', transcript, reason: String(err.message ?? err) } }
    }
    if (!position) {
      return {
        status: 200,
        body: { ok: false, action: 'close', transcript, reason: `No open position #${intent.positionId}` },
      }
    }
    return { status: 200, body: { ok: true, action: 'close', transcript, position } }
  }

  // Settings commands: caps, allowlist toggle, reset (no draft).
  if (
    intent.action === 'set_cap' ||
    intent.action === 'toggle_allowlist' ||
    intent.action === 'reset_settings'
  ) {
    try {
      let settings
      if (intent.action === 'set_cap') {
        settings = settingsStore.update({
          [intent.which === 'perTrade' ? 'perTradeCapUsd' : 'dailyCapUsd']: intent.value,
        })
      } else if (intent.action === 'toggle_allowlist') {
        settings = settingsStore.update({ allowlistEnabled: intent.enabled })
      } else {
        settings = settingsStore.reset()
      }
      return { status: 200, body: { ok: true, action: 'settings', transcript, settings } }
    } catch (err) {
      return { status: 200, body: { ok: false, action: 'settings', transcript, reason: String(err.message ?? err) } }
    }
  }

  if (intent.action !== 'buy') {
    return { status: 200, body: { ok: false, transcript, reason: intent.reason } }
  }
  const market = await resolveMarket(marketId)
  if (!market) {
    return { status: 502, body: { ok: false, transcript, reason: 'no live markets available' } }
  }
  const price = await livePrice(market.id, intent.side)
  if (price == null) {
    return { status: 502, body: { ok: false, transcript, reason: 'no live price for this market' } }
  }
  const gate = await check({ marketId: market.id, side: intent.side, sizeUsd: intent.sizeUsd, price })
  const draft = draftStore.create({
    marketId: market.id,
    question: question ?? market.question,
    side: intent.side,
    sizeUsd: intent.sizeUsd,
    price,
    transcript,
    gate,
  })
  return { status: 200, body: { ok: true, draftId: draft.id, transcript, intent, draft, gate } }
}
