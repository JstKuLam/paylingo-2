import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { data: { user }, error: authError } = await getAuthenticatedUser(request)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ' },
        { status: 401 }
      )
    }

    const isAzure = user.app_metadata?.provider === 'azure' ||
                    user.identities?.some(id => id.provider === 'azure')
    const email = user.email

    if (!email) {
      return NextResponse.json(
        { error: 'Không tìm thấy thông tin email đăng nhập' },
        { status: 401 }
      )
    }

    if (isAzure) {
      const isAllowedDomain = email.toLowerCase().endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'
      if (!isAllowedDomain) {
        return NextResponse.json(
          { error: 'Chỉ chấp nhận tài khoản email công ty (@pay2pay.vn).' },
          { status: 403 }
        )
      }
    }

    const username = user.user_metadata?.username ||
                     user.user_metadata?.full_name ||
                     user.user_metadata?.name ||
                     email.split('@')[0]

    if (!username) {
      return NextResponse.json(
        { error: 'Không thể xác định thông tin người dùng' },
        { status: 401 }
      )
    }

    // 3. Verify SONIOX_API_KEY env is set
    if (!process.env.SONIOX_API_KEY) {
      return NextResponse.json(
        { error: 'Chưa cấu hình Soniox API Key trên máy chủ' },
        { status: 500 }
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
        expires_in_seconds: 300, // Valid for 5 minutes
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Soniox temporary key request failed:', response.status, errText)
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói đang tạm thời không khả dụng' },
        { status: 502 }
      )
    }

    const tempKeyResponse: { api_key?: string; expires_at?: string } = await response.json()

    if (!tempKeyResponse.api_key) {
      console.error('Soniox temporary key response did not include api_key')
      return NextResponse.json(
        { error: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      api_key: tempKeyResponse.api_key,
      expires_at: tempKeyResponse.expires_at,
    })
  } catch (error: unknown) {
    console.error('Unable to mint Soniox temporary key:', error)
    return NextResponse.json(
      { error: 'Không thể tạo khóa Soniox tạm thời' },
      { status: 500 }
    )
  }
}
