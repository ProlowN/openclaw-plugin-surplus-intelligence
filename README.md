<p align="center">
  <img src="https://raw.githubusercontent.com/ProlowN/openclaw-plugin-surplus-intelligence/main/assets/surplus-logo.png" alt="Surplus Intelligence" width="180" />
</p>

# Surplus Intelligence

*Manage your Surplus Intelligence inference-marketplace account from chat — prices, models, API keys, USDC balance & gasless spend approval, savings, and seller offers/earnings.*

[![npm version](https://img.shields.io/npm/v/@prolown/openclaw-surplus-intelligence)](https://www.npmjs.com/package/@prolown/openclaw-surplus-intelligence)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## What this plugin does

[Surplus Intelligence](https://www.surplusintelligence.ai) is an inference marketplace where you buy and sell LLM inference, settled in USDC on Base. **This plugin manages your account from chat** via slash-commands:

- Browse current prices and available models
- Mint, list, and revoke API keys
- Check your USDC balance and approve spend **gaslessly**
- View your savings
- Create, price, cancel, and monitor seller offers, and view earnings

> **Note:** This plugin manages your account — it does **not** route the gateway's own model calls through Surplus Intelligence. To route inference through SI, add it as an OpenAI-compatible provider at `<INFERENCE_API_URL>/api/inference/v1` using your `inf_` buyer key. Built-in provider auto-wiring is planned for a future release.

## Security

This plugin handles a wallet private key and mints API keys into the chat — read this first:

- **Use a dedicated wallet** for `CLAWDBOT_WALLET_PRIVATE_KEY`. Never reuse an infrastructure, operator, or deployer key in a gateway environment.
- **Minted keys are shown once and become part of the chat transcript.** Treat the transcript as sensitive and revoke a key if the chat is shared.
- Provider API keys and wallet private keys are sensitive. The plugin never logs them — don't share them.

## Install

```bash
# From ClawHub (default)
openclaw plugins install clawhub:@prolown/openclaw-surplus-intelligence

# …or from npm
openclaw plugins install npm:@prolown/openclaw-surplus-intelligence
```

## Quickstart

1. Install (above).
2. Browse the marketplace with **no credentials**:

   ```text
   /inference_prices
   /inference_models
   ```
3. For account actions, set `INFERENCE_API_URL` (defaults to `https://www.surplusintelligence.ai`) and either provide a buyer key:

   ```bash
   export INFERENCE_BUYER_API_KEY=inf_...
   ```

   …or run `/inference_key` once with `CLAWDBOT_WALLET_PRIVATE_KEY` set to mint one. See **Buyer Setup** / **Seller Setup** below for the full flow.

## Commands

All commands except `/inference_prices` and `/inference_models` require an authorized sender (OpenClaw `requireAuth`), so unauthorized chat participants cannot mint keys, read account data, or change offers.

### Public (no auth)

| Command | Description |
| --- | --- |
| `/inference_prices [model]` | Show current inference prices (orderbook if a model is given) |
| `/inference_models` | List available models |

### Buyer

| Command | Description |
| --- | --- |
| `/inference_key` | Mint a buyer API key (shown once; the key enters the chat transcript — treat it as sensitive) |
| `/inference_keys` | List buyer API keys (key prefix + id, label, active/revoked status, last used) |
| `/inference_key_revoke <key_id>` | Revoke a buyer API key (requires wallet signature) |
| `/inference_balance` | Show buyer balance, approval, and usage stats |
| `/inference_approve_status` | Show USDC balance, allowance, and the settlement contract |
| `/inference_approve <amount_usdc>` | Gasless USDC approval to the settlement contract |
| `/inference_savings` | Show total savings and request count |

### Seller

| Command | Description |
| --- | --- |
| `/inference_seller_key` | Mint a seller API key (shown once; requires wallet signature) |
| `/inference_offers` | List your seller offers with offer IDs |
| `/inference_sell <model> <input_price> <output_price> [daily_cap_usd]` | Create an offer |
| `/inference_price <offer_id> <input_price> <output_price>` | Update pricing |
| `/inference_cancel <offer_id>` | Cancel an offer |
| `/inference_health` | Show recent health events |
| `/inference_earnings` | Show seller earnings (settled USDC revenue) |
| `/inference_reset_health <offer_id>` | Re-test an offer and clear its health backoff |

Example invocations:

```text
/inference_prices openai/gpt-4o-mini
/inference_approve 25
/inference_sell openai/gpt-4o-mini 1.25 2.10 50
/inference_price offer_123 1.10 2.00
/inference_reset_health offer_123
```

## Buyer Setup

Buyer commands can use a pre-provisioned buyer key:

```bash
export INFERENCE_API_URL=https://www.surplusintelligence.ai
export INFERENCE_BUYER_API_KEY=inf_...
```

If `INFERENCE_BUYER_API_KEY` is not set, run `/inference_key` once to mint a wallet-backed buyer key: the plugin SIWE-signs an auth challenge with `CLAWDBOT_WALLET_PRIVATE_KEY` and issues the key through the API. Minting only happens on `/inference_key` — other buyer commands never create keys as a side effect; without a configured or freshly minted key they return an error telling you what to set. Save the minted key and set `INFERENCE_BUYER_API_KEY` to reuse it after the plugin restarts; each `/inference_key` invocation mints a new key (buyer wallets are capped at 25 keys — revoke unused ones from the Surplus Intelligence web dashboard).

> Unlike `/inference_seller_key` (which refuses if `INFERENCE_SELLER_API_KEY` is already set), running `/inference_key` while `INFERENCE_BUYER_API_KEY` is set still issues an additional buyer key through the API, so it also counts against the 25-key cap. Unset the variable first if you only want to reuse the existing key.

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

## API Rate Limits

The backend enforces rate limits and returns HTTP 429 with `Retry-After` and `X-RateLimit-Reset` headers when a limit is exceeded; the plugin adds no separate local throttle, so honor `Retry-After`. The limits below are enforced server-side and **subject to change** — see the Surplus Intelligence API docs for authoritative values.

| Scope | Applies to | Limit |
| --- | --- | --- |
| Seller CRUD | `/inference_sell`, `/inference_price`, `/inference_cancel` | 30/min per key (+200/min per wallet) |
| Seller read-only | `/inference_offers`, `/inference_health`, `/inference_earnings` | 60/min per key |
| Seller probes | `/inference_reset_health` | 5/min |
| Auth challenges | Wallet-signed minting/listing/revoke (`/inference_key`, `/inference_keys` when wallet-signed, `/inference_seller_key`, `/inference_key_revoke`) | 10/min per IP (shared) |
| Buyer key listing (legacy) | `/inference_key`, `/inference_keys` when `INFERENCE_BUYER_API_KEY` is set | 30/min per IP |

## Uninstall

Remove it with the plugin manager:

```bash
openclaw plugins uninstall openclaw-surplus-intelligence
```

> Uninstall takes the **installed plugin id** (`openclaw-surplus-intelligence`, the bare manifest id), not the scoped `clawhub:` spec used to install. Run `openclaw plugins list` if you're unsure of the id.

A managed Gateway restarts automatically when the uninstall changes plugin source. If your Gateway is unmanaged or auto-reload is disabled, restart it manually:

```bash
openclaw gateway restart
```

## Links

- Website: https://www.surplusintelligence.ai

## Development

This package keeps the CommonJS `module.exports = function register(api)` entrypoint for this release because the current OpenClaw inspector detects command registration from it. A future ESM `definePluginEntry` migration should be handled as a separate package-module change.
