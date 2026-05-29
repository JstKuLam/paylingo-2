import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'edge'

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
    const maskedKey = settings?.api_key ? '••••••••••••••••' : ''

    return NextResponse.json({
      provider: settings?.provider || 'gemini',
      endpoint: settings?.endpoint || '',
      model: settings?.model || 'gemini-2.5-flash',
      hasApiKey: !!settings?.api_key,
      api_key: maskedKey
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const body = await req.json()
    const { provider, endpoint, model, api_key } = body

    if (!provider || !model) {
      return NextResponse.json({ error: 'Thiếu thông tin provider hoặc model' }, { status: 400 })
    }

    const adminSupa = createAdminClient()
    
    // Check if row already exists
    const { data: existing } = await adminSupa
      .from('api_settings')
      .select('*')
      .eq('key', 'current')
      .single()

    let keyToSave = api_key
    if (api_key === '••••••••••••••••' && existing) {
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Lỗi hệ thống' }, { status: 500 })
  }
}
