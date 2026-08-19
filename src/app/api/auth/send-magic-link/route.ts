import { NextResponse } from 'next/server'
import { isAllowedEmail } from '@/lib/auth-utils'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'
import { createMagicToken } from '@/lib/auth/session'
import { sendEmail } from '@/lib/auth/smtp'

export const runtime = 'edge'


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
      limit: 5,
      windowMs: 15 * 60_000,
    })
    if (!requestLimit.allowed) return rateLimitResponse(requestLimit.retryAfterSeconds)

    // Generate Magic Token & 6-digit OTP
    const { token, otp } = await createMagicToken(sanitizedEmail)

    const requestOrigin = new URL(request.url).origin
    const configuredOrigin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development' ? requestOrigin : 'https://noidi.9phut.org')
    const magicLinkUrl = `${configuredOrigin}/auth/callback?token=${token}`

    // Render Clean Email HTML
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 20px; background-color: #ffffff; color: #1e293b; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="margin: 0; color: #0284c7; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">PayLingo</h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Phiên dịch thời gian thực & Quản lý hội thoại</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
          Chào bạn, chúng tôi đã nhận được yêu cầu đăng nhập vào tài khoản <strong>${sanitizedEmail}</strong>.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${magicLinkUrl}" style="background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(2,132,199,0.2);">
            Đăng nhập vào PayLingo
          </a>
        </div>

        <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1; text-align: center;">
          <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Hoặc nhập mã xác thực OTP 6 số</p>
          <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: 6px; font-family: monospace;">${otp}</div>
        </div>

        <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          Liên kết và mã OTP có hiệu lực trong 15 phút. Nếu bạn không yêu cầu đăng nhập, vui lòng bỏ qua email này.
        </p>
      </div>
    `

    const sendRes = await sendEmail({
      to: sanitizedEmail,
      subject: `Mã đăng nhập PayLingo: ${otp}`,
      html: emailHtml,
    })

    if (!sendRes.success) {
      return NextResponse.json(
        { error: sendRes.error || 'Không thể gửi email xác thực. Vui lòng kiểm tra lại cấu hình SMTP.' },
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
