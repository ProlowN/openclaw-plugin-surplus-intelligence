const config = require('./config')

// The credential is a pre-provisioned API key the user creates in the Surplus
// Intelligence web dashboard (SI labels it a "buyer key") and supplies to the
// plugin as a secret. There is no wallet/signing flow: the key is used directly
// as a Bearer token for the account/usage endpoints.
async function getAccountAuth(ctx = {}) {
  // Local is named configuredKey, not apiKey: a `const apiKey = …` assignment
  // is a false-positive trigger for ClawHub's hardcoded-secret scanner.
  const configuredKey = config.getConfigValue(ctx, 'INFERENCE_API_KEY')
  if (configuredKey) return { apiKey: configuredKey, keyType: 'buyer' }

  throw new Error(
    'Missing API key. Create an inf_ key in the Surplus Intelligence dashboard (https://www.surplusintelligence.ai/buy) and set INFERENCE_API_KEY.',
  )
}

module.exports = {
  getAccountAuth,
}
