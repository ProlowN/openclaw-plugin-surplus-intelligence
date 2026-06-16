// Seller support is not yet implemented.
//
// Selling requires a seller API key (si_seller_*), and the Surplus Intelligence
// web dashboard does not currently expose a way to create one — the only path
// is a wallet-signature (SIWE) flow, which this plugin deliberately no longer
// performs. The intended model, once the dashboard can issue seller keys, is:
// a seller key + one or more provider (inference) API keys + a payout address.
// Until then these commands are registered for discoverability but return a
// not-implemented notice rather than calling the API.
const SELLER_NOT_IMPLEMENTED =
  'Seller support is not yet implemented. The Surplus Intelligence dashboard cannot issue a seller API key yet, so the plugin cannot act as a seller. Once seller keys are available, this will let you manage offers, pricing, health, and earnings from chat.'

async function notImplemented() {
  return { text: SELLER_NOT_IMPLEMENTED }
}

function registerSellerCommands(api) {
  const sellerCommands = [
    { name: 'inference_offers', description: 'List your seller offers (not yet implemented)', acceptsArgs: false },
    { name: 'inference_sell', description: 'Create a seller offer (not yet implemented)', acceptsArgs: true },
    { name: 'inference_price', description: 'Update offer pricing (not yet implemented)', acceptsArgs: true },
    { name: 'inference_cancel', description: 'Cancel a seller offer (not yet implemented)', acceptsArgs: true },
    { name: 'inference_health', description: 'Show recent health events (not yet implemented)', acceptsArgs: false },
    { name: 'inference_earnings', description: 'Show seller earnings (not yet implemented)', acceptsArgs: false },
    { name: 'inference_reset_health', description: 'Re-test an offer and clear its health backoff (not yet implemented)', acceptsArgs: true },
    { name: 'inference_seller_key', description: 'Create a seller API key (not yet implemented)', acceptsArgs: false },
  ]

  for (const cmd of sellerCommands) {
    api.registerCommand({
      name: cmd.name,
      description: cmd.description,
      acceptsArgs: cmd.acceptsArgs,
      requireAuth: true,
      handler: notImplemented,
    })
  }
}

module.exports = {
  notImplemented,
  registerSellerCommands,
}
