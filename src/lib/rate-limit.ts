type RateLimitBucket = { count: number; resetAt: number }

const rateLimitGlobal = globalThis as typeof globalThis & {
  __payLingoRateLimits?: Map<string, RateLimitBucket>
}

const buckets = rateLimitGlobal.__payLingoRateLimits ?? new Map<string, RateLimitBucket>()
rateLimitGlobal.__payLingoRateLimits = buckets

export function getRequestIp(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

export function checkRateLimit(options: { key: string; limit: number; windowMs: number }) {
  const now = Date.now()
  const current = buckets.get(options.key)

  if (buckets.size > 500) {
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) {
        buckets.delete(k)
      }
    }
  }

  if (!current || current.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs })
    return { allowed: true, remaining: Math.max(0, options.limit - 1), retryAfterSeconds: 0 }
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return { allowed: true, remaining: options.limit - current.count, retryAfterSeconds: 0 }
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  )
}
