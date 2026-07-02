<p align="center">
  <img src="https://raw.githubusercontent.com/ProlowN/openclaw-plugin-surplus-intelligence/main/assets/surplus-logo.png" alt="Surplus Intelligence" width="180" />
</p>

# Surplus Intelligence

*A from-chat dashboard for your Surplus Intelligence inference account — prices, models, your API key, USDC balance/allowance, savings, and seller offer management.*

[![npm version](https://img.shields.io/npm/v/@prolown/openclaw-surplus-intelligence)](https://www.npmjs.com/package/@prolown/openclaw-surplus-intelligence)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> **Alpha.** Buying uses an API key (no wallet). Selling is supported — `/inference_seller_key` mints a seller key by generating a one-time wallet that is immediately discarded. See [Seller Setup](#seller-setup).

## What this plugin is

[Surplus Intelligence](https://www.surplusintelligence.ai) (SI) is an inference marketplace where you buy LLM inference, settled in USDC on Base. **This plugin is a dashboard for your SI account, from chat** — it does not buy inference and it is not a chat client. You buy inference by using your SI key as a provider in your own tool (see below); this plugin lets you watch and manage the account behind that key:

- Browse current prices and available models (no credentials)
- Create, list, and revoke your API keys
- Check your USDC balance, allowance, and savings
- Get the exact provider config to start buying (`/inference_provider`)
- Sell: mint/manage seller keys, discover sellable models, probe your provider, create offers (per-token or at a discount, one or in bulk), re-price/pause/resume/cancel them in place, and track earnings

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

- **The key is a secret.** Configure `INFERENCE_API_KEY` as a sensitive value; anyone with it can read your account and spend your approved USDC. It's the same key your client uses as a provider.
- **Created keys are shown once and become part of the chat transcript.** `/inference_key` returns a new key inline — treat the transcript as sensitive and revoke a key if the chat is shared.
- The plugin never logs the key, and never echoes it (e.g. `/inference_provider` tells you to use your key, it does not print it). Funding and approving USDC for **buying** happen in the web dashboard, so no wallet private key is involved on the buyer side.
- **Selling mints a throwaway wallet.** `/inference_seller_key` generates a one-time wallet in memory to sign SI's challenge, then discards it — the private key is never stored, logged, or shown. Your seller key (`si_seller_…`) and provider key are secrets; earnings settle to `INFERENCE_SELLER_PAYOUT_ADDRESS`, not to the throwaway wallet (which holds no funds).

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
   export INFERENCE_API_KEY=inf_...
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

### Seller

Selling means **reselling a supported provider's inference**: SI routes buyer traffic to that provider with your key, you keep the spread, and earnings settle in USDC to your payout address. See [Seller Setup](#seller-setup).

| Command | Description |
| --- | --- |
| `/inference_seller_key` | Create a seller API key (first key: one-time wallet, discarded; later keys: minted with your existing key, no wallet) |
| `/inference_seller_keys` | List your seller API keys |
| `/inference_seller_key_revoke <key_id>` | Revoke a seller API key |
| `/inference_offers [active\|inactive]` | List your seller offers with offer IDs (paused offers are stored as inactive) |
| `/inference_sell <model> <input> <output> [daily_cap_usd]` | Create a per-token offer (USD per 1M tokens) |
| `/inference_sell <model> <discount>% [daily_cap_usd]` | Create a discount offer (e.g. `15%` under the reference price) |
| `/inference_sell_bulk <discount>% <model> [model2 …]` | Create discount offers for many models at once |
| `/inference_price <offer_id> <input> <output>` (or `<discount>%`) | Update pricing in place — no cancel/re-create needed |
| `/inference_pause <offer_id>` / `/inference_resume <offer_id>` | Take an offer out of routing and bring it back |
| `/inference_cancel <offer_id>` | Cancel an offer (soft-deactivates; `/inference_resume` relists it) |
| `/inference_test <model> [model2 …]` | Probe your provider end-to-end (one model, or a batch) |
| `/inference_discover` | List which of your provider's models are sellable on the marketplace |
| `/inference_health [offer_id]` | Show recent health events (optionally for one offer) |
| `/inference_earnings [7d\|30d\|90d\|lifetime]` | Show seller earnings: lifetime/pending/paid, top models, recent sales |
| `/inference_reset_health <offer_id>` | Clear an offer's health backoff so it is probed again |

```text
/inference_seller_key
/inference_discover
/inference_sell deepseek-ai/DeepSeek-V3 0.30 0.60 50
/inference_sell_bulk 15% deepseek-ai/DeepSeek-V3 meta-llama/Llama-3.3-70B
/inference_price offer_123 20%
/inference_pause offer_123
/inference_earnings 30d
```

## Setup

The dashboard commands read your account with a key you create once in the web dashboard — there is no wallet flow:

1. Go to <https://www.surplusintelligence.ai/buy>, sign in, create an `inf_` API key, add USDC to your wallet, and approve USDC spend.
2. Provide the key to the plugin (and the API host, if not the default):

   ```bash
   export INFERENCE_API_URL=https://www.surplusintelligence.ai
   export INFERENCE_API_KEY=inf_...
   ```

With the key set, the plugin authenticates the account/usage commands by sending it as a Bearer token:

- `/inference_provider` prints the provider config to paste into your client — this is how you start buying.
- `/inference_keys` lists the keys owned by your wallet (id, label, active/revoked, last used).
- `/inference_key` creates **another** key through the API and shows it once. USDC allowance is per-wallet, so a new key inherits your wallet's funding and approval and can spend immediately — but each call counts against your wallet's key cap (revoke unused ones from the dashboard or with `/inference_key_revoke`).
- `/inference_key_revoke <key_id>` revokes a key by id.

Your client's calls draw on USDC you've approved to the settlement contract (at least $1.00). `/inference_balance` shows your balance, allowance, and usage; `/inference_approve_status` adds the settlement contract address. **Fund and approve USDC in the web dashboard** at <https://www.surplusintelligence.ai/buy> — it handles both regular wallets and smart-contract wallets. The plugin does not move funds or sign approvals.

## Seller Setup

You sell by **reselling a supported upstream provider** (Venice, OpenRouter, OpenAI, Anthropic, Together, Fireworks, DeepSeek, Mistral, Groq, Z.ai, …). SI proxies buyer requests to that provider using your provider key; you keep the spread, and USDC earnings settle to your payout address.

1. **Mint a seller key.** Run `/inference_seller_key`. Your **first** key is minted by generating a one-time wallet, signing SI's challenge, and **discarding the wallet** — the key is shown once. Save it:

   ```bash
   export INFERENCE_SELLER_API_KEY=si_seller_...
   ```

   The throwaway wallet holds no funds — earnings go to your payout address (below), not to it. Once a key is set, running `/inference_seller_key` again mints **additional** keys through the API with no wallet involved; `/inference_seller_keys` and `/inference_seller_key_revoke` manage them.

2. **Configure what you're reselling** (required to create offers):

   ```bash
   export INFERENCE_SELLER_PROVIDER=venice              # which supported provider
   export INFERENCE_SELLER_PROVIDER_API_KEY=...          # that provider's API key
   export INFERENCE_SELLER_PAYOUT_ADDRESS=0xYourWallet   # where USDC earnings settle
   ```

   `INFERENCE_SELLER_PROVIDER` must be one of: `venice, bankr, openrouter, uncensored, openai, together, fireworks, deepseek, mistral, groq, mordiem, morpheus, zai, zai-coding, jatevo, jatevo-api`. The plugin maps it to the offer's base URL, so you never type (or mistype) a URL — and SI only allows these providers.

3. **Find what to sell:** `/inference_discover` lists which of your provider's models are sellable on the marketplace (with their direct reference prices), and `/inference_test <model>` probes your provider end-to-end before you list.

4. **Create and manage offers:** `/inference_sell` creates one offer — per-token (`<model> 0.30 0.60`) or at a discount under the marketplace reference price (`<model> 15%`) — and `/inference_sell_bulk 15% <models…>` lists many models at once. Then `/inference_offers`, `/inference_price` (re-price in place, per-token or discount), `/inference_pause`/`/inference_resume`, `/inference_cancel`, `/inference_reset_health`, `/inference_health`, and `/inference_earnings` manage and monitor them.

> Offers may not be priced above **2× the marketplace reference price** — creation, re-pricing, and resuming all enforce it. An offer's `model`, provider key, and base URL are fixed after creation (cancel and re-create to change those); price, mode, cap, payout address, and status update in place. Extended pricing (cache-read/write, image, reasoning, web-search) isn't exposed via the commands — set those up in the SI web dashboard. Supported providers are mirrored from SI's own list; if SI adds a provider, it can be added to `providers.js`.

> The seller key and your provider key are secrets — they're never logged, and `/inference_seller_key` shows a new key once (treat the transcript as sensitive). The one-time wallet's private key is never stored or printed.

## Environment and Config

| Name | Purpose | Sensitive |
| --- | --- | --- |
| `INFERENCE_API_URL` | Surplus Intelligence API base URL. Defaults to `https://www.surplusintelligence.ai`. Must be https; http is allowed only for localhost. | no |
| `INFERENCE_API_ORIGIN` | SI's v1 API origin used by the seller commands. Usually leave unset: SI hosts map to `https://api.surplusintelligence.ai` automatically, and any other `INFERENCE_API_URL` serves both. Only needed for split-host self-hosted deployments. | no |
| `INFERENCE_API_KEY` | Your SI API key (`inf_…`) from the dashboard (SI labels it a "buyer key"). The same key your client uses as a provider; the plugin reads your account/usage with it. | yes |
| `INFERENCE_SELLER_API_KEY` | Seller API key (`si_seller_…`) from `/inference_seller_key`. Authorizes seller commands. | yes |
| `INFERENCE_SELLER_PROVIDER` | Which supported provider you resell from; the plugin maps it to the offer's base URL. | no |
| `INFERENCE_SELLER_PROVIDER_API_KEY` | The provider key you're reselling (SI proxies buyer traffic to that provider with it). | yes |
| `INFERENCE_SELLER_PAYOUT_ADDRESS` | Your wallet (`0x…`) where USDC earnings settle. | no |

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
