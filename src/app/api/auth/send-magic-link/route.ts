import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(request: Request) {
  try {
    const { email, redirectTo } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email không hợp lệ.' }, { status: 400 })
    }

    const sanitizedEmail = email.trim().toLowerCase()
    const isAllowedDomain = sanitizedEmail.endsWith('@pay2pay.vn') || process.env.NODE_ENV === 'development'

    if (!isAllowedDomain) {
      return NextResponse.json({ error: 'Chỉ chấp nhận email thuộc domain công ty (@pay2pay.vn).' }, { status: 400 })
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Chưa cấu hình Supabase Service Role Key.' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const origin = request.headers.get('origin') || 'http://localhost:3000'

    // Send magic link directly via Supabase Auth
    const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {
        emailRedirectTo: redirectTo || `${origin}/auth/callback`,
      },
    })

    if (otpError) {
      console.error('Failed to send magic link via Supabase:', otpError)
      // Fallback: Generate magic link and try HTTP REST API if available
      const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: sanitizedEmail,
        options: {
          redirectTo: redirectTo || `${origin}/auth/callback`,
        },
      })

      if (linkError || !data?.properties?.action_link) {
        return NextResponse.json({ error: otpError.message || linkError?.message || 'Không thể gửi liên kết đăng nhập.' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in send-magic-link route:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi hệ thống khi gửi email.' }, { status: 500 })
  }
}
