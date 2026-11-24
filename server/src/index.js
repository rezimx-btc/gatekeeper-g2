// index.js — Gatekeeper backend. All secrets live here, never in the app.
// Endpoints:
//   GET  /health
//   GET  /api/markets                     live markets + BTC/ETH spot + HL testnet mids (30 s cache)
//   GET  /api/paper                       positions + live PnL summary
//   POST /api/paper/place  {marketId, side, sizeUsd, price?}   gate → paper fill
//   POST /api/paper/close  {id}           close at live mid
//   POST /api/paper/cancel {id}           cancel at entry price (PnL 0)
//   GET  /api/gate/check?marketId&side&sizeUsd&price=   gate verdict, no execution
//   GET  /api/settings                      current gate settings (+ defaults)
//   POST /api/settings {perTradeCapUsd?, dailyCapUsd?, allowlistEnabled?}
//                                          update settings (400 on invalid)
//   POST /api/settings/reset                restore defaults
//   POST /api/voice                        audio (WAV/PCM/multipart) or JSON {text}
//                                          → STT + intent → draft (5 min TTL)
//   POST /api/voice/confirm {draftId}     fresh gate → paper fill
//   POST /api/voice/cancel  {draftId}     drop the draft
//   GET  /api/voice/draft/:id             inspect a draft

import { createServer } from 'node:http'
import { getMarkets } from './markets.js'
import { check } from './gate.js'
import { place, close, cancel, summary } from './paper.js'
import { settingsStore, SettingsValidationError } from './settings.js'
import {
  handleVoice,
  confirmDraftById,
  cancelDraftById,
  getDraftResponse,
  VoiceUnavailable,
  GroqError,
} from './voice.js'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'

function send(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(data)
}

async function readRaw(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readRaw(req)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error('invalid JSON body')
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      })
      return res.end()
    }

    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, time: new Date().toISOString() })
    }

    if (req.method === 'GET' && url.pathname === '/api/markets') {
      const data = await getMarkets()
      return send(res, 200, data)
    }

    if (req.method === 'GET' && url.pathname === '/api/paper') {
      return send(res, 200, await summary())
    }

    if (req.method === 'GET' && url.pathname === '/api/gate/check') {
      const verdict = await check({
        marketId: url.searchParams.get('marketId'),
        side: url.searchParams.get('side'),
        sizeUsd: url.searchParams.get('sizeUsd'),
        price:
          url.searchParams.get('price') == null
            ? undefined
            : Number(url.searchParams.get('price')),
      })
      return send(res, 200, verdict)
    }

    if (req.method === 'POST' && url.pathname === '/api/paper/place') {
      const body = await readJson(req)
      const { marketId, side, sizeUsd, price, question } = body
      const gate = await check({ marketId, side, sizeUsd, price })
      if (gate.verdict !== 'PASS') {
        return send(res, 403, { filled: false, gate })
      }
      const position = await place({ marketId, question, side, sizeUsd: Number(sizeUsd) })
      return send(res, 200, { filled: true, position, gate })
    }

    if (req.method === 'POST' && url.pathname === '/api/paper/close') {
      const { id } = await readJson(req)
      const position = await close(id)
      if (!position) return send(res, 404, { error: 'no open position with that id' })
      return send(res, 200, { closed: true, position })
    }

    if (req.method === 'POST' && url.pathname === '/api/paper/cancel') {
      const { id } = await readJson(req)
      const position = await cancel(id)
      if (!position) return send(res, 404, { error: 'no open position with that id' })
      return send(res, 200, { cancelled: true, position })
    }

    if (req.method === 'GET' && url.pathname === '/api/settings') {
      return send(res, 200, settingsStore.get())
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await readJson(req)
      try {
        return send(res, 200, settingsStore.update(body))
      } catch (err) {
        if (err instanceof SettingsValidationError) {
          return send(res, 400, { error: err.message })
        }
        throw err
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/settings/reset') {
      return send(res, 200, settingsStore.reset())
    }

    if (req.method === 'POST' && url.pathname === '/api/voice') {
      const body = await readRaw(req)
      const result = await handleVoice({
        contentType: req.headers['content-type'] ?? '',
        body,
        query: url.searchParams,
      })
      return send(res, result.status, result.body)
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/confirm') {
      const { draftId } = await readJson(req)
      if (!draftId) return send(res, 400, { error: 'draftId required' })
      const result = await confirmDraftById(draftId)
      return send(res, result.status, result.body)
    }

    if (req.method === 'POST' && url.pathname === '/api/voice/cancel') {
      const { draftId } = await readJson(req)
      if (!draftId) return send(res, 400, { error: 'draftId required' })
      const result = cancelDraftById(draftId)
      return send(res, result.status, result.body)
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/voice/draft/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/voice/draft/'.length))
      const result = getDraftResponse(id)
      return send(res, result.status, result.body)
    }

    return send(res, 404, { error: 'not found' })
  } catch (err) {
    if (err instanceof VoiceUnavailable) {
      return send(res, 503, { error: err.message })
    }
    if (err instanceof GroqError) {
      return send(res, 502, { error: err.message })
    }
    return send(res, 500, { error: String(err.message ?? err) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Gatekeeper server listening on http://${HOST}:${PORT}`)
})
