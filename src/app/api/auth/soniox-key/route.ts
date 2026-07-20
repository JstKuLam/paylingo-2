import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getAuthenticatedUser } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await getAuthenticatedUser(request)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const email = user.email?.trim().toLowerCase()
    const isAllowedDomain = email && (email.endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development')

    if (!isAllowedDomain) {
      return NextResponse.json(
        { error: 'Chỉ chấp nhận tài khoản công ty (@pay2pay.vn).' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const username = user.user_metadata?.username ||
                     user.user_metadata?.full_name ||
                     user.user_metadata?.name ||
                     email.split('@')[0]

    if (!username) {
      return NextResponse.json(
        { error: 'Không thể xác định thông tin người dùng' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // 3. Verify SONIOX_API_KEY env is set
    if (!process.env.SONIOX_API_KEY) {
      return NextResponse.json(
        { error: 'Chưa cấu hình Soniox API Key trên máy chủ' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // 4. Mint temporary key via standard REST API fetch (Edge runtime compatible)
    const response = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SONIOX_API_KEY}`
      },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 60,
        single_use: true,
        max_session_duration_seconds: 7200,
        client_reference_id: `paylingo:${user.id}`,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error('Soniox temporary key request failed:', response.status)
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói đang tạm thời không khả dụng' },
        {
          status: response.status === 429 ? 429 : 502,
          headers: { 'Cache-Control': 'no-store' },
        }
      )
    }

    const tempKeyResponse: { api_key?: string; expires_at?: string } = await response.json()

    if (!tempKeyResponse.api_key) {
      console.error('Soniox temporary key response did not include api_key')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json({
      success: true,
      api_key: tempKeyResponse.api_key,
      expires_at: tempKeyResponse.expires_at,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Vary': 'Authorization',
      },
    })
  } catch (error: unknown) {
    console.error('Unable to mint Soniox temporary key:', error)
    return NextResponse.json(
      { error: 'Không thể tạo khóa Soniox tạm thời' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await getAuthenticatedUser(request)
    const email = user?.email?.trim().toLowerCase()
    const isAzure = user?.app_metadata?.provider === 'azure' ||
      user?.identities?.some((identity) => identity.provider === 'azure')

    if (authError || !user || !isAzure || !email?.endsWith('@pay2pay.vn')) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const admin = createAdminClient()
    const { error: sessionsError } = await admin
      .from('sessions')
      .delete()
      .eq('owner_id', user.id)
    if (sessionsError) throw sessionsError

    const { error: foldersError } = await admin
      .from('folders')
      .delete()
      .eq('owner_id', user.id)
    if (foldersError) throw foldersError

    const username = user.user_metadata?.username?.toString().trim()
    if (username) {
      const { error: usageError } = await admin
        .from('ai_usage_logs')
        .delete()
        .eq('username', username)
      if (usageError) throw usageError
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteUserError) throw deleteUserError

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
          'Vary': 'Authorization',
        },
      },
    )
  } catch (error: unknown) {
    console.error('Unable to delete PayLingo account:', error)
    return NextResponse.json(
      { error: 'Không thể xóa tài khoản và dữ liệu. Vui lòng thử lại.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
