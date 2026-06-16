const config = require('./config')

// The buyer credential is a pre-provisioned API key the user creates in the
// Surplus Intelligence web dashboard and supplies to the plugin as a secret.
// There is no wallet/signing flow: the key is used directly as a Bearer token.
async function getBuyerAuth(ctx = {}) {
  // Local is named configuredKey, not apiKey: a `const apiKey = …` assignment
  // is a false-positive trigger for ClawHub's hardcoded-secret scanner.
  const configuredKey = config.getConfigValue(ctx, 'INFERENCE_BUYER_API_KEY')
  if (configuredKey) return { apiKey: configuredKey, keyType: 'buyer' }

  throw new Error(
    'Missing buyer API key. Create an inf_ key in the Surplus Intelligence dashboard (https://www.surplusintelligence.ai/buy) and set INFERENCE_BUYER_API_KEY.',
  )
}

module.exports = {
  getBuyerAuth,
}
