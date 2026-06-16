const config = require('./config')
const { fetchJson, buyerFetchJson } = require('./http')

// The dashboard (/buy) lives on the same host as the API, so derive it from the
// configured base rather than hardcoding prod — a custom/localhost
// INFERENCE_API_URL should link to its own dashboard.
function dashboardUrl(ctx) {
  return `${config.getApiBase(ctx)}/buy`
}

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

function formatKeyRows(keys) {
  return keys.map((k) => {
    const prefix = k.key_prefix || k.prefix || k.keyPrefix || 'inf_'
    const id = k.id ? ` [${k.id}]` : ''
    const label = k.label || '-'
    const lastUsed = k.last_used_at ? new Date(k.last_used_at).toISOString() : 'never'
    const status = (k.revoked || k.revoked_at) ? 'REVOKED' : 'active'
    return `${prefix}${id} - ${label} - ${status} - last used: ${lastUsed}`
  })
}

async function prices(ctx = {}) {
  const args = parseArgs(ctx.args)
  const model = args[0]

  if (!model) {
    const data = await fetchJson(config.MARKETS, {}, ctx)
    const rows = (data?.markets || data || []).map((m) => {
      const name = m.model || m.name || 'unknown'
      const bestIn = formatPrice(Number(m.best_input_price || m.best_input_per_1m || m.bestInputPrice || m.price_input_per_1m))
      const bestOut = formatPrice(Number(m.best_output_price || m.best_output_per_1m || m.bestOutputPrice || m.price_output_per_1m))
      const sellers = m.seller_count ?? m.sellers ?? m.count ?? 0
      return `${name} - ${bestIn} in / ${bestOut} out - ${sellers} sellers`
    })
    return { text: formatList(rows) }
  }

  const data = await fetchJson(`${config.MARKETS}/${encodeURIComponent(model)}`, {}, ctx)
  const offers = data?.offers || data?.orderbook || []
  if (!offers.length) return { text: `No offers for ${model}.` }

  const rows = offers.map((o, i) => {
    const input = formatPrice(Number(o.effective_input_per_1m ?? o.price_input_per_1m ?? o.priceInputPer1m ?? o.input_price))
    const output = formatPrice(Number(o.effective_output_per_1m ?? o.price_output_per_1m ?? o.priceOutputPer1m ?? o.output_price))
    const available = o.available === false ? 'unavailable' : (o.healthy === false ? 'unhealthy' : 'available')
    const capRemaining = o.cap_daily_remaining_usd ?? o.cap_daily_remaining ?? o.capRemaining ?? o.daily_cap_remaining
    const capText = capRemaining !== undefined && capRemaining !== null ? `cap remaining: ${formatNumber(capRemaining, 2)}` : 'cap: n/a'
    const provider = o.provider || (o.seller_base_url ? new URL(o.seller_base_url).hostname : 'unknown')
    return `#${i + 1} ${provider} - ${input} in / ${output} out - ${available} - ${capText}`
  })

  return { text: formatList(rows) }
}

async function models(ctx = {}) {
  const data = await fetchJson(config.MODELS, {}, ctx)
  const models = data?.data || data?.models || data || []
  const rows = models.map((m) => m.id || m.model || m.name).filter(Boolean)
  return { text: formatList(rows) }
}

// Prints how to use the SI key as an OpenAI-compatible provider in any client.
// This is how inference is actually bought — the plugin itself is the dashboard,
// not an inference client. Composes the base URL from config; never echoes the key.
async function provider(ctx = {}) {
  const base = config.getApiBase(ctx)
  const lines = [
    'Use Surplus Intelligence as an OpenAI-compatible provider in your client (opencode, OpenClaw, Cursor, etc.):',
    '',
    `  Base URL:  ${base}/api/inference/v1`,
    '  API key:   your inf_ key (the same value you set as INFERENCE_BUYER_API_KEY)',
    '  Models:    run /inference_models for ids (e.g. anthropic/claude-opus-4.6)',
    '',
    'Every model call your client makes is then bought on Surplus Intelligence and settled in USDC',
    'from the allowance you approved in the dashboard. Check you are funded and approved with',
    '/inference_balance before you start.',
  ]
  return { text: lines.join('\n') }
}

const KEY_VISIBILITY_NOTE = 'This key is now part of the conversation context and may be logged; revoke it if this chat is shared.'

// Issues an additional key through the API using the configured key (POST
// /buyers/keys is authorized by the existing Bearer key — no wallet involved).
// USDC allowance is per-wallet, so a new key inherits your wallet's funding and
// approval and can spend immediately. The first/primary key is created in the dashboard.
async function createKey(ctx = {}) {
  const data = await buyerFetchJson(config.BUYER_KEYS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'openclaw-plugin' }),
  }, ctx)
  const key = data?.api_key || data?.key
  if (!key) return { text: 'No key returned.' }
  return { text: `New API key: ${key}\nSave this key - it will not be shown again.\n${KEY_VISIBILITY_NOTE}` }
}

async function listKeys(ctx = {}) {
  const data = await buyerFetchJson(config.BUYER_KEYS, {}, ctx)
  const keys = data?.keys || data || []
  return { text: formatList(formatKeyRows(keys)) }
}

async function balance(ctx = {}) {
  const data = await buyerFetchJson(config.BUYER_ME, {}, ctx)
  const allowance = Number(data?.usdc_allowance ?? data?.usdc_approval ?? 0)
  const lines = [
    `USDC balance: ${formatNumber(data?.usdc_balance ?? data?.balance_usdc ?? data?.balance ?? 0, 2)}`,
    `USDC approval: ${formatNumber(allowance, 2)}`,
    `Requests: ${data?.total_requests ?? data?.request_count ?? data?.requests ?? 0}`,
    `Total spend: ${formatNumber(data?.total_spent_usd ?? data?.total_spend_usdc ?? data?.total_spend ?? 0, 2)}`,
    `Has fallback key: ${data?.has_fallback_key ? 'yes' : 'no'}`,
  ]
  let text = formatList(lines)
  // The router requires a >=$1.00 USDC allowance to the settlement contract
  // before any request your client sends can be routed; surface the next step
  // when it is short.
  if (!(allowance >= 1)) {
    text += `\n\nApproval is below the $1.00 floor required to buy inference. Approve USDC to the settlement contract from the dashboard (${dashboardUrl(ctx)}); see /inference_approve_status for details.`
  }
  return { text }
}

async function savings(ctx = {}) {
  const data = await buyerFetchJson(config.BUYER_SAVINGS, {}, ctx)
  const lines = [
    `Total saved: ${formatNumber(data?.total_saved_usd ?? data?.total_saved_usdc ?? data?.total_saved ?? 0, 2)}`,
    `Savings rate: ${formatNumber(data?.savings_pct ?? data?.savings_percent ?? 0, 2)}%`,
    `Requests: ${data?.request_count ?? data?.requests ?? 0}`,
  ]
  return { text: formatList(lines) }
}

async function approveStatus(ctx = {}) {
  const data = await buyerFetchJson(config.BUYER_APPROVE_STATUS, {}, ctx)
  const allowance = Number(data?.usdc_allowance ?? 0)
  const lines = [
    `Wallet: ${data?.wallet || 'unknown'}`,
    `USDC balance: ${formatNumber(data?.usdc_balance ?? 0, 2)}`,
    `USDC allowance: ${formatNumber(allowance, 2)}`,
    `Approved: ${data?.approved ? 'yes' : 'no'}`,
    `Settlement contract: ${data?.settlement_contract || 'unknown'}`,
  ]
  let text = formatList(lines)
  // Approving USDC requires an on-chain transaction (or a gasless permit signed
  // by the owning wallet), which the plugin no longer does — point at the
  // dashboard, which handles both EOAs and smart-contract wallets.
  if (!(allowance >= 1)) {
    text += `\n\nApproval is below the $1.00 floor required to buy inference. Approve USDC to the settlement contract from the dashboard (${dashboardUrl(ctx)}).`
  }
  return { text }
}

async function revokeKey(ctx = {}) {
  const [keyId] = parseArgs(ctx.args)
  if (!keyId) return { text: 'Usage: /inference_key_revoke <key_id>  (find IDs with /inference_keys)' }
  await buyerFetchJson(`${config.BUYER_KEYS}/${encodeURIComponent(keyId)}`, { method: 'DELETE' }, ctx)
  return { text: `Revoked key ${keyId}.` }
}

function registerBuyerCommands(api) {
  api.registerCommand({
    name: 'inference_prices',
    description: 'Check current inference prices',
    acceptsArgs: true,
    requireAuth: false,
    handler: prices,
  })

  api.registerCommand({
    name: 'inference_models',
    description: 'List available models',
    acceptsArgs: false,
    requireAuth: false,
    handler: models,
  })

  api.registerCommand({
    name: 'inference_provider',
    description: 'Show how to use your key as an OpenAI-compatible provider',
    acceptsArgs: false,
    requireAuth: true,
    handler: provider,
  })

  api.registerCommand({
    name: 'inference_key',
    description: 'Create another API key',
    acceptsArgs: false,
    requireAuth: true,
    handler: createKey,
  })

  api.registerCommand({
    name: 'inference_keys',
    description: 'List your API keys',
    acceptsArgs: false,
    requireAuth: true,
    handler: listKeys,
  })

  api.registerCommand({
    name: 'inference_balance',
    description: 'Show your balance, USDC allowance, and usage',
    acceptsArgs: false,
    requireAuth: true,
    handler: balance,
  })

  api.registerCommand({
    name: 'inference_savings',
    description: 'Show how much you have saved vs direct pricing',
    acceptsArgs: false,
    requireAuth: true,
    handler: savings,
  })

  api.registerCommand({
    name: 'inference_approve_status',
    description: 'Show funding status: USDC balance, allowance, and settlement contract',
    acceptsArgs: false,
    requireAuth: true,
    handler: approveStatus,
  })

  api.registerCommand({
    name: 'inference_key_revoke',
    description: 'Revoke an API key',
    acceptsArgs: true,
    requireAuth: true,
    handler: revokeKey,
  })
}

module.exports = {
  prices,
  models,
  provider,
  createKey,
  listKeys,
  balance,
  savings,
  approveStatus,
  revokeKey,
  registerBuyerCommands,
}
