const DEFAULT_AI_HOSTS = ['api.openai.com']

export function getAllowedAiHosts(): Set<string> {
  const configured = (process.env.AI_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...DEFAULT_AI_HOSTS, ...configured])
}

export function getSafeAiEndpoint(value: string | null | undefined): string | null {
  try {
    const endpoint = new URL((value || 'https://api.openai.com/v1').trim())
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      (endpoint.port && endpoint.port !== '443') ||
      !getAllowedAiHosts().has(endpoint.hostname.toLowerCase())
    ) {
      return null
    }
    return endpoint.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}
