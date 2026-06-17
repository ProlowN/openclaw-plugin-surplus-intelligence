const config = require('./config')
const { getAccountAuth, getSellerAuth } = require('./auth')
const { errorDetailFromResponse } = require('./errors')

function toUrl(pathOrUrl, ctx = {}) {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  return `${config.getApiBase(ctx)}${pathOrUrl}`
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

async function sellerFetchJson(path, options = {}, ctx = {}) {
  const { apiKey } = await getSellerAuth(ctx)
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${apiKey}`,
  }
  return fetchJson(path, { ...options, headers }, ctx)
}

module.exports = {
  fetchJson,
  accountFetchJson,
  sellerFetchJson,
}
