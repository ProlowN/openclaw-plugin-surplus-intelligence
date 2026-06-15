const DEFAULT_API_BASE = 'https://www.surplusintelligence.ai'

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

module.exports = {
  DEFAULT_API_BASE,
  getApiBase,
  // Base mainnet — the whole marketplace settles on chainId 8453.
  CHAIN_ID: 8453,
  USDC_DECIMALS: 6,
  // endpoints
  MARKETS: '/api/inference/markets',
  MODELS: '/api/inference/v1/models',
  BUYER_AUTH_CHALLENGE: '/api/inference/buyers/auth/challenge',
  BUYER_AUTH_KEY: '/api/inference/buyers/auth/key',
  BUYER_AUTH_KEYS: '/api/inference/buyers/auth/keys',
  SELLER_AUTH_CHALLENGE: '/api/inference/sellers/auth/challenge',
  SELLER_AUTH_KEY: '/api/inference/sellers/auth/key',
  BUYER_KEYS: '/api/inference/buyers/keys',
  BUYER_ME: '/api/inference/buyers/me',
  BUYER_SAVINGS: '/api/inference/buyers/savings',
  BUYER_APPROVE_STATUS: '/api/inference/buyers/approve-status',
  BUYER_APPROVE_PERMIT: '/api/inference/buyers/approve-permit',
  SELLER_OFFERS: '/api/inference/sellers/offers',
  SELLER_HEALTH: '/api/inference/sellers/health-log',
  SELLER_EARNINGS: '/api/inference/sellers/earnings',
  getConfigValue,
}
