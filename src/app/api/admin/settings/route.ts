import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'

export const runtime = 'edge'

const MASKED_API_KEY = '••••••••••••••••'
const apiSettingsSchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  endpoint: z.string().trim().max(500).optional().default(''),
  model: z.string().trim().min(1).max(200),
  api_key: z.string().trim().max(1_000),
}).superRefine((settings, context) => {
  if (settings.provider === 'openai' && settings.endpoint) {
    try {
      const endpoint = new URL(settings.endpoint)
      if (endpoint.protocol !== 'https:') {
        context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Endpoint phải dùng HTTPS' })
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['endpoint'], message: 'Endpoint không hợp lệ' })
    }
  }
})

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const adminSupa = createAdminClient()
    const { data: settings, error } = await adminSupa
      .from('api_settings')
      .select('*')
      .eq('key', 'current')
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 is code for "no rows returned"
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Mask the API Key for security
    const maskedKey = settings?.api_key ? MASKED_API_KEY : ''

    return NextResponse.json({
      provider: settings?.provider || 'gemini',
      endpoint: settings?.endpoint || '',
      model: settings?.model || 'gemini-2.5-flash',
      hasApiKey: !!settings?.api_key,
      api_key: maskedKey
    })
  } catch (error: unknown) {
    console.error('Unable to load API settings:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const parsedBody = apiSettingsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || 'Cấu hình API không hợp lệ' },
        { status: 400 }
      )
    }
    const { provider, endpoint, model, api_key } = parsedBody.data

    const adminSupa = createAdminClient()
    
    // Check if row already exists
    const { data: existing } = await adminSupa
      .from('api_settings')
      .select('*')
      .eq('key', 'current')
      .single()

    let keyToSave = api_key
    if (api_key === MASKED_API_KEY && existing) {
      keyToSave = existing.api_key // Keep existing key
    } else if (!api_key) {
      return NextResponse.json({ error: 'API Key không được để trống' }, { status: 400 })
    }

    const { error: upsertError } = await adminSupa
      .from('api_settings')
      .upsert({
        key: 'current',
        provider,
        endpoint: provider === 'openai' ? endpoint : null,
        model,
        api_key: keyToSave,
        updated_at: new Date().toISOString()
      })

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Unable to save API settings:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
