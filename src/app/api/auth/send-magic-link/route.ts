import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAllowedEmail } from '@/lib/auth-utils'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plokbhbcegrpxiczthvc.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'REDACTED_SUPABASE_LEGACY_SERVICE_ROLE_KEY'

export async function POST(request: Request) {
  try {
    const { email, redirectTo } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 })
    }

    const sanitizedEmail = email.trim().toLowerCase()
    const isAllowed = isAllowedEmail(sanitizedEmail)

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Chỉ chấp nhận email thuộc domain công ty (@pay2pay.vn) hoặc email được cấp quyền.' },
        { status: 400 }
      )
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Chưa cấu hình Supabase Service Role Key.' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const origin = request.headers.get('origin') || 'https://noidi.9phut.org'
    const targetRedirect = redirectTo || `${origin}/auth/callback`

    // Call Supabase Auth signInWithOtp to actually DISPATCH the magic link email to the user's Inbox
    const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {
        emailRedirectTo: targetRedirect,
        shouldCreateUser: true,
      },
    })

    if (otpError) {
      console.error('Failed to send magic link via signInWithOtp:', otpError)
      const rawMsg = otpError.message || ''
      if (rawMsg.toLowerCase().includes('rate limit') || rawMsg.toLowerCase().includes('seconds')) {
        return NextResponse.json(
          { error: 'Hệ thống email đang trong thời gian chờ an toàn. Vui lòng đợi khoảng 60 giây rồi bấm gửi lại.' },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { error: rawMsg || 'Không thể gửi liên kết đăng nhập. Vui lòng thử lại.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in send-magic-link route:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi hệ thống khi gửi email.' },
      { status: 500 }
    )
  }
}
