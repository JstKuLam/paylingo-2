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

    // 1. Generate direct magic link via Supabase Admin SDK to get hashed_token
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: sanitizedEmail,
      options: {
        redirectTo: targetRedirect,
      },
    })

    const smtpHost = process.env.SMTP_HOST || 'smtp.maileroo.com'
    const smtpUser = process.env.SMTP_USER || 'no-reply@pay2pay.vn'
    const smtpPass = process.env.SMTP_PASS || 'REDACTED_SMTP_SECRET_KEY'

    if (!linkError && linkData?.properties?.hashed_token && smtpHost && smtpUser && smtpPass) {
      const hashedToken = linkData.properties.hashed_token
      const directMagicLink = `${origin}/auth/callback?token_hash=${hashedToken}&type=magiclink`

      try {
        const nodemailer = (await import('nodemailer')).default
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: false,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        })

        const mailFrom = process.env.MAIL_FROM || `"PayLingo System" <${smtpUser}>`

        await transporter.sendMail({
          from: mailFrom,
          to: sanitizedEmail,
          subject: 'Liên kết đăng nhập PayLingo',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #111827; margin-top: 0; font-size: 20px;">Đăng nhập vào PayLingo</h2>
              <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">
                Bạn vừa yêu cầu đăng nhập vào PayLingo với tài khoản <strong>${sanitizedEmail}</strong>. Nhấn vào nút bên dưới để hoàn tất đăng nhập trên thiết bị di động hoặc máy tính:
              </p>
              <div style="margin: 28px 0; text-align: center;">
                <a href="${directMagicLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px;">
                  Đăng nhập vào PayLingo
                </a>
              </div>
              <p style="color: #6b7280; font-size: 13px; line-height: 1.4;">
                Hoặc sao chép liên kết này vào trình duyệt:<br/>
                <a href="${directMagicLink}" style="color: #2563eb; word-break: break-all;">${directMagicLink}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
              <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
                Nếu bạn không thực hiện yêu cầu này, bạn có thể an tâm bỏ qua email này.
              </p>
            </div>
          `,
        })

        console.log('Successfully sent custom email via Maileroo SMTP to:', sanitizedEmail)
        return NextResponse.json({ success: true })
      } catch (mailErr) {
        console.error('Maileroo SMTP send error, falling back to Supabase OTP:', mailErr)
      }
    }

    // Fallback: Send magic link directly via Supabase Auth
    const { error: otpError } = await supabaseAdmin.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {
        emailRedirectTo: targetRedirect,
        shouldCreateUser: true,
      },
    })

    if (otpError) {
      console.warn('signInWithOtp failed, falling back to generateLink:', otpError.message)
      const { error: fallbackLinkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: sanitizedEmail,
        options: {
          redirectTo: targetRedirect,
        },
      })

      if (fallbackLinkError) {
        console.error('Failed to generate link via admin fallback:', fallbackLinkError)
        return NextResponse.json(
          { error: 'Vui lòng đợi 10 giây trước khi thử gửi lại liên kết mới.' },
          { status: 429 }
        )
      }
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
