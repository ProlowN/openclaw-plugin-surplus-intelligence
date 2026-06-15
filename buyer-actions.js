const config = require('./config')
const { fetchJson, buyerFetchJson } = require('./http')
const { hasWalletPrivateKey, mintBuyerKey, signBuyerAuthChallenge, signTypedData } = require('./auth')

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

const KEY_VISIBILITY_NOTE = 'This key is now part of the conversation context and may be logged; revoke it if this chat is shared.'

async function createKey(ctx = {}) {
  if (!config.getConfigValue(ctx, 'INFERENCE_BUYER_API_KEY')) {
    if (!hasWalletPrivateKey(ctx)) {
      return {
        text: 'Cannot create a key: set INFERENCE_BUYER_API_KEY, or set CLAWDBOT_WALLET_PRIVATE_KEY so /inference_key can mint a wallet-backed key.',
      }
    }
    const { apiKey } = await mintBuyerKey(ctx)
    return {
      text: `Buyer API key: ${apiKey}\nSave this key - it will not be shown again. Set INFERENCE_BUYER_API_KEY to reuse it after restart.\n${KEY_VISIBILITY_NOTE}`,
    }
  }

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
  if (hasWalletPrivateKey(ctx)) {
    const { message, signature } = await signBuyerAuthChallenge(ctx)
    const query = new URLSearchParams({ message, signature }).toString()
    const data = await fetchJson(`${config.BUYER_AUTH_KEYS}?${query}`, {}, ctx)
    const keys = data?.keys || data || []
    return { text: formatList(formatKeyRows(keys)) }
  }

  const data = await buyerFetchJson(config.BUYER_KEYS, {}, ctx)
  const keys = data?.keys || data || []
  const rows = formatKeyRows(keys)
  const legacyNote = 'Unified buyer key listing requires CLAWDBOT_WALLET_PRIVATE_KEY for a fresh wallet signature.'
  if (!rows.length) return { text: `No legacy buyer keys. ${legacyNote}` }
  return { text: `${formatList(rows)}\n${legacyNote}` }
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
  // before any request can be routed; surface the next step when it is short.
  if (!(allowance >= 1)) {
    text += '\n\nApproval is below the $1.00 floor required to buy inference. Run /inference_approve <amount_usdc> for a gasless approval, or /inference_approve_status for details.'
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
  if (!(allowance >= 1)) {
    text += data?.is_contract
      ? '\n\nThis is a smart-contract wallet, so gasless permit approval is not available. Approve USDC to the settlement contract from the web dashboard.'
      : '\n\nApproval is below the $1.00 floor. Run /inference_approve <amount_usdc> for a gasless approval.'
  }
  return { text }
}

async function approve(ctx = {}) {
  const [amountArg] = parseArgs(ctx.args)
  if (!amountArg) return { text: 'Usage: /inference_approve <amount_usdc>  (e.g. /inference_approve 25)' }
  const amount = Number(amountArg)
  if (!Number.isFinite(amount) || amount <= 0) return { text: 'amount_usdc must be a positive number.' }

  // approve-status is the server's source of truth for the spender, USDC token,
  // EIP-2612 permit domain + nonce, and whether the wallet is a smart contract
  // (permit is ecrecover-based, so contract wallets must use the dashboard).
  const status = await buyerFetchJson(config.BUYER_APPROVE_STATUS, {}, ctx)
  if (status?.is_contract) {
    return { text: 'This is a smart-contract wallet — gasless permit is not supported. Approve USDC from the web dashboard instead.' }
  }
  const spender = status?.settlement_contract
  const usdc = status?.usdc_contract
  const domainMeta = status?.permit_domain
  const nonce = status?.permit_nonce
  if (!spender || !usdc || !domainMeta || nonce === undefined || nonce === null) {
    return { text: 'Approval status response was incomplete; cannot build the permit. Try /inference_approve_status.' }
  }

  const value = BigInt(Math.round(amount * 10 ** config.USDC_DECIMALS))
  // A 0-value permit is a valid allowance *revoke* server-side, so refuse an
  // amount that rounds down to 0 base units rather than silently wiping it.
  if (value === 0n) {
    return { text: 'amount_usdc is too small to approve (rounds to 0 USDC base units). Approve at least 0.000001 USDC.' }
  }
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const domain = { name: domainMeta.name, version: domainMeta.version, chainId: config.CHAIN_ID, verifyingContract: usdc }
  const types = {
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  }
  const message = { owner: status.wallet, spender, value, nonce: BigInt(nonce), deadline }

  const { signature, wallet: signer } = await signTypedData(ctx, domain, types, message)
  if (String(signer).toLowerCase() !== String(status.wallet).toLowerCase()) {
    return { text: `Cannot approve: CLAWDBOT_WALLET_PRIVATE_KEY (${signer}) is not the wallet that owns this buyer key (${status.wallet}). They must match to sign the permit.` }
  }

  const result = await buyerFetchJson(config.BUYER_APPROVE_PERMIT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature, value: value.toString(), deadline: deadline.toString() }),
  }, ctx)
  const tx = result?.tx_hash ? ` (tx ${result.tx_hash})` : ''
  return { text: `Approved ${formatNumber(amount, 2)} USDC to the settlement contract${tx}. You can now buy inference.` }
}

async function revokeKey(ctx = {}) {
  const [keyId] = parseArgs(ctx.args)
  if (!keyId) return { text: 'Usage: /inference_key_revoke <key_id>  (find IDs with /inference_keys)' }
  if (!hasWalletPrivateKey(ctx)) {
    return { text: 'Revoking a key requires a fresh wallet signature. Set CLAWDBOT_WALLET_PRIVATE_KEY.' }
  }
  const { message, signature } = await signBuyerAuthChallenge(ctx)
  await fetchJson(`${config.BUYER_AUTH_KEY}/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  }, ctx)
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
    name: 'inference_key',
    description: 'Create a new buyer API key',
    acceptsArgs: false,
    requireAuth: true,
    handler: createKey,
  })

  api.registerCommand({
    name: 'inference_keys',
    description: 'List buyer API keys',
    acceptsArgs: false,
    requireAuth: true,
    handler: listKeys,
  })

  api.registerCommand({
    name: 'inference_balance',
    description: 'Show buyer balance and stats',
    acceptsArgs: false,
    requireAuth: true,
    handler: balance,
  })

  api.registerCommand({
    name: 'inference_savings',
    description: 'Show buyer savings stats',
    acceptsArgs: false,
    requireAuth: true,
    handler: savings,
  })

  api.registerCommand({
    name: 'inference_approve_status',
    description: 'Show USDC balance, allowance, and settlement contract',
    acceptsArgs: false,
    requireAuth: true,
    handler: approveStatus,
  })

  api.registerCommand({
    name: 'inference_approve',
    description: 'Gasless USDC approval to the settlement contract (EIP-2612 permit)',
    acceptsArgs: true,
    requireAuth: true,
    handler: approve,
  })

  api.registerCommand({
    name: 'inference_key_revoke',
    description: 'Revoke a buyer API key (requires wallet signature)',
    acceptsArgs: true,
    requireAuth: true,
    handler: revokeKey,
  })
}

module.exports = {
  prices,
  models,
  createKey,
  listKeys,
  balance,
  savings,
  approveStatus,
  approve,
  revokeKey,
  registerBuyerCommands,
}
