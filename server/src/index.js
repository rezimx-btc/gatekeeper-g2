// index.js — Gatekeeper backend. All secrets live here, never in the app.
// Endpoints:
//   GET  /health
//   GET  /api/markets                     live markets + BTC/ETH spot + HL testnet mids (30 s cache)
//   GET  /api/paper                       positions + live PnL summary
//   POST /api/paper/place  {marketId, side, sizeUsd, price?}   gate → paper fill
//   POST /api/paper/close  {id}           close at live mid
//   POST /api/paper/cancel {id}           cancel at entry price (PnL 0)
//   GET  /api/gate/check?marketId&side&sizeUsd&price=   gate verdict, no execution

import { createServer } from 'node:http'
import { getMarkets } from './markets.js'
import { check } from './gate.js'
import { place, close, cancel, summary } from './paper.js'

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

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
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

    return send(res, 404, { error: 'not found' })
  } catch (err) {
    return send(res, 500, { error: String(err.message ?? err) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Gatekeeper server listening on http://${HOST}:${PORT}`)
})
