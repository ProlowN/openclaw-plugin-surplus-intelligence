<p align="center">
  <img src="https://raw.githubusercontent.com/ProlowN/openclaw-plugin-surplus-intelligence/main/assets/surplus-logo.png" alt="Surplus Intelligence" width="180" />
</p>

# Surplus Intelligence

*A from-chat usage dashboard for your Surplus Intelligence inference account — prices, models, your API key, USDC balance/allowance, and savings.*

[![npm version](https://img.shields.io/npm/v/@prolown/openclaw-surplus-intelligence)](https://www.npmjs.com/package/@prolown/openclaw-surplus-intelligence)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> **Alpha.** Uses a buyer API key (no wallet). **Seller commands are not yet implemented** — see [Seller](#seller-not-yet-implemented).

## What this plugin is

[Surplus Intelligence](https://www.surplusintelligence.ai) (SI) is an inference marketplace where you buy LLM inference, settled in USDC on Base. **This plugin is a dashboard for your SI account, from chat** — it does not buy inference and it is not a chat client. You buy inference by using your SI key as a provider in your own tool (see below); this plugin lets you watch and manage the account behind that key:

- Browse current prices and available models (no credentials)
- Create, list, and revoke your API keys
- Check your USDC balance, allowance, and savings
- Get the exact provider config to start buying (`/inference_provider`)

## How you actually buy inference

You don't buy through this plugin — you point your client at SI and your normal model calls become buys:

1. **Get a key + fund it.** In the dashboard at <https://www.surplusintelligence.ai/buy>, create an `inf_` API key, send USDC to your wallet on Base, and approve USDC spend (a one-time, per-wallet allowance).
2. **Use the key as a provider.** Configure SI as an OpenAI-compatible provider in your client (opencode, OpenClaw, Cursor, etc.). Run **`/inference_provider`** to print the exact values:
   - **Base URL:** `<INFERENCE_API_URL>/api/inference/v1`
   - **API key:** your `inf_` key
   - **Models:** ids from `/inference_models`
3. **Make calls.** Every model call your client sends is routed to the cheapest healthy seller, metered, and settled in USDC from your approved allowance.

This plugin is the dashboard around steps 1–3 — it doesn't route the gateway's own model calls. (Built-in provider auto-wiring is planned for a future release.)

## Security

This plugin reads your SI account with your API key and can surface keys into the chat — read this first:

- **The key is a secret.** Configure `INFERENCE_BUYER_API_KEY` as a sensitive value; anyone with it can read your account and spend your approved USDC. It's the same key your client uses as a provider.
- **Created keys are shown once and become part of the chat transcript.** `/inference_key` returns a new key inline — treat the transcript as sensitive and revoke a key if the chat is shared.
- The plugin never logs the key, and never echoes it (e.g. `/inference_provider` tells you to use your key, it does not print it). Funding and approving USDC happen in the web dashboard, so no wallet private key ever touches the plugin.

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
3. Create an `inf_` key in the dashboard at <https://www.surplusintelligence.ai/buy>, then set it (and, if not the default host, `INFERENCE_API_URL`):

   ```bash
   export INFERENCE_API_URL=https://www.surplusintelligence.ai
   export INFERENCE_BUYER_API_KEY=inf_...
   ```
4. Run `/inference_provider` for the provider config, and `/inference_balance` to confirm you're funded and approved. See **[Setup](#setup)** for the full flow.

## Commands

All commands except `/inference_prices` and `/inference_models` require an authorized sender (OpenClaw `requireAuth`), so unauthorized chat participants cannot read account data or manage keys.

### Public (no auth)

| Command | Description |
| --- | --- |
| `/inference_prices [model]` | Show current inference prices (orderbook if a model is given) |
| `/inference_models` | List available models |

### Account & usage

| Command | Description |
| --- | --- |
| `/inference_provider` | Show how to use your key as an OpenAI-compatible provider (base URL, key, models) |
| `/inference_key` | Create another API key (shown once; the key enters the chat transcript — treat it as sensitive) |
| `/inference_keys` | List your API keys (key prefix + id, label, active/revoked status, last used) |
| `/inference_key_revoke <key_id>` | Revoke an API key |
| `/inference_balance` | Show your balance, USDC allowance, and usage |
| `/inference_approve_status` | Show funding status: USDC balance, allowance, and the settlement contract |
| `/inference_savings` | Show how much you've saved vs direct pricing |

Example invocations:

```text
/inference_prices openai/gpt-4o-mini
/inference_provider
/inference_keys
/inference_key_revoke key_123
```

### Seller (not yet implemented)

Seller commands are registered but **not yet implemented** — each returns a notice instead of acting. Selling needs a seller API key (`si_seller_…`), and the Surplus Intelligence dashboard cannot issue one yet. The intended model, once it can, is: a seller key + one or more provider (inference) API keys + a payout address.

`/inference_offers`, `/inference_sell`, `/inference_price`, `/inference_cancel`, `/inference_health`, `/inference_earnings`, `/inference_reset_health`, and `/inference_seller_key` currently return a "not yet implemented" message.

## Setup

The dashboard commands read your account with a key you create once in the web dashboard — there is no wallet flow:

1. Go to <https://www.surplusintelligence.ai/buy>, sign in, create an `inf_` API key, add USDC to your wallet, and approve USDC spend.
2. Provide the key to the plugin (and the API host, if not the default):

   ```bash
   export INFERENCE_API_URL=https://www.surplusintelligence.ai
   export INFERENCE_BUYER_API_KEY=inf_...
   ```

With the key set, the plugin authenticates the account/usage commands by sending it as a Bearer token:

- `/inference_provider` prints the provider config to paste into your client — this is how you start buying.
- `/inference_keys` lists the keys owned by your wallet (id, label, active/revoked, last used).
- `/inference_key` creates **another** key through the API and shows it once. USDC allowance is per-wallet, so a new key inherits your wallet's funding and approval and can spend immediately — but each call counts against your wallet's key cap (revoke unused ones from the dashboard or with `/inference_key_revoke`).
- `/inference_key_revoke <key_id>` revokes a key by id.

Your client's calls draw on USDC you've approved to the settlement contract (at least $1.00). `/inference_balance` shows your balance, allowance, and usage; `/inference_approve_status` adds the settlement contract address. **Fund and approve USDC in the web dashboard** at <https://www.surplusintelligence.ai/buy> — it handles both regular wallets and smart-contract wallets. The plugin does not move funds or sign approvals.

## Seller (not yet implemented)

There is currently no way to obtain a seller API key through the Surplus Intelligence web dashboard, and this plugin no longer performs the wallet-signature flow that previously minted one. As a result, seller features are **not implemented** in this release: the seller commands above are registered for discoverability but return a not-implemented notice. Seller support is planned once the dashboard can issue seller keys.

## Environment and Config

| Name | Purpose | Sensitive |
| --- | --- | --- |
| `INFERENCE_API_URL` | Surplus Intelligence API base URL. Defaults to `https://www.surplusintelligence.ai`. Must be https; http is allowed only for localhost. | no |
| `INFERENCE_BUYER_API_KEY` | Your SI API key (`inf_…`) from the dashboard. The same key your client uses as a provider; the plugin reads your account/usage with it. | yes |

Values set in the plugin config take precedence over environment variables of the same name.

## API Rate Limits

The backend enforces rate limits and returns HTTP 429 with `Retry-After` and `X-RateLimit-Reset` headers when a limit is exceeded; the plugin adds no separate local throttle, so honor `Retry-After`. Limits are enforced server-side and **subject to change** — see the Surplus Intelligence API docs for authoritative values.

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
