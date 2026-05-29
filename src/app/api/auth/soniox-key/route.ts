import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user session
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' },
        { status: 401 }
      )
    }

    // 2. Double check username presence
    const username = user.user_metadata?.username
    if (!username) {
      return NextResponse.json(
        { error: 'Tài khoản chưa có tên người dùng hợp lệ' },
        { status: 403 }
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
      throw new Error(`Soniox API returned status ${response.status}: ${errText}`)
    }

    const tempKeyResponse = await response.json()

    return NextResponse.json({
      success: true,
      api_key: tempKeyResponse.api_key,
      expires_at: tempKeyResponse.expires_at,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Không thể tạo khóa Soniox tạm thời: ' + error.message },
      { status: 500 }
    )
  }
}
