const config = require('./config')
const { sellerFetchJson, sellerFetchNdjson } = require('./http')
const { hasSellerAuth, mintSellerKey } = require('./auth')
const { resolveProvider, providerIds } = require('./providers')

// v1 offer/earnings responses carry per-1M prices and lifetime totals as
// integer micro-dollars (µ$, 1 USD = 1_000_000). Requests stay plain USD.
function microToUsd(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n / 1_000_000 : null
}

function formatUsd(n, unit = '') {
  const num = Number(n)
  if (n === null || n === undefined || Number.isNaN(num)) return 'N/A'
  const decimals = Math.abs(num) > 0 && Math.abs(num) < 0.05 ? 4 : 2
  return `$${num.toFixed(decimals)}${unit}`
}

function formatMicroPer1M(v) {
  const usd = microToUsd(v)
  return usd === null ? 'N/A' : formatUsd(usd, '/1M')
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

function parsePositiveNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a finite positive number.`)
  }
  return parsed
}

// A trailing-% arg selects discount pricing (cost_multiplier mode): "15%" =
// 15% under the marketplace reference price. Returns null when not a percent.
function parseDiscountArg(value) {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(value || ''))
  if (!m) return null
  const pct = Number(m[1])
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
    throw new Error('discount must be a percentage between 0 and 100 (exclusive), e.g. 15%.')
  }
  return pct
}

// Provider resolution (id -> allowlisted base URL) + the upstream key being
// resold. The base URL is never typed by the user, so it can't be off-allowlist.
function getProviderConfig(ctx) {
  const providerId = config.getConfigValue(ctx, 'INFERENCE_SELLER_PROVIDER')
  const providerKey = config.getConfigValue(ctx, 'INFERENCE_SELLER_PROVIDER_API_KEY')

  const provider = resolveProvider(providerId)
  if (!provider) {
    throw new Error(
      `Set INFERENCE_SELLER_PROVIDER to a supported provider id. Allowed: ${providerIds().join(', ')}.`,
    )
  }
  if (!providerKey) {
    throw new Error('Missing INFERENCE_SELLER_PROVIDER_API_KEY — the provider API key you are reselling.')
  }
  return { baseUrl: provider.baseUrl, providerKey }
}

// Offer creation additionally needs the payout address where USDC earnings
// settle (the user's real wallet — the seller identity itself holds no funds).
function getSellerOfferConfig(ctx) {
  const { baseUrl, providerKey } = getProviderConfig(ctx)
  const payoutAddress = config.getConfigValue(ctx, 'INFERENCE_SELLER_PAYOUT_ADDRESS')
  if (!payoutAddress || !/^0x[a-fA-F0-9]{40}$/.test(String(payoutAddress).trim())) {
    throw new Error('Set INFERENCE_SELLER_PAYOUT_ADDRESS to your wallet (0x…) where USDC earnings settle.')
  }
  return { baseUrl, providerKey, payoutAddress: String(payoutAddress).trim() }
}

function describeOffer(o) {
  const id = o.offer_id || o.id
  const price =
    o.pricing_mode === 'cost_multiplier' && o.cost_multiplier != null
      ? `${formatNumber((1 - Number(o.cost_multiplier)) * 100, 1)}% off reference`
      : `${formatMicroPer1M(o.price_input_per_1m)} in / ${formatMicroPer1M(o.price_output_per_1m)} out`
  const status = o.status || (o.active === false ? 'inactive' : 'active')
  const health = o.healthy === false ? `unhealthy (${o.consecutive_failures ?? '?'} fails)` : 'healthy'
  const cap = o.cap_daily_usd !== undefined && o.cap_daily_usd !== null ? `cap ${formatUsd(o.cap_daily_usd)}/day` : 'no daily cap'
  const hint = o.api_key_hint ? ` - key ${o.api_key_hint}` : ''
  return `${id ? `${id} - ` : ''}${o.model} - ${price} - ${status} - ${health} - ${cap}${hint}`
}

// Follows next_token so "list my offers" is complete, with a page ceiling so a
// pathological backend can't loop us forever.
async function listAllOffers(ctx, query = {}) {
  const items = []
  let nextToken
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams()
    if (query.status) params.set('status', query.status)
    if (nextToken) params.set('next_token', nextToken)
    const qs = params.toString()
    const data = await sellerFetchJson(`${config.SELLER_OFFERS}${qs ? `?${qs}` : ''}`, {}, ctx)
    items.push(...(data?.items || []))
    nextToken = data?.next_token
    if (!nextToken) break
  }
  return items
}

async function offers(ctx = {}) {
  const [statusFilter] = parseArgs(ctx.args)
  if (statusFilter && !['active', 'paused', 'inactive'].includes(statusFilter)) {
    return { text: 'Usage: /inference_offers [active|inactive]  (paused offers are stored as inactive)' }
  }
  // The backend has no stored 'paused' state — paused offers persist and list
  // as 'inactive', so filtering on 'paused' verbatim would never match.
  const effectiveFilter = statusFilter === 'paused' ? 'inactive' : statusFilter
  const list = await listAllOffers(ctx, { status: effectiveFilter })
  if (!list.length) return { text: effectiveFilter ? `No ${effectiveFilter} offers.` : 'No offers.' }
  return { text: formatList(list.map(describeOffer)) }
}

// A discount percentage maps to the multiplier the backend actually reads:
// `discount` alone is honored only for media models (image/video/music), while
// text/embedding models resolve the multiplier from `cost_multiplier` and 400
// without it — so send both.
function discountToMultiplier(discount) {
  return Number((1 - discount / 100).toFixed(6))
}

function buildPricingBody(inputPrice, outputPrice) {
  const discount = parseDiscountArg(inputPrice)
  if (discount !== null) {
    return { pricing_mode: 'cost_multiplier', cost_multiplier: discountToMultiplier(discount), discount }
  }
  if (!outputPrice) return null
  return {
    pricing_mode: 'per_token',
    price_input_per_1m: parsePositiveNumber(inputPrice, 'input_price'),
    price_output_per_1m: parsePositiveNumber(outputPrice, 'output_price'),
  }
}

const SELL_USAGE =
  'Usage: /inference_sell <model> <input_price> <output_price> [daily_cap_usd]\n' +
  '   or: /inference_sell <model> <discount>% [daily_cap_usd]   (e.g. 15% under reference price)'

async function sell(ctx = {}) {
  const args = parseArgs(ctx.args)
  const [model] = args
  if (!model || args.length < 2) return { text: SELL_USAGE }

  const discountMode = parseDiscountArg(args[1]) !== null
  const pricing = buildPricingBody(args[1], discountMode ? undefined : args[2])
  if (!pricing) return { text: SELL_USAGE }
  const dailyCap = discountMode ? args[2] : args[3]

  const { baseUrl, providerKey, payoutAddress } = getSellerOfferConfig(ctx)
  const body = {
    model,
    ...pricing,
    api_key: providerKey,
    seller_base_url: baseUrl,
    payout_address: payoutAddress,
  }
  if (dailyCap !== undefined) {
    body.cap_daily_usd = parsePositiveNumber(dailyCap, 'daily_cap_usd')
  }

  const data = await sellerFetchJson(config.SELLER_OFFERS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, ctx)
  const offerId = data?.offer_id || data?.id
  const trusted = data?.trusted === false ? ' (untrusted provider)' : ''
  return { text: `Offer created${offerId ? `: ${offerId}` : '.'}${trusted}` }
}

async function price(ctx = {}) {
  const [offerId, inputPrice, outputPrice] = parseArgs(ctx.args)
  const usage =
    'Usage: /inference_price <offer_id> <input_price> <output_price>\n' +
    '   or: /inference_price <offer_id> <discount>%'
  if (!offerId || !inputPrice) return { text: usage }

  const pricing = buildPricingBody(inputPrice, outputPrice)
  if (!pricing) return { text: usage }

  const data = await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pricing),
  }, ctx)
  const summary = data?.model ? ` — ${describeOffer(data)}` : ''
  return { text: `Offer updated${summary || `: ${offerId}`}` }
}

async function setOfferStatus(ctx, status, commandName, describe) {
  const [offerId] = parseArgs(ctx.args)
  if (!offerId) return { text: `Usage: /${commandName} <offer_id>` }
  const data = await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }, ctx)
  return { text: describe(offerId, data?.status || status) }
}

async function pause(ctx = {}) {
  // 'paused' is stored as inactive server-side; either way it stops routing.
  return setOfferStatus(ctx, 'paused', 'inference_pause',
    (id) => `Offer ${id} paused (listed as 'inactive'). /inference_resume brings it back.`)
}

async function resume(ctx = {}) {
  // Reactivation re-checks the 2x-reference price cap, so this can fail on an
  // offer whose price drifted above the cap while it was paused.
  return setOfferStatus(ctx, 'active', 'inference_resume',
    (id, now) => `Offer ${id} is now ${now}.`)
}

async function cancel(ctx = {}) {
  const [offerId] = parseArgs(ctx.args)
  if (!offerId) return { text: 'Usage: /inference_cancel <offer_id>' }
  await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(offerId)}`, { method: 'DELETE' }, ctx)
  return { text: `Offer cancelled: ${offerId} (deactivated; use /inference_resume to relist it).` }
}

async function health(ctx = {}) {
  const [offerId] = parseArgs(ctx.args)
  const qs = offerId ? `?offer_id=${encodeURIComponent(offerId)}` : ''
  const data = await sellerFetchJson(`${config.SELLER_HEALTH}${qs}`, {}, ctx)
  const events = data?.items || data?.health_log || data?.events || []
  if (!events.length) return { text: 'No recent health events.' }
  const rows = events.slice(0, 10).map((e) => {
    const ts = e.timestamp ? new Date(e.timestamp).toISOString() : 'unknown time'
    const offer = !offerId && e.offer_id ? `[${e.offer_id}] ` : ''
    const detail = e.error_category || e.error_detail || 'event'
    const status = e.status_code ? `status ${e.status_code}` : ''
    const action = e.action_taken ? `action ${e.action_taken}` : ''
    return `${ts} - ${offer}${detail} ${status} ${action}`.trim()
  })
  return { text: formatList(rows) }
}

const EARNINGS_RANGES = ['7d', '30d', '90d', 'lifetime']

async function earnings(ctx = {}) {
  const [range] = parseArgs(ctx.args)
  if (range && !EARNINGS_RANGES.includes(range)) {
    return { text: `Usage: /inference_earnings [${EARNINGS_RANGES.join('|')}]` }
  }
  const qs = range ? `?range=${encodeURIComponent(range)}` : ''
  const data = await sellerFetchJson(`${config.SELLER_EARNINGS}${qs}`, {}, ctx)

  const share = data?.share || {}
  const lines = [
    `Lifetime: earned ${formatUsd(microToUsd(data?.total_earned_usdc) ?? 0)} (pending ${formatUsd(microToUsd(data?.pending_usdc) ?? 0)}, paid ${formatUsd(microToUsd(data?.paid_usdc) ?? 0)})`,
    `Last ${data?.range || range || '7d'}: ${formatUsd(share.earned_usd ?? 0)} over ${share.requests ?? 0} requests, ${share.tokens ?? 0} tokens${share.top_model ? ` (top model: ${share.top_model})` : ''}`,
  ]

  const byModel = Array.isArray(data?.by_model) ? data.by_model.slice(0, 5) : []
  if (byModel.length) {
    lines.push('Top models:')
    for (const m of byModel) {
      lines.push(`  ${m.model} - ${formatUsd(m.earned_usd ?? 0)} over ${m.requests ?? 0} req`)
    }
  }

  const sales = Array.isArray(data?.recent_sales) ? data.recent_sales.slice(0, 5) : []
  if (sales.length) {
    lines.push('Recent sales:')
    for (const s of sales) {
      const ts = s.created_at ? new Date(s.created_at).toISOString() : ''
      lines.push(`  ${s.model} - ${formatUsd(microToUsd(s.seller_cost_usdc) ?? 0)} - ${s.settlement_status || 'pending'} ${ts}`.trim())
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
  // v1 reset-health clears the backoff without probing the provider, so point
  // at /inference_test for an actual end-to-end check.
  if (data?.healthy === true || data?.status) {
    return { text: `Health backoff cleared for ${offerId} (status ${data.status || 'active'}). Run /inference_test <model> to verify the provider responds.` }
  }
  const reason = data?.error || 'unknown error'
  const suggestion = data?.suggestion ? `\n${data.suggestion}` : ''
  return { text: `Health reset failed for ${offerId}: ${reason}${suggestion}` }
}

async function testConnection(ctx = {}) {
  const models = parseArgs(ctx.args)
  if (!models.length) return { text: 'Usage: /inference_test <model> [model2 ...]' }
  const { baseUrl, providerKey } = getProviderConfig(ctx)

  if (models.length === 1) {
    const data = await sellerFetchJson(config.SELLER_TEST_CONNECTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: providerKey, base_url: baseUrl, model: models[0] }),
    }, ctx)
    if (data?.ok) {
      const latency = data.latency_ms !== undefined ? ` (${data.latency_ms}ms)` : ''
      return { text: `Connection OK for ${models[0]}${latency}.` }
    }
    return { text: `Connection failed for ${models[0]}: ${data?.error || 'unknown error'}` }
  }

  const lines = await sellerFetchNdjson(config.SELLER_TEST_HEALTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: providerKey, base_url: baseUrl, models }),
  }, ctx)
  if (!lines.length) return { text: 'No probe results returned.' }
  const rows = lines.map((r) => {
    if (r.ok) return `${r.model} - OK${r.latency_ms !== undefined ? ` (${r.latency_ms}ms)` : ''}`
    return `${r.model} - FAILED${r.error ? `: ${r.error}` : ''}`
  })
  return { text: formatList(rows) }
}

async function discover(ctx = {}) {
  const { baseUrl, providerKey } = getProviderConfig(ctx)
  const lines = await sellerFetchNdjson(config.SELLER_DISCOVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: providerKey, base_url: baseUrl }),
  }, ctx)
  if (!lines.length) return { text: 'No models discovered.' }

  const supported = lines.filter((l) => l.supported)
  const rows = supported.slice(0, 30).map((l) => {
    const p = l.pricing
    let priceText = ''
    if (p) {
      // price_unit says what input/output_per_1m are denominated in: 'M' (or
      // absent) = USD per 1M tokens; media units (image/sec/…) are USD per
      // unit, carried in input_per_1m (a floor when price_variable).
      const unit = p.price_unit && p.price_unit !== 'M' ? p.price_unit : null
      priceText = unit
        ? ` - direct ${formatUsd(p.input_per_1m, `/${unit}`)}${p.price_variable ? ' (floor)' : ''}`
        : ` - direct ${formatUsd(p.input_per_1m, '/1M')} in / ${formatUsd(p.output_per_1m, '/1M')} out`
    }
    return `${l.model}${priceText}`
  })
  if (supported.length > 30) rows.push(`…and ${supported.length - 30} more`)
  const header = `${supported.length} of ${lines.length} provider models are sellable on the marketplace:`
  if (!supported.length) return { text: `None of the provider's ${lines.length} models are sellable on the marketplace.` }
  return { text: `${header}\n${formatList(rows)}` }
}

async function sellBulk(ctx = {}) {
  const args = parseArgs(ctx.args)
  const usage = 'Usage: /inference_sell_bulk <discount>% <model> [model2 ...]   (e.g. /inference_sell_bulk 15% m1 m2)'
  if (args.length < 2) return { text: usage }
  const discount = parseDiscountArg(args[0])
  if (discount === null) return { text: usage }
  const models = args.slice(1)

  const { baseUrl, providerKey, payoutAddress } = getSellerOfferConfig(ctx)
  // Like buildPricingBody: text models resolve pricing from cost_multiplier
  // (discount alone 400s), media models from discount — send both per item.
  const multiplier = discountToMultiplier(discount)
  const lines = await sellerFetchNdjson(config.SELLER_OFFERS_BULK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: providerKey,
      base_url: baseUrl,
      offers: models.map((model) => ({ model, discount, cost_multiplier: multiplier })),
    }),
  }, ctx)
  if (!lines.length) return { text: 'Bulk create returned no results.' }

  // The bulk endpoint has no payout_address field, and settlement falls back to
  // the seller wallet — which for a key minted by this plugin is a discarded
  // throwaway. Route every created offer's earnings to the configured payout
  // address immediately; an offer we can't re-point gets cancelled rather than
  // left earning into a burned wallet.
  const rows = []
  for (const line of lines) {
    if (line.status !== 'created' || !line.offer_id) {
      rows.push(`${line.model} - ${line.status || 'error'}${line.error ? `: ${line.error}` : ''}`)
      continue
    }
    try {
      await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(line.offer_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_address: payoutAddress }),
      }, ctx)
      rows.push(`${line.model} - created: ${line.offer_id}`)
    } catch (err) {
      let note = 'could not cancel it — cancel manually with /inference_cancel'
      try {
        await sellerFetchJson(`${config.SELLER_OFFERS}/${encodeURIComponent(line.offer_id)}`, { method: 'DELETE' }, ctx)
        note = 'offer cancelled'
      } catch {}
      rows.push(`${line.model} - created as ${line.offer_id} but payout address could not be set (${err.message}); ${note}.`)
    }
  }
  return { text: formatList(rows) }
}

const KEY_VISIBILITY_NOTE = 'This key is now part of the conversation context and may be logged; revoke it if this chat is shared.'

async function sellerKey(ctx = {}) {
  // With a seller credential on hand, additional keys come from the Bearer
  // key CRUD — no wallet involved. The SIWE throwaway-wallet mint is only the
  // bootstrap for the very first key.
  if (hasSellerAuth(ctx)) {
    const data = await sellerFetchJson(config.SELLER_KEYS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'openclaw-plugin' }),
    }, ctx)
    const issuedKey = data?.key || data?.api_key
    if (!issuedKey) return { text: 'No key returned.' }
    return {
      text:
        `New seller API key: ${issuedKey}\n` +
        'Save this key - it will not be shown again. It belongs to the same seller account as the key that created it.\n' +
        KEY_VISIBILITY_NOTE,
    }
  }

  const { apiKey } = await mintSellerKey(ctx)
  return {
    text:
      `Seller API key: ${apiKey}\n` +
      'Save this key - it will not be shown again. Set INFERENCE_SELLER_API_KEY to reuse it after restart.\n' +
      'The one-time wallet used to create it was discarded; your USDC earnings settle to INFERENCE_SELLER_PAYOUT_ADDRESS, not to that wallet.\n' +
      KEY_VISIBILITY_NOTE,
  }
}

async function sellerKeys(ctx = {}) {
  const data = await sellerFetchJson(config.SELLER_KEYS, {}, ctx)
  const keys = data?.items || data?.keys || []
  if (!keys.length) return { text: 'No seller keys.' }
  const rows = keys.map((k) => {
    const prefix = k.key_prefix || k.prefix || 'si_seller_'
    const id = k.id ? ` [${k.id}]` : ''
    const label = k.label || '-'
    const lastUsed = k.last_used_at ? new Date(k.last_used_at).toISOString() : 'never'
    const status = k.revoked_at ? 'REVOKED' : 'active'
    return `${prefix}${id} - ${label} - ${status} - last used: ${lastUsed}`
  })
  return { text: formatList(rows) }
}

async function sellerKeyRevoke(ctx = {}) {
  const [keyId] = parseArgs(ctx.args)
  if (!keyId) return { text: 'Usage: /inference_seller_key_revoke <key_id>  (find IDs with /inference_seller_keys)' }
  await sellerFetchJson(`${config.SELLER_KEYS}/${encodeURIComponent(keyId)}`, { method: 'DELETE' }, ctx)
  return { text: `Revoked seller key ${keyId}.` }
}

function registerSellerCommands(api) {
  api.registerCommand({
    name: 'inference_seller_key',
    description: 'Create a seller API key (first key: one-time wallet, discarded; later keys: via your existing key)',
    acceptsArgs: false,
    requireAuth: true,
    handler: sellerKey,
  })

  api.registerCommand({
    name: 'inference_seller_keys',
    description: 'List your seller API keys',
    acceptsArgs: false,
    requireAuth: true,
    handler: sellerKeys,
  })

  api.registerCommand({
    name: 'inference_seller_key_revoke',
    description: 'Revoke a seller API key',
    acceptsArgs: true,
    requireAuth: true,
    handler: sellerKeyRevoke,
  })

  api.registerCommand({
    name: 'inference_offers',
    description: 'List your seller offers (optionally filtered: active|paused|inactive)',
    acceptsArgs: true,
    requireAuth: true,
    handler: offers,
  })

  api.registerCommand({
    name: 'inference_sell',
    description: 'Create a seller offer (per-token prices, or a discount like 15%)',
    acceptsArgs: true,
    requireAuth: true,
    handler: sell,
  })

  api.registerCommand({
    name: 'inference_sell_bulk',
    description: 'Create offers for many models at once at a discount (e.g. 15% m1 m2)',
    acceptsArgs: true,
    requireAuth: true,
    handler: sellBulk,
  })

  api.registerCommand({
    name: 'inference_price',
    description: 'Update offer pricing (per-token prices, or a discount like 15%)',
    acceptsArgs: true,
    requireAuth: true,
    handler: price,
  })

  api.registerCommand({
    name: 'inference_pause',
    description: 'Pause an offer (stops routing; price and config are kept)',
    acceptsArgs: true,
    requireAuth: true,
    handler: pause,
  })

  api.registerCommand({
    name: 'inference_resume',
    description: 'Resume a paused or cancelled offer',
    acceptsArgs: true,
    requireAuth: true,
    handler: resume,
  })

  api.registerCommand({
    name: 'inference_cancel',
    description: 'Cancel a seller offer (soft-deactivates it)',
    acceptsArgs: true,
    requireAuth: true,
    handler: cancel,
  })

  api.registerCommand({
    name: 'inference_health',
    description: 'Show recent health events (optionally for one offer id)',
    acceptsArgs: true,
    requireAuth: true,
    handler: health,
  })

  api.registerCommand({
    name: 'inference_earnings',
    description: 'Show seller earnings (7d|30d|90d|lifetime; settled USDC revenue)',
    acceptsArgs: true,
    requireAuth: true,
    handler: earnings,
  })

  api.registerCommand({
    name: 'inference_reset_health',
    description: 'Clear an offer\'s health backoff so it is probed again',
    acceptsArgs: true,
    requireAuth: true,
    handler: resetHealth,
  })

  api.registerCommand({
    name: 'inference_test',
    description: 'Probe your provider: /inference_test <model> [model2 ...]',
    acceptsArgs: true,
    requireAuth: true,
    handler: testConnection,
  })

  api.registerCommand({
    name: 'inference_discover',
    description: 'List which of your provider\'s models are sellable on the marketplace',
    acceptsArgs: false,
    requireAuth: true,
    handler: discover,
  })
}

module.exports = {
  offers,
  sell,
  sellBulk,
  price,
  pause,
  resume,
  cancel,
  health,
  earnings,
  resetHealth,
  testConnection,
  discover,
  sellerKey,
  sellerKeys,
  sellerKeyRevoke,
  getSellerOfferConfig,
  registerSellerCommands,
}
