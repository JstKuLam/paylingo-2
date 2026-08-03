import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAllowedEmail } from '@/lib/auth-utils'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://plokbhbcegrpxiczthvc.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

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

    const requestLimit = checkRateLimit({
      key: `magic-link:${getRequestIp(request)}:${sanitizedEmail}`,
      limit: 3,
      windowMs: 15 * 60_000,
    })
    if (!requestLimit.allowed) return rateLimitResponse(requestLimit.retryAfterSeconds)

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Chưa cấu hình Supabase.' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const requestOrigin = new URL(request.url).origin
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development' ? requestOrigin : 'https://noidi.9phut.org')
    const targetRedirect = new URL('/auth/callback', configuredOrigin).toString()

    // Call Supabase Auth signInWithOtp to actually DISPATCH the magic link email to the user's Inbox
    const { error: otpError } = await supabase.auth.signInWithOtp({
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
        { error: 'Không thể gửi liên kết đăng nhập. Vui lòng thử lại.' },
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
