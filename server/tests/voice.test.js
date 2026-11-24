// Voice unit tests — run with `npm test` (node --test). No network: only the
// pure helpers from src/voice.js are exercised here.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseIntentJson,
  normalizeYesNo,
  validateWav,
  wrapPcmToWav,
  detectAudio,
  parseMultipartAudio,
  createDraftStore,
  DRAFT_TTL_MS,
} from '../src/voice.js'

function makeWav({ sampleRate = 16000, channels = 1, bits = 16, pcmLen = 3200 } = {}) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmLen, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * channels * (bits / 8), 28)
  header.writeUInt16LE(channels * (bits / 8), 32)
  header.writeUInt16LE(bits, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmLen, 40)
  return Buffer.concat([header, Buffer.alloc(pcmLen)])
}

describe('parseIntentJson', () => {
  it('parses a plain buy JSON object', () => {
    assert.deepEqual(parseIntentJson('{"action":"buy","side":"YES","sizeUsd":10}'), {
      action: 'buy',
      side: 'YES',
      sizeUsd: 10,
    })
  })

  it('extracts JSON embedded in surrounding prose', () => {
    const out = parseIntentJson('Sure thing! {"action":"buy","side":"NO","sizeUsd":25} done.')
    assert.deepEqual(out, { action: 'buy', side: 'NO', sizeUsd: 25 })
  })

  it('defaults side to YES and rejects a non-positive amount', () => {
    assert.deepEqual(parseIntentJson('{"action":"buy","sizeUsd":5}'), {
      action: 'buy',
      side: 'YES',
      sizeUsd: 5,
    })
    assert.equal(parseIntentJson('{"action":"buy","side":"YES","sizeUsd":0}').action, 'unsupported')
  })

  it('maps sell/close/greeting replies to unsupported with a reason', () => {
    assert.equal(parseIntentJson('{"action":"unsupported","reason":"sell command"}').action, 'unsupported')
    assert.equal(parseIntentJson('{"action":"unsupported","reason":"sell command"}').reason, 'sell command')
    assert.equal(parseIntentJson('hello there').action, 'unsupported')
    assert.equal(parseIntentJson('').action, 'unsupported')
  })

  it('parses a close intent and rejects a bad position number', () => {
    assert.deepEqual(parseIntentJson('{"action":"close","positionId":2}'), {
      action: 'close',
      positionId: 2,
    })
    for (const bad of [0, -1, 1.5, 'two', null, undefined]) {
      assert.equal(
        parseIntentJson(JSON.stringify({ action: 'close', positionId: bad })).action,
        'unsupported',
        `positionId=${String(bad)}`,
      )
    }
  })

  it('parses set_cap intents (per-trade and daily) and rejects bad values', () => {
    assert.deepEqual(parseIntentJson('{"action":"set_cap","which":"perTrade","value":10}'), {
      action: 'set_cap',
      which: 'perTrade',
      value: 10,
    })
    assert.deepEqual(parseIntentJson('{"action":"set_cap","which":"daily","value":50}'), {
      action: 'set_cap',
      which: 'daily',
      value: 50,
    })
    // Common model spellings of the per-trade key are normalized.
    assert.equal(parseIntentJson('{"action":"set_cap","which":"per-trade","value":10}').which, 'perTrade')
    for (const bad of [
      { which: 'weekly', value: 10 },
      { which: 'perTrade', value: 0 },
      { which: 'perTrade', value: -5 },
      { which: 'perTrade', value: 'ten' },
      { which: 'daily' },
    ]) {
      assert.equal(
        parseIntentJson(JSON.stringify({ action: 'set_cap', ...bad })).action,
        'unsupported',
        JSON.stringify(bad),
      )
    }
  })

  it('parses toggle_allowlist and reset_settings intents', () => {
    assert.deepEqual(parseIntentJson('{"action":"toggle_allowlist","enabled":false}'), {
      action: 'toggle_allowlist',
      enabled: false,
    })
    assert.deepEqual(parseIntentJson('{"action":"toggle_allowlist","enabled":true}'), {
      action: 'toggle_allowlist',
      enabled: true,
    })
    assert.equal(parseIntentJson('{"action":"toggle_allowlist","enabled":"off"}').action, 'unsupported')
    assert.deepEqual(parseIntentJson('{"action":"reset_settings"}'), { action: 'reset_settings' })
  })

  it('maps a sell action object and greetings to unsupported', () => {
    assert.equal(parseIntentJson('{"action":"sell","side":"YES","sizeUsd":10}').action, 'unsupported')
    assert.equal(parseIntentJson('{"action":"cancel"}').action, 'unsupported')
    assert.equal(parseIntentJson('{"action":"greet"}').action, 'unsupported')
  })
})

describe('normalizeYesNo', () => {
  it('hears yes variants', () => {
    for (const t of ['Yes', 'yeah do it', 'confirm', 'yup', 'go ahead']) {
      assert.equal(normalizeYesNo(t), 'yes', t)
    }
  })

  it('hears no variants', () => {
    for (const t of ['No', 'nah', 'nope', 'No, cancel that', "don't do it", 'never mind']) {
      assert.equal(normalizeYesNo(t), 'no', t)
    }
  })

  it('is unclear on mixed or unrelated speech', () => {
    assert.equal(normalizeYesNo('yes, no wait...'), 'unclear')
    assert.equal(normalizeYesNo('how much is it?'), 'unclear')
    assert.equal(normalizeYesNo(''), 'unclear')
  })
})

describe('WAV validation and PCM wrapping', () => {
  it('accepts a valid 16 kHz mono s16le WAV', () => {
    const v = validateWav(makeWav())
    assert.equal(v.ok, true)
    assert.equal(v.format.sampleRate, 16000)
  })

  it('rejects empty, truncated and non-WAV bodies', () => {
    assert.equal(validateWav(Buffer.alloc(0)).ok, false)
    assert.equal(validateWav(Buffer.from('hello world, this is not audio at all!!')).ok, false)
    assert.equal(validateWav(makeWav().subarray(0, 20)).ok, false)
  })

  it('rejects a WAV with an unsupported sample rate or bit depth', () => {
    assert.equal(validateWav(makeWav({ sampleRate: 11025 })).ok, false)
    assert.equal(validateWav(makeWav({ bits: 8 })).ok, false)
  })

  it('wraps raw PCM into a valid WAV and detects both kinds', () => {
    const pcm = Buffer.alloc(3200)
    const wav = wrapPcmToWav(pcm)
    assert.equal(validateWav(wav).ok, true)
    assert.equal(detectAudio(wav), 'wav')
    assert.equal(detectAudio(pcm), 'pcm')
    assert.equal(detectAudio(Buffer.alloc(0)), 'invalid')
  })
})

describe('parseMultipartAudio', () => {
  it('extracts the audio part and text fields', () => {
    const boundary = 'testboundary'
    const audio = makeWav()
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="marketId"\r\n\r\n123\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
      audio,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const parsed = parseMultipartAudio(body, `multipart/form-data; boundary=${boundary}`)
    assert.equal(parsed.fields.marketId, '123')
    assert.ok(parsed.audio.equals(audio))
  })
})

describe('draft store', () => {
  it('creates, reads and deletes drafts', () => {
    const store = createDraftStore()
    const d = store.create({ marketId: '1', side: 'YES', sizeUsd: 10 })
    assert.ok(d.id.startsWith('dft_'))
    assert.equal(d.expiresAt - d.createdAt, DRAFT_TTL_MS)
    assert.equal(store.get(d.id).id, d.id)
    assert.equal(store.delete(d.id), true)
    assert.equal(store.get(d.id), null)
  })

  it('expires drafts after the 5-minute TTL and reports 410-able state', () => {
    let now = 1_000_000
    const store = createDraftStore(() => now)
    const d = store.create({ marketId: '1', side: 'YES', sizeUsd: 10 })
    now += DRAFT_TTL_MS + 1
    assert.equal(store.isExpired(d), true)
    assert.ok(store.getRaw(d.id)) // raw still present for the 410 distinction
    assert.equal(store.get(d.id), null) // expired drafts read as missing (and are dropped)
  })
})
