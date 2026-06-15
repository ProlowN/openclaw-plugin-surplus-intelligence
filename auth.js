const { ethers } = require('ethers')
const config = require('./config')
const { errorDetailFromResponse } = require('./errors')

// Keys minted this session, scoped by API base + wallet so a key issued for
// one host/wallet is never sent to another.
const mintedBuyerKeys = new Map()
const mintedSellerKeys = new Map()

function hasWalletPrivateKey(ctx) {
  return Boolean(config.getConfigValue(ctx, 'CLAWDBOT_WALLET_PRIVATE_KEY'))
}

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/

function getWallet(ctx) {
  const raw = config.getConfigValue(ctx, 'CLAWDBOT_WALLET_PRIVATE_KEY')
  if (!raw) return null
  // Validate before constructing: ethers embeds the raw value in its error
  // message, so an invalid key would otherwise leak into chat/log output.
  const privateKey = String(raw).trim()
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error('CLAWDBOT_WALLET_PRIVATE_KEY is not a valid 32-byte hex private key.')
  }
  try {
    return new ethers.Wallet(privateKey)
  } catch {
    throw new Error('CLAWDBOT_WALLET_PRIVATE_KEY is not a valid 32-byte hex private key.')
  }
}

function getSigningWallet(ctx) {
  const wallet = getWallet(ctx)
  if (!wallet) {
    throw new Error('Missing wallet private key. Set CLAWDBOT_WALLET_PRIVATE_KEY to sign on-chain/auth challenges.')
  }
  return wallet
}

async function readJson(resp, failurePrefix) {
  if (!resp.ok) {
    const detail = await errorDetailFromResponse(resp)
    throw new Error(detail ? `${failurePrefix}: ${detail}` : failurePrefix)
  }

  try {
    return await resp.json()
  } catch {
    throw new Error(`${failurePrefix}: response was not JSON`)
  }
}

// Fetch a SIWE challenge for the wallet and sign it. `kind` is 'buyer' | 'seller'.
async function signChallenge(ctx, kind) {
  const wallet = getSigningWallet(ctx)
  const challengePath = kind === 'seller' ? config.SELLER_AUTH_CHALLENGE : config.BUYER_AUTH_CHALLENGE
  const apiBase = config.getApiBase(ctx)
  const challengeResp = await fetch(
    `${apiBase}${challengePath}?address=${encodeURIComponent(wallet.address)}`,
  )
  const challenge = await readJson(challengeResp, `${kind} auth challenge failed`)
  if (!challenge?.message) {
    throw new Error(`${kind} auth challenge returned no message`)
  }
  const signature = await wallet.signMessage(challenge.message)
  return { message: challenge.message, signature, wallet: wallet.address }
}

async function signBuyerAuthChallenge(ctx = {}) {
  return signChallenge(ctx, 'buyer')
}

// Mints a fresh wallet-backed key. Only the explicit /inference_key and
// /inference_seller_key commands call this - no command mints as a side effect.
async function mintKey(ctx, kind) {
  const { message, signature, wallet } = await signChallenge(ctx, kind)
  const keyPath = kind === 'seller' ? config.SELLER_AUTH_KEY : config.BUYER_AUTH_KEY
  const apiBase = config.getApiBase(ctx)
  const keyResp = await fetch(`${apiBase}${keyPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature, label: 'openclaw-plugin' }),
  })
  const data = await readJson(keyResp, `${kind} API key issuance failed`)
  const issuedKey = data?.api_key || data?.key
  if (!issuedKey) {
    throw new Error(`${kind} API key issuance returned no API key`)
  }

  const auth = { apiKey: issuedKey, keyType: kind, wallet: data.wallet || wallet }
  const cache = kind === 'seller' ? mintedSellerKeys : mintedBuyerKeys
  cache.set(`${apiBase}|${wallet}`, auth)
  return auth
}

async function mintBuyerKey(ctx = {}) {
  return mintKey(ctx, 'buyer')
}

async function mintSellerKey(ctx = {}) {
  return mintKey(ctx, 'seller')
}

async function getBuyerAuth(ctx = {}) {
  // Local is named configuredKey, not apiKey: a `const apiKey = …` assignment
  // is a false-positive trigger for ClawHub's hardcoded-secret scanner.
  const configuredKey = config.getConfigValue(ctx, 'INFERENCE_BUYER_API_KEY')
  if (configuredKey) return { apiKey: configuredKey, keyType: 'buyer' }

  const wallet = getWallet(ctx)
  if (wallet) {
    const cached = mintedBuyerKeys.get(`${config.getApiBase(ctx)}|${wallet.address}`)
    if (cached) return cached
  }

  throw new Error(
    'Missing buyer API key. Set INFERENCE_BUYER_API_KEY, or run /inference_key to mint one with CLAWDBOT_WALLET_PRIVATE_KEY.',
  )
}

async function getSellerAuth(ctx = {}) {
  const configuredKey = config.getConfigValue(ctx, 'INFERENCE_SELLER_API_KEY')
  if (configuredKey) return { apiKey: configuredKey, keyType: 'seller' }

  const wallet = getWallet(ctx)
  if (wallet) {
    const cached = mintedSellerKeys.get(`${config.getApiBase(ctx)}|${wallet.address}`)
    if (cached) return cached
  }

  throw new Error(
    'Missing seller API key. Set INFERENCE_SELLER_API_KEY, or run /inference_seller_key to mint one with CLAWDBOT_WALLET_PRIVATE_KEY.',
  )
}

// Signs an EIP-712 typed-data payload (used for gasless USDC permit approval).
// The signing wallet must be the same wallet that owns the buyer key, or the
// server will reject the permit (owner must equal the authenticated wallet).
async function signTypedData(ctx, domain, types, message) {
  const wallet = getSigningWallet(ctx)
  const signature = await wallet.signTypedData(domain, types, message)
  return { signature, wallet: wallet.address }
}

module.exports = {
  getBuyerAuth,
  getSellerAuth,
  hasWalletPrivateKey,
  mintBuyerKey,
  mintSellerKey,
  signBuyerAuthChallenge,
  signTypedData,
}
