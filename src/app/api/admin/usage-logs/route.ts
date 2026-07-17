import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkAdminSession } from '@/lib/admin-auth'

export const runtime = 'edge'

export async function GET() {
  try {
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    const adminSupa = createAdminClient()
    
    const { data: logs, error } = await adminSupa
      .from('ai_usage_logs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(logs || [])
  } catch (error: unknown) {
    console.error('Unable to load AI usage logs:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
