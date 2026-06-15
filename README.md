# Surplus Intelligence - OpenClaw Plugin

## What this plugin does

This plugin **manages your Surplus Intelligence account from chat**: browse prices and models, mint/list/revoke API keys, check your USDC balance and approve spend (gasless), view savings, and create/manage/price seller offers and view earnings.

**It does not route the gateway's own model calls through Surplus Intelligence.** It registers slash-commands, not an OpenClaw provider. To have the agent's inference actually run through (and settle on) the marketplace, configure SI as an OpenAI-compatible provider pointing at `<INFERENCE_API_URL>/api/inference/v1` with your `inf_` buyer key. Built-in provider auto-wiring is planned for a future release.

## Install
openclaw plugins install clawhub:surplus-intelligence

## Runtime

This package keeps the CommonJS `module.exports = function register(api)` entrypoint for this release because the current OpenClaw inspector detects command registration from it. A future ESM `definePluginEntry` migration should be handled as a separate package-module change.

## Buyer Setup

Buyer commands can use a pre-provisioned buyer key:

```bash
export INFERENCE_API_URL=https://www.surplusintelligence.ai
export INFERENCE_BUYER_API_KEY=inf_...
```

If `INFERENCE_BUYER_API_KEY` is not set, run `/inference_key` once to mint a wallet-backed buyer key: the plugin SIWE-signs an auth challenge with `CLAWDBOT_WALLET_PRIVATE_KEY` and issues the key through the API. Minting only happens on `/inference_key` — other buyer commands never create keys as a side effect; without a configured or freshly minted key they return an error telling you what to set. Save the minted key and set `INFERENCE_BUYER_API_KEY` to reuse it after the plugin restarts; each `/inference_key` invocation mints a new key (buyer wallets are capped at 25 keys, revoke unused ones from the web dashboard).

Use a dedicated wallet for `CLAWDBOT_WALLET_PRIVATE_KEY`. Never reuse infrastructure keys (for example a marketplace operator or deployer key) in a gateway environment.

`/inference_keys` lists unified buyer keys when wallet signing is configured (showing each key's id and whether it is active or revoked). With only `INFERENCE_BUYER_API_KEY`, it can list legacy buyer keys and will tell you that unified key listing requires a fresh wallet signature. `/inference_key_revoke <key_id>` revokes a key (requires `CLAWDBOT_WALLET_PRIVATE_KEY` for a fresh signature).

Before you can buy inference you need at least $1.00 USDC approved to the settlement contract. `/inference_approve_status` shows your balance, allowance, and the settlement contract address; `/inference_approve <amount_usdc>` grants the allowance gaslessly via an EIP-2612 permit (the wallet that owns the buyer key must be `CLAWDBOT_WALLET_PRIVATE_KEY`). Smart-contract wallets must approve from the web dashboard instead.

## Seller Setup

Seller commands require a pre-provisioned seller key:

```bash
export INFERENCE_API_URL=https://www.surplusintelligence.ai
export INFERENCE_SELLER_API_KEY=si_seller_...
```

Creating offers also requires local provider configuration:

```bash
export INFERENCE_SELLER_BASE_URL=https://seller.example.com
export INFERENCE_PROVIDER_API_KEY=provider-secret
```

If `INFERENCE_SELLER_API_KEY` is not set, run `/inference_seller_key` once to mint a wallet-backed seller key (SIWE-signed with `CLAWDBOT_WALLET_PRIVATE_KEY`, shown once — save it and set `INFERENCE_SELLER_API_KEY` to reuse it). As with buyer keys, minting happens only on that explicit command; no other seller command creates a key as a side effect. `/inference_sell` validates `INFERENCE_SELLER_BASE_URL` and `INFERENCE_PROVIDER_API_KEY` locally before calling seller endpoints. Provider API keys and wallet private keys are sensitive; do not log or share them.

`/inference_earnings` shows settled USDC revenue. `/inference_reset_health <offer_id>` re-tests an offer's upstream endpoint and clears its health backoff if the probe passes (or returns the failure reason if not).

## API Rate Limits

The backend enforces rate limits and returns HTTP 429 with `Retry-After` and `X-RateLimit-Reset` headers when a limit is exceeded. The plugin does not add a separate local throttle.

| Scope | Applies to | Limit |
| --- | --- | --- |
| Seller CRUD | `/inference_sell`, `/inference_price`, `/inference_cancel` | 30 requests/minute per seller API key, plus 200 requests/minute per wallet aggregate |
| Seller read-only | `/inference_offers`, `/inference_health`, `/inference_earnings` | 60 requests/minute per seller API key |
| Seller bulk/provider probes | `/inference_reset_health` (and bulk-create/discover/test-connection, not exposed by this plugin) | 5 requests/minute |
| Auth challenges | Wallet-signed key minting, listing, and revoke (`/inference_key`, `/inference_seller_key`, `/inference_keys`, `/inference_key_revoke`) share one bucket | 10 requests/minute per IP (combined) |
| Buyer key listing (legacy) | `/inference_key` and `/inference_keys` when `INFERENCE_BUYER_API_KEY` is set | 30 requests/minute per IP |

## Environment and Config

| Name | Purpose | Sensitive |
| --- | --- | --- |
| `INFERENCE_API_URL` | Surplus Intelligence API base URL. Defaults to `https://www.surplusintelligence.ai`. Must be https; http is allowed only for localhost. | no |
| `INFERENCE_BUYER_API_KEY` | Buyer API key for buyer-authenticated commands. | yes |
| `INFERENCE_SELLER_API_KEY` | Seller API key for seller-authenticated commands. | yes |
| `INFERENCE_SELLER_BASE_URL` | Provider base URL sent when creating offers. | no |
| `INFERENCE_PROVIDER_API_KEY` | Provider API key sent only to the seller offer endpoint. | yes |
| `CLAWDBOT_WALLET_PRIVATE_KEY` | Dedicated wallet private key, used only to sign SIWE auth challenges (buyer/seller key minting, listing, revoke) and the gasless USDC approval permit. | yes |

Values set in the plugin config take precedence over environment variables of the same name.

## Commands

All commands except `/inference_prices` and `/inference_models` require an authorized sender (OpenClaw `requireAuth`), so unauthorized chat participants cannot mint keys, read account data, or change offers.

- /inference_prices [model] - Show current inference prices (orderbook if model specified)
  - Example: /inference_prices
  - Example: /inference_prices openai/gpt-4o-mini
- /inference_models - List available models
  - Example: /inference_models
- /inference_key - Create a new buyer API key (shown once; the key becomes visible in the chat context, so treat the transcript as sensitive)
  - Example: /inference_key
- /inference_keys - List buyer API keys (id, active/revoked status, last used)
  - Example: /inference_keys
- /inference_key_revoke <key_id> - Revoke a buyer API key (requires wallet signature)
  - Example: /inference_key_revoke abc123
- /inference_balance - Show buyer balance, approval, usage stats
  - Example: /inference_balance
- /inference_approve_status - Show USDC balance, allowance, and settlement contract
  - Example: /inference_approve_status
- /inference_approve <amount_usdc> - Gasless USDC approval to the settlement contract
  - Example: /inference_approve 25
- /inference_savings - Show total savings and request count
  - Example: /inference_savings
- /inference_seller_key - Mint a seller API key (shown once; requires wallet signature)
  - Example: /inference_seller_key
- /inference_offers - List your seller offers with offer IDs
  - Example: /inference_offers
- /inference_sell <model> <input_price> <output_price> [daily_cap_usd] - Create offer
  - Example: /inference_sell openai/gpt-4o-mini 1.25 2.10 50
- /inference_price <offer_id> <input_price> <output_price> - Update pricing
  - Example: /inference_price offer_123 1.10 2.00
- /inference_cancel <offer_id> - Cancel offer
  - Example: /inference_cancel offer_123
- /inference_health - Show recent health events
  - Example: /inference_health
- /inference_earnings - Show seller earnings (settled USDC revenue)
  - Example: /inference_earnings
- /inference_reset_health <offer_id> - Re-test an offer and clear its health backoff
  - Example: /inference_reset_health offer_123

## Uninstall
rm -rf ~/.openclaw/extensions/surplus-intelligence
openclaw gateway restart
