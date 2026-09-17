import { NextResponse } from 'next/server'
import { getD1 } from '@/lib/d1-client'
import { checkAdminSession } from '@/lib/admin-auth'
import { z } from 'zod'
import { getSafeAiEndpoint } from '@/lib/ai-security'

export const runtime = 'edge'


const MASKED_API_KEY = '••••••••••••••••'
const apiSettingsSchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  endpoint: z.string().trim().max(500).optional().default(''),
  model: z.string().trim().min(1).max(200),
  api_key: z.string().trim().max(1_000),
}).superRefine((settings, context) => {
  if (settings.provider === 'openai' && settings.endpoint) {
    if (!getSafeAiEndpoint(settings.endpoint)) {
      context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Endpoint chưa nằm trong AI_ALLOWED_HOSTS' })
    }
  }
})

export async function GET() {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403, headers: noStoreHeader })
    }

    const db = getD1()
    const settings = await db.prepare('SELECT * FROM api_settings WHERE key = ?')
      .bind('current')
      .first<{ key: string; provider?: string; endpoint?: string; model?: string; api_key?: string }>()

    const maskedKey = settings?.api_key ? MASKED_API_KEY : ''

    return NextResponse.json({
      provider: settings?.provider || 'gemini',
      endpoint: settings?.endpoint || '',
      model: settings?.model || 'gemini-2.5-flash',
      hasApiKey: !!settings?.api_key,
      api_key: maskedKey
    }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to load API settings:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      {
        status: 500,
        headers: noStoreHeader,
      }
    )
  }
}

export async function POST(req: Request) {
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403, headers: noStoreHeader })
    }

    const parsedBody = apiSettingsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || 'Cấu hình API không hợp lệ' },
        { status: 400, headers: noStoreHeader }
      )
    }
    const { provider, endpoint, model, api_key } = parsedBody.data

    const db = getD1()
    const existing = await db.prepare('SELECT * FROM api_settings WHERE key = ?')
      .bind('current')
      .first<{ api_key?: string }>()

    let keyToSave = api_key
    if (api_key === MASKED_API_KEY) {
      if (!existing || !existing.api_key) {
        return NextResponse.json({ error: 'Chưa có API Key nào được lưu để tái sử dụng' }, { status: 400, headers: noStoreHeader })
      }
      keyToSave = existing.api_key
    } else if (!api_key || !api_key.trim()) {
      return NextResponse.json({ error: 'API Key không được để trống' }, { status: 400, headers: noStoreHeader })
    }

    const res = await db.prepare(`
      INSERT INTO api_settings (key, provider, endpoint, model, api_key, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        provider = excluded.provider,
        endpoint = excluded.endpoint,
        model = excluded.model,
        api_key = excluded.api_key,
        updated_at = excluded.updated_at
    `)
      .bind('current', provider, provider === 'openai' ? endpoint : null, model, keyToSave)
      .run()

    if (!res.success) {
      return NextResponse.json({ error: 'Không thể lưu cài đặt' }, { status: 500, headers: noStoreHeader })
    }

    return NextResponse.json({ success: true }, {
      headers: noStoreHeader,
    })
  } catch (error: unknown) {
    console.error('Unable to save API settings:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}
