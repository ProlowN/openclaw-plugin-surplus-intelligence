// Supported upstream providers, mirrored from Surplus Intelligence's own
// provider-options.ts. A seller offer's `seller_base_url` must be one of these —
// SI rejects anything off its provider allowlist. The plugin maps a provider id
// to the exact base URL so the user supplies a short id (and the matching key)
// instead of typing — or mistyping — a URL. Keep this in sync with SI's list.
const PROVIDERS = {
  venice: { name: 'Venice AI', baseUrl: 'https://api.venice.ai/api/v1' },
  bankr: { name: 'Bankr', baseUrl: 'https://llm.bankr.bot/v1' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  uncensored: { name: 'Uncensored AI', baseUrl: 'https://api.uncensored.com/api/v1' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  together: { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  fireworks: { name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  mistral: { name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  mordiem: { name: 'Mordiem', baseUrl: 'https://api.mordiem.com/api/v1' },
  morpheus: { name: 'Morpheus', baseUrl: 'https://api.mor.org/api/v1' },
  zai: { name: 'Z.ai', baseUrl: 'https://api.z.ai/api/paas/v4' },
  'zai-coding': { name: 'Z.ai Coding', baseUrl: 'https://api.z.ai/api/coding/paas/v4' },
  jatevo: { name: 'Jatevo', baseUrl: 'https://jatevo.ai/v1' },
  'jatevo-api': { name: 'Jatevo API Gateway', baseUrl: 'https://api.jatevo.ai/v1' },
}

function providerIds() {
  return Object.keys(PROVIDERS)
}

function resolveProvider(id) {
  if (!id) return null
  return PROVIDERS[String(id).trim().toLowerCase()] || null
}

module.exports = {
  PROVIDERS,
  providerIds,
  resolveProvider,
}
