const crypto = require('node:crypto')
const config = require('./config')
const { getAccountAuth, getSellerAuth } = require('./auth')
const { errorDetailFromResponse } = require('./errors')

function toUrl(pathOrUrl, ctx = {}, base = null) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${base || config.getApiBase(ctx)}${pathOrUrl}`
}

async function parseJson(resp) {
  try {
    return await resp.json()
  } catch {
    return null
  }
}

async function fetchJson(pathOrUrl, options = {}, ctx = {}) {
  const resp = await fetch(toUrl(pathOrUrl, ctx), options)
  if (!resp.ok) {
    const detail = await errorDetailFromResponse(resp)
    throw new Error(detail ? `Request failed: ${detail}` : 'Request failed')
  }
  return parseJson(resp)
}

async function accountFetchJson(path, options = {}, ctx = {}) {
  const { apiKey } = await getAccountAuth(ctx)
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${apiKey}`,
  }
  return fetchJson(path, { ...options, headers }, ctx)
}

// The v1 backend requires an Idempotency-Key on money-moving writes (offer/key
// creation) and ignores it elsewhere, so attach one to every mutating call.
function sellerHeaders(options, apiKey) {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${apiKey}`,
  }
  if (method !== 'GET' && method !== 'HEAD' && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = crypto.randomUUID()
  }
  return headers
}

async function sellerFetch(path, options = {}, ctx = {}) {
  const { apiKey } = await getSellerAuth(ctx)
  const headers = sellerHeaders(options, apiKey)
  const resp = await fetch(toUrl(path, ctx, config.getApiOrigin(ctx)), { ...options, headers })
  if (!resp.ok) {
    const detail = await errorDetailFromResponse(resp)
    throw new Error(detail ? `Request failed: ${detail}` : 'Request failed')
  }
  return resp
}

async function sellerFetchJson(path, options = {}, ctx = {}) {
  return parseJson(await sellerFetch(path, options, ctx))
}

// SI's probe/discover/bulk endpoints stream NDJSON — one JSON object per line.
// Buffer the body and parse line-wise (unparsable lines are skipped rather than
// failing the whole stream, matching the endpoints' per-line error contract).
async function sellerFetchNdjson(path, options = {}, ctx = {}) {
  const resp = await sellerFetch(path, options, ctx)
  const text = await resp.text()
  const lines = []
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      lines.push(JSON.parse(trimmed))
    } catch {}
  }
  return lines
}

module.exports = {
  fetchJson,
  accountFetchJson,
  sellerFetchJson,
  sellerFetchNdjson,
}
