const DEFAULT_API_BASE = 'https://www.surplusintelligence.ai'
const DEFAULT_API_ORIGIN = 'https://api.surplusintelligence.ai'

// Explicit plugin config wins over ambient process.env so a stray variable in
// the gateway host environment can never override what the user configured.
function getConfigValue(ctx, name) {
  return (
    ctx?.config?.[name] ||
    ctx?.settings?.[name] ||
    ctx?.pluginConfig?.[name] ||
    process.env[name] ||
    null
  )
}

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function getApiBase(ctx = {}) {
  const value = String(getConfigValue(ctx, 'INFERENCE_API_URL') || DEFAULT_API_BASE).replace(/\/+$/, '')

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`INFERENCE_API_URL is not a valid URL: ${value}`)
  }
  const httpAllowed = url.protocol === 'http:' && isLocalHostname(url.hostname)
  if (url.protocol !== 'https:' && !httpAllowed) {
    throw new Error('INFERENCE_API_URL must use https (http is allowed only for localhost). The plugin sends API keys to this host.')
  }

  return value
}

// The seller commands talk to SI's v1 backend directly (the `/api/inference/*`
// paths only survive on www behind a legacy proxy that can go away). The API
// origin is a separate host in production (api.…), so resolve it independently:
// an explicit INFERENCE_API_ORIGIN wins; the well-known SI hosts map to the SI
// API origin; anything else (localhost, self-hosted) serves both on one origin.
function getApiOrigin(ctx = {}) {
  const explicit = getConfigValue(ctx, 'INFERENCE_API_ORIGIN')
  const value = String(explicit || '').replace(/\/+$/, '')
  if (value) {
    let url
    try {
      url = new URL(value)
    } catch {
      throw new Error(`INFERENCE_API_ORIGIN is not a valid URL: ${value}`)
    }
    const httpAllowed = url.protocol === 'http:' && isLocalHostname(url.hostname)
    if (url.protocol !== 'https:' && !httpAllowed) {
      throw new Error('INFERENCE_API_ORIGIN must use https (http is allowed only for localhost). The plugin sends API keys to this host.')
    }
    return value
  }

  const base = getApiBase(ctx)
  const hostname = new URL(base).hostname
  if (hostname === 'www.surplusintelligence.ai' || hostname === 'surplusintelligence.ai') {
    return DEFAULT_API_ORIGIN
  }
  return base
}

module.exports = {
  DEFAULT_API_BASE,
  DEFAULT_API_ORIGIN,
  getApiBase,
  getApiOrigin,
  // account/market endpoints (legacy path shape, served via the www proxy)
  MARKETS: '/api/inference/markets',
  MODELS: '/api/inference/v1/models',
  BUYER_KEYS: '/api/inference/buyers/keys',
  BUYER_ME: '/api/inference/buyers/me',
  BUYER_SAVINGS: '/api/inference/buyers/savings',
  BUYER_APPROVE_STATUS: '/api/inference/buyers/approve-status',
  // seller endpoints (v1 backend, resolved against getApiOrigin)
  SELLER_AUTH_CHALLENGE: '/v1/seller/auth/challenge',
  SELLER_AUTH_KEYS: '/v1/seller/auth/keys',
  SELLER_KEYS: '/v1/seller/keys',
  SELLER_OFFERS: '/v1/seller/offers',
  SELLER_OFFERS_BULK: '/v1/seller/offers/bulk',
  SELLER_HEALTH: '/v1/seller/health-log',
  SELLER_EARNINGS: '/v1/seller/earnings',
  SELLER_TEST_CONNECTION: '/v1/seller/test-connection',
  SELLER_TEST_HEALTH: '/v1/seller/test-health',
  SELLER_DISCOVER: '/v1/seller/discover',
  getConfigValue,
}
