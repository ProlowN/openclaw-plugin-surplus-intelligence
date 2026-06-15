function formatApiError(data) {
  if (!data) return ''

  if (typeof data === 'string') return data

  const error = data.error ?? data
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const message = error.message || error.detail || error.code || 'Unknown API error'
    const type = error.type || error.code
    return type ? `${message} (${type})` : message
  }

  if (typeof data.message === 'string') return data.message

  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

async function errorDetailFromResponse(resp) {
  if (typeof resp.text === 'function') {
    try {
      const text = await resp.text()
      if (!text) return ''
      try {
        return formatApiError(JSON.parse(text))
      } catch {
        return formatApiError(text)
      }
    } catch {}
  }

  try {
    const data = await resp.json()
    return formatApiError(data)
  } catch {}

  return ''
}

module.exports = {
  formatApiError,
  errorDetailFromResponse,
}
