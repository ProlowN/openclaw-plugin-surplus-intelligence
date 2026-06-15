const config = require('./config')
const { sellerFetchJson } = require('./http')
const { hasWalletPrivateKey, mintSellerKey } = require('./auth')

function formatPrice(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A'
  const num = Number(n)
  return `$${num.toFixed(2)}/1M tokens`
}

function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0'
  return Number(n).toFixed(decimals)
}

function parseArgs(raw) {
  return (raw || '').trim().split(/\s+/).filter(Boolean)
}

function formatList(items) {
  if (!items || items.length === 0) return 'No results.'
  return items.map((l) => `- ${l}`).join('\n')
}

function getSellerProviderConfig(ctx) {
  const sellerBaseUrl = config.getConfigValue(ctx, 'INFERENCE_SELLER_BASE_URL')
  const providerKey = config.getConfigValue(ctx, 'INFERENCE_PROVIDER_API_KEY')
  if (!sellerBaseUrl || !providerKey) {
    throw new Error(
      'Missing seller provider config. Set INFERENCE_SELLER_BASE_URL and INFERENCE_PROVIDER_API_KEY before creating offers.',
    )
  }
  return { sellerBaseUrl, providerKey }
}

function parsePositiveNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a finite positive number.`)
  }
  return parsed
}

async function offers(ctx = {}) {
  const data = await sellerFetchJson(config.SELLER_OFFERS, {}, ctx)
  const offers = data?.offers || data || []
  if (!offers.length) return { text: 'No offers.' }
  const rows = offers.map((o) => {
    const id = o.id || o.offer_id || o.offerId
    const input = formatPrice(Number(o.price_input_per_1m || o.priceInputPer1m || o.input_price))
    const output = formatPrice(Number(o.price_output_per_1m || o.priceOutputPer1m || o.output_price))
    // The offers list includes soft-deleted (cancelled) offers, so check active
    // first — otherwise a cancelled offer would read as "healthy".
    const state = o.active === false ? 'cancelled' : (o.healthy === false ? 'unhealthy' : 'healthy')
    const capRemaining = o.cap_daily_remaining_usd ?? o.cap_daily_remaining ?? o.capRemaining ?? o.daily_cap_remaining
    const capText = capRemaining !== undefined && capRemaining !== null ? `daily cap remaining: ${formatNumber(capRemaining, 2)}` : 'daily cap: n/a'
    return `${id ? `${id} - ` : ''}${o.model} - ${input} in / ${output} out - ${state} - ${capText}`
  })
  return { text: formatList(rows) }
}

async function sell(ctx = {}) {
  const [model, inputPrice, outputPrice, dailyCap] = parseArgs(ctx.args)
  if (!model || !inputPrice || !outputPrice) {
    return { text: 'Usage: /inference_sell <model> <input_price> <output_price> [daily_cap_usd]' }
  }

  const { sellerBaseUrl, providerKey } = getSellerProviderConfig(ctx)
  const body = {
    model,
    price_input_per_1m: parsePositiveNumber(inputPrice, 'input_price'),
    price_output_per_1m: parsePositiveNumber(outputPrice, 'output_price'),
    api_key: providerKey,
    seller_base_url: sellerBaseUrl,
  }
  if (dailyCap !== undefined) {
    body.cap_daily_usd = parsePositiveNumber(dailyCap, 'daily_cap_usd')
  }

  const data = await sellerFetchJson(config.SELLER_OFFERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, ctx)
  const offerId = data?.id || data?.offer?.id
  return { text: `Offer created${offerId ? `: ${offerId}` : '.'}` }
}

async function price(ctx = {}) {
  const [offerId, inputPrice, outputPrice] = parseArgs(ctx.args)
  if (!offerId || !inputPrice || !outputPrice) {
    return { text: 'Usage: /inference_price <offer_id> <input_price> <output_price>' }
  }
  const data = await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_input_per_1m: parsePositiveNumber(inputPrice, 'input_price'),
      price_output_per_1m: parsePositiveNumber(outputPrice, 'output_price'),
    }),
  }, ctx)
  return { text: `Offer updated${data?.id ? `: ${data.id}` : '.'}` }
}

async function cancel(ctx = {}) {
  const [offerId] = parseArgs(ctx.args)
  if (!offerId) return { text: 'Usage: /inference_cancel <offer_id>' }
  await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}`, { method: 'DELETE' }, ctx)
  return { text: `Offer cancelled: ${offerId}` }
}

async function health(ctx = {}) {
  const data = await sellerFetchJson(config.SELLER_HEALTH, {}, ctx)
  const events = data?.health_log || data?.events || data || []
  if (!events.length) return { text: 'No recent health events.' }
  const rows = events.slice(0, 10).map((e) => {
    const ts = e.timestamp ? new Date(e.timestamp).toISOString() : 'unknown time'
    const detail = e.error_category || e.error || 'event'
    const status = e.status_code ? `status ${e.status_code}` : ''
    const action = e.action_taken ? `action ${e.action_taken}` : ''
    return `${ts} - ${detail} ${status} ${action}`.trim()
  })
  return { text: formatList(rows) }
}

async function earnings(ctx = {}) {
  const data = await sellerFetchJson(config.SELLER_EARNINGS, {}, ctx)
  const lines = [
    `Total earned: ${formatNumber(data?.total_earned_usd ?? 0, 2)} USDC`,
    `Confirmed earned: ${formatNumber(data?.confirmed_earned_usd ?? 0, 2)} USDC`,
    `Requests: ${data?.total_requests ?? 0}`,
    `Tokens: ${data?.total_tokens ?? 0}`,
  ]
  const byModel = Array.isArray(data?.by_model) ? data.by_model.slice(0, 5) : []
  if (byModel.length) {
    lines.push('Top models:')
    for (const m of byModel) {
      lines.push(`  ${m.model} - ${formatNumber(m.earned_usd, 2)} USDC over ${m.requests} req`)
    }
  }
  return { text: formatList(lines) }
}

async function resetHealth(ctx = {}) {
  const [offerId] = parseArgs(ctx.args)
  if (!offerId) return { text: 'Usage: /inference_reset_health <offer_id>' }
  const data = await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}/reset-health`, {
    method: 'POST',
  }, ctx)
  if (data?.ok) {
    const latency = data.latency_ms !== undefined ? ` (${data.latency_ms}ms)` : ''
    return { text: `Health check passed${latency}. Offer ${offerId} is now healthy.` }
  }
  // The endpoint returns 200 with ok:false and a human-readable suggestion on a
  // failed probe, so surface the reason rather than a generic success message.
  const reason = data?.error || 'unknown error'
  const suggestion = data?.suggestion ? `\n${data.suggestion}` : ''
  return { text: `Health check failed for ${offerId}: ${reason}${suggestion}` }
}

async function sellerKey(ctx = {}) {
  if (config.getConfigValue(ctx, 'INFERENCE_SELLER_API_KEY')) {
    return { text: 'INFERENCE_SELLER_API_KEY is already set; seller commands will use it. To mint a new key, unset it first.' }
  }
  if (!hasWalletPrivateKey(ctx)) {
    return { text: 'Cannot mint a seller key: set CLAWDBOT_WALLET_PRIVATE_KEY so the plugin can sign the auth challenge.' }
  }
  const { apiKey } = await mintSellerKey(ctx)
  return {
    text: `Seller API key: ${apiKey}\nSave this key - it will not be shown again. Set INFERENCE_SELLER_API_KEY to reuse it after restart.\nThis key is now part of the conversation context and may be logged; revoke it if this chat is shared.`,
  }
}

function registerSellerCommands(api) {
  api.registerCommand({
    name: 'inference_offers',
    description: 'List your seller offers',
    acceptsArgs: false,
    requireAuth: true,
    handler: offers,
  })

  api.registerCommand({
    name: 'inference_sell',
    description: 'Create a seller offer',
    acceptsArgs: true,
    requireAuth: true,
    handler: sell,
  })

  api.registerCommand({
    name: 'inference_price',
    description: 'Update offer pricing',
    acceptsArgs: true,
    requireAuth: true,
    handler: price,
  })

  api.registerCommand({
    name: 'inference_cancel',
    description: 'Cancel a seller offer',
    acceptsArgs: true,
    requireAuth: true,
    handler: cancel,
  })

  api.registerCommand({
    name: 'inference_health',
    description: 'Show recent health events',
    acceptsArgs: false,
    requireAuth: true,
    handler: health,
  })

  api.registerCommand({
    name: 'inference_earnings',
    description: 'Show seller earnings (settled USDC revenue)',
    acceptsArgs: false,
    requireAuth: true,
    handler: earnings,
  })

  api.registerCommand({
    name: 'inference_reset_health',
    description: 'Re-test an offer and clear its health backoff',
    acceptsArgs: true,
    requireAuth: true,
    handler: resetHealth,
  })

  api.registerCommand({
    name: 'inference_seller_key',
    description: 'Mint a seller API key (requires wallet signature)',
    acceptsArgs: false,
    requireAuth: true,
    handler: sellerKey,
  })
}

module.exports = {
  offers,
  sell,
  price,
  cancel,
  health,
  earnings,
  resetHealth,
  sellerKey,
  registerSellerCommands,
}
