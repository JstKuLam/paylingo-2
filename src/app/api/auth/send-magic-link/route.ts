import { NextResponse } from 'next/server'
import { isAllowedEmail, isServerManagedEmailAllowed } from '@/lib/auth-utils'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'
import { createMagicToken } from '@/lib/auth/session'
import { sendEmail } from '@/lib/auth/smtp'
import { emailTranslations, Language } from '@/lib/i18n'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
}

export async function POST(request: Request) {
  try {
    let body: { email?: unknown; lang?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu yêu cầu không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const { email, lang } = body

    if (!email || typeof email !== 'string' || email.length > 255) {
      return NextResponse.json(
        { error: 'Email không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const sanitizedEmail = email.trim().toLowerCase().replace(/[\r\n\x00-\x1f]/g, '')
    const isAllowed = isAllowedEmail(sanitizedEmail)

    if (!isAllowed || !isServerManagedEmailAllowed(sanitizedEmail)) {
      return NextResponse.json(
        { error: 'Email không hợp lệ hoặc không nằm trong danh sách được cấp quyền.' },
        { status: 403, headers: noStoreHeader }
      )
    }

    const ipLimit = checkRateLimit({
      key: `magic-link-ip:${getRequestIp(request)}`,
      limit: 15,
      windowMs: 15 * 60_000,
    })
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterSeconds)

    const emailLimit = checkRateLimit({
      key: `magic-link-email:${sanitizedEmail}`,
      limit: 5,
      windowMs: 15 * 60_000,
    })
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterSeconds)

    const requestLimit = checkRateLimit({
      key: `magic-link:${getRequestIp(request)}:${sanitizedEmail}`,
      limit: 5,
      windowMs: 15 * 60_000,
    })
    if (!requestLimit.allowed) return rateLimitResponse(requestLimit.retryAfterSeconds)

    // Generate Magic Token, 6-digit OTP, and token-bound anti-CSRF browser nonce
    const { token, otp } = await createMagicToken(sanitizedEmail)
    const browserNonce = crypto.randomUUID()
    const nonceDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`paylingo-magic-nonce-v1:${token}:${browserNonce}`)
    )
    const boundNonce = Array.from(new Uint8Array(nonceDigest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)

    const requestOrigin = new URL(request.url).origin
    const configuredOrigin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'development' ? requestOrigin : 'https://noidi.9phut.org')
    const magicLinkUrl = `${configuredOrigin}/auth/callback?token=${token}&nonce=${boundNonce}`

    // Language selection for email content
    const selectedLang: Language = (lang === 'en' || lang === 'zh' || lang === 'vi') ? lang : 'vi'
    const emailT = emailTranslations[selectedLang] || emailTranslations.vi

    // Render Clean Email HTML in user's selected language
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 20px; background-color: #ffffff; color: #1e293b; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="margin: 0; color: #5427D4; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">PayLingo</h2>
          <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">${emailT.tagline}</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
          ${emailT.greeting(sanitizedEmail)}
        </p>

        <div style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${emailT.otpTitle}</p>
          <div style="font-size: 36px; font-weight: 800; color: #0f172a; letter-spacing: 8px; font-family: monospace;">${otp}</div>
        </div>

        <div style="text-align: center; margin: 20px 0 10px 0;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b;">${emailT.directLinkText}</p>
          <a href="${magicLinkUrl}" style="background-color: #5427D4; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
            ${emailT.signInBtn}
          </a>
        </div>

        <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          ${emailT.expiryNotice}
        </p>
      </div>
    `

    const sendRes = await sendEmail({
      to: sanitizedEmail,
      subject: emailT.subject(otp),
      html: emailHtml,
    })

    if (!sendRes.success) {
      return NextResponse.json(
        { error: 'Không thể gửi email xác thực. Vui lòng thử lại sau.' },
        { status: 500, headers: noStoreHeader }
      )
    }

    const nonceCookieName =
      process.env.NODE_ENV === 'production' ? '__Host-paylingo_magic_nonce' : 'paylingo_magic_nonce'
    const response = NextResponse.json({ success: true }, { headers: noStoreHeader })
    response.cookies.set({
      name: nonceCookieName,
      value: browserNonce,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60,
    })
    return response
  } catch (err) {
    console.error('Error in send-magic-link route:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi gửi email. Vui lòng thử lại sau.' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
