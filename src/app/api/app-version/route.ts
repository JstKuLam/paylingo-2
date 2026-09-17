import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'

const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }

function parseSemver(version: string): [number, number, number] {
  const parts = version.trim().replace(/^v/i, '').split('.').map((part) => parseInt(part, 10))
  return [
    Number.isSafeInteger(parts[0]) ? Math.max(0, parts[0]) : 0,
    Number.isSafeInteger(parts[1]) ? Math.max(0, parts[1]) : 0,
    Number.isSafeInteger(parts[2]) ? Math.max(0, parts[2]) : 0,
  ]
}

function compareSemver(current: string, target: string): number {
  const [ca, cb, cc] = parseSemver(current)
  const [ta, tb, tc] = parseSemver(target)
  if (ca !== ta) return ca - ta
  if (cb !== tb) return cb - tb
  return cc - tc
}

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    key: `app-version:${getRequestIp(request)}`,
    limit: 60,
    windowMs: 60_000,
  })
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds)

  const config = {
    minVersionAndroid: '1.0.0',
    latestVersionAndroid: '3.0.0',
    updateUrlAndroid: 'https://noidi.9phut.org/downloads/paylingo.apk',
    minVersionIos: '1.0.0',
    latestVersionIos: '3.0.0',
    updateUrlIos: 'https://testflight.apple.com/join/mock',
  }

  const { searchParams } = new URL(request.url)
  const platform = searchParams.get('platform')?.toLowerCase()?.trim()
  const version = searchParams.get('version')?.trim()

  if (platform && platform !== 'android' && platform !== 'ios') {
    return NextResponse.json({ error: 'Nền tảng không hợp lệ' }, { status: 400, headers: noStoreHeader })
  }

  if (version && (version.length > 32 || !/^[0-9a-zA-Z.-]+$/.test(version))) {
    return NextResponse.json({ error: 'Phiên bản không hợp lệ' }, { status: 400, headers: noStoreHeader })
  }

  if (platform && version) {
    const isAndroid = platform === 'android'
    const minVersion = isAndroid ? config.minVersionAndroid : config.minVersionIos
    const latestVersion = isAndroid ? config.latestVersionAndroid : config.latestVersionIos
    const updateUrl = isAndroid ? config.updateUrlAndroid : config.updateUrlIos

    const forceUpdate = compareSemver(version, minVersion) < 0
    const needsUpdate = compareSemver(version, latestVersion) < 0

    return NextResponse.json({
      ...config,
      platform,
      clientVersion: version,
      forceUpdate,
      needsUpdate,
      updateUrl,
    }, {
      headers: noStoreHeader,
    })
  }

  return NextResponse.json(config, {
    headers: noStoreHeader,
  })
}
