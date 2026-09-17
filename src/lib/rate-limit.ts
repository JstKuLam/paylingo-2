type RateLimitBucket = { count: number; resetAt: number }

const rateLimitGlobal = globalThis as typeof globalThis & {
  __payLingoRateLimits?: Map<string, RateLimitBucket>
  __payLingoLastSweep?: number
}

const buckets = rateLimitGlobal.__payLingoRateLimits ?? new Map<string, RateLimitBucket>()
rateLimitGlobal.__payLingoRateLimits = buckets

export function getRequestIp(request: Request): string {
  const forwarded =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')
  const rawIp = forwarded?.split(',')[0]?.trim()
  if (!rawIp) return 'unknown'
  return rawIp.slice(0, 45)
}

export function checkRateLimit(options: { key: string; limit: number; windowMs: number }) {
  const safeLimit = Number.isSafeInteger(options.limit) && options.limit > 0 ? options.limit : 10
  const safeWindowMs = Number.isSafeInteger(options.windowMs) && options.windowMs > 0 ? options.windowMs : 60_000
  const now = Date.now()
  const current = buckets.get(options.key)

  const lastSweep = rateLimitGlobal.__payLingoLastSweep || 0
  if (buckets.size > 500 && (now - lastSweep > 5_000 || buckets.size > 1000)) {
    rateLimitGlobal.__payLingoLastSweep = now
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) {
        buckets.delete(k)
      }
    }
    if (buckets.size > 1000) {
      const excess = buckets.size - 1000
      let pruned = 0
      for (const k of buckets.keys()) {
        if (pruned >= excess) break
        buckets.delete(k)
        pruned++
      }
    }
  }

  if (!current || current.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + safeWindowMs })
    return { allowed: true, remaining: Math.max(0, safeLimit - 1), retryAfterSeconds: 0 }
  }

  if (current.count >= safeLimit) {
    const diff = Math.ceil((current.resetAt - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Number.isFinite(diff) && diff > 0 ? diff : 1,
    }
  }

  current.count += 1
  // Move key to the end of Map to maintain LRU eviction ordering
  buckets.delete(options.key)
  buckets.set(options.key, current)

  return { allowed: true, remaining: safeLimit - current.count, retryAfterSeconds: 0 }
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  const safeRetryAfter = Number.isSafeInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds : 1
  return Response.json(
    { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(safeRetryAfter),
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
