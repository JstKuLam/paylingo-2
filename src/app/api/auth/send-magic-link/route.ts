import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

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

    // Generate magic link via admin SDK
    const origin = request.headers.get('origin') || 'http://localhost:3000'
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: sanitizedEmail,
      options: {
        redirectTo: redirectTo || `${origin}/auth/callback`,
      }
    })

    if (linkError || !data?.properties?.action_link) {
      console.error('Failed to generate magic link:', linkError)
      return NextResponse.json({ error: linkError?.message || 'Không thể tạo liên kết đăng nhập.' }, { status: 500 })
    }

    const actionLink = data.properties.action_link

    // Send email via Maileroo SMTP directly
    const smtpHost = process.env.SMTP_HOST || 'smtp.maileroo.com'
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10)
    const smtpUser = process.env.SMTP_USER || 'no-reply@pay2pay.vn'
    const smtpPass = process.env.SMTP_PASS || 'REDACTED_SMTP_SECRET_KEY'
    const mailFrom = process.env.MAIL_FROM || '"PayPay POS System" <no-reply@pay2pay.vn>'

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false
      }
    })

    await transporter.sendMail({
      from: mailFrom,
      to: sanitizedEmail,
      subject: 'Liên kết đăng nhập PayPay Live Interpreter',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background-color: #121417; color: #ffffff; border-radius: 16px;">
          <h2 style="color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 8px;">Đăng nhập PayPay Live Interpreter</h2>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">Bạn vừa yêu cầu liên kết đăng nhập vào hệ thống. Nhấn vào nút bên dưới để hoàn tất đăng nhập:</p>
          <a href="${actionLink}" style="display: block; text-align: center; padding: 14px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">Đăng nhập ngay</a>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px; text-align: center;">Liên kết này có hiệu lực trong vòng 1 giờ. Nếu không phải bạn yêu cầu, vui lòng bỏ qua email này.</p>
        </div>
      `
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in send-magic-link route:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lỗi hệ thống khi gửi email.' }, { status: 500 })
  }
}
