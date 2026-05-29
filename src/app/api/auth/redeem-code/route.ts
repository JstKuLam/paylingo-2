import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Mã truy cập không hợp lệ' },
        { status: 400 }
      )
    }

    // Standard brute-force rate limit delay
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    // Initialize admin client to query access_codes (which requires bypass/admin role)
    const adminClient = createAdminClient()

    // Query the code
    const { data: codeData, error: dbError } = await adminClient
      .from('access_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (dbError || !codeData) {
      await delay(1000) // Delay 1s to prevent brute-forcing
      return NextResponse.json(
        { error: 'Mã truy cập không chính xác' },
        { status: 401 }
      )
    }

    // Check expiration
    const expiresAt = new Date(codeData.expires_at)
    if (expiresAt < new Date()) {
      await delay(1000)
      return NextResponse.json(
        { error: 'Mã truy cập đã hết hạn sử dụng' },
        { status: 401 }
      )
    }

    // Check minutes limit
    if (codeData.used_minutes >= codeData.max_minutes) {
      await delay(1000)
      return NextResponse.json(
        { error: 'Mã truy cập đã dùng hết giới hạn số phút' },
        { status: 401 }
      )
    }

    // Return the validated access_code_id to allow client-side anonymous sign-in
    return NextResponse.json({
      success: true,
      access_code_id: codeData.id,
      label: codeData.label,
      expires_at: codeData.expires_at,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi hệ thống: ' + error.message },
      { status: 500 }
    )
  }
}
