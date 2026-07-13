import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET() {
  return NextResponse.json({
    minVersionAndroid: '1.0.0',
    latestVersionAndroid: '3.0.0',
    updateUrlAndroid: 'https://noidi.9phut.org/downloads/paylingo.apk',
    minVersionIos: '1.0.0',
    latestVersionIos: '3.0.0',
    updateUrlIos: 'https://testflight.apple.com/join/mock'
  })
}
