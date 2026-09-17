import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  hashPassword,
  verifyPassword,
  isLegacyAdminHash,
  createSessionToken,
  createSignedAdminValue,
  verifySignedAdminValue,
  getAdminCredentials,
  saveAdminCredentials,
  checkAdminSession,
  verifyPasskeyAssertion,
  base64ToArrayBuffer,
  timingSafeEqualStr,
} from '@/lib/admin-auth'
import { checkRateLimit, getRequestIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'edge'


const SESSION_COOKIE_NAME = 'admin_session'
const CHALLENGE_COOKIE_NAME = 'admin_passkey_challenge'

export async function GET() {
  try {
    const isAuthorized = await checkAdminSession()
    const creds = await getAdminCredentials()
    
    return NextResponse.json({
      authorized: isAuthorized,
      passkeyEnabled: creds.passkeyEnabled,
      hasPasskeyRegistered: !!creds.passkeySpki
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error: unknown) {
    console.error('Error checking admin auth status:', error)
    return NextResponse.json(
      { error: 'Lỗi hệ thống' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action } = body

    const creds = await getAdminCredentials()
    const cookieStore = await cookies()

    if (action === 'login') {
      const { password } = body
      if (!password) {
        return NextResponse.json({ error: 'Mật khẩu trống' }, { status: 400 })
      }

      const loginLimit = checkRateLimit({
        key: `admin-login:${getRequestIp(req)}`,
        limit: 5,
        windowMs: 15 * 60_000,
      })
      if (!loginLimit.allowed) return rateLimitResponse(loginLimit.retryAfterSeconds)

      if (!creds.configured) {
        return NextResponse.json({ error: 'Admin chưa được cấu hình an toàn' }, { status: 503 })
      }

      if (!(await verifyPassword(password, creds.passwordHash))) {
        return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 400 })
      }

      let activePasswordHash = creds.passwordHash
      if (isLegacyAdminHash(creds.passwordHash)) {
        activePasswordHash = await hashPassword(password)
        const migrated = await saveAdminCredentials(
          activePasswordHash,
          creds.passkeySpki,
          creds.passkeyCredId,
          creds.passkeyEnabled
        )
        if (!migrated) return NextResponse.json({ error: 'Không thể nâng cấp bảo mật mật khẩu' }, { status: 500 })
      }

      const token = await createSessionToken(activePasswordHash)
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: 30 * 86400
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'logout') {
      cookieStore.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: 0
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'get-challenge') {
      if (!creds.configured || !creds.passkeyEnabled || !creds.passkeySpki || !creds.passkeyCredId) {
        return NextResponse.json({ error: 'Passkey chưa được cấu hình' }, { status: 400 })
      }
      const challengeLimit = checkRateLimit({
        key: `admin-passkey:${getRequestIp(req)}`,
        limit: 10,
        windowMs: 15 * 60_000,
      })
      if (!challengeLimit.allowed) return rateLimitResponse(challengeLimit.retryAfterSeconds)

      const expiresAt = Date.now() + 120_000
      const randomVal = crypto.randomUUID()
      const challengeStr = `${expiresAt}:${randomVal}`
      const challengeToken = await createSignedAdminValue(challengeStr, creds.passwordHash)

      cookieStore.set(CHALLENGE_COOKIE_NAME, challengeToken, {
        httpOnly: true,
        secure: true,
        path: '/api/auth/admin',
        sameSite: 'strict',
        maxAge: 120,
      })

      // Also return the registered Credential ID so client can pass it to allowCredentials
      return NextResponse.json({
        challengeToken,
        credentialId: creds.passkeyCredId
      })
    }

    if (action === 'passkey-login') {
      const { challengeToken, credentialId, clientDataJSON, authenticatorData, signature } = body
      if (!challengeToken || !credentialId || !clientDataJSON || !authenticatorData || !signature) {
        return NextResponse.json({ error: 'Thiếu dữ liệu xác thực passkey' }, { status: 400 })
      }

      // Verify challenge token
      try {
        const cookieChallenge = cookieStore.get(CHALLENGE_COOKIE_NAME)?.value
        cookieStore.delete(CHALLENGE_COOKIE_NAME)
        if (
          !cookieChallenge ||
          !timingSafeEqualStr(cookieChallenge, challengeToken) ||
          !timingSafeEqualStr(credentialId, creds.passkeyCredId)
        ) {
          return NextResponse.json({ error: 'Yêu cầu xác thực không hợp lệ hoặc đã được sử dụng' }, { status: 400 })
        }

        const challengeStr = await verifySignedAdminValue(challengeToken, creds.passwordHash)
        if (!challengeStr) return NextResponse.json({ error: 'Chữ ký yêu cầu không hợp lệ' }, { status: 400 })
        const [expiresAtStr] = challengeStr.split(':')
        const expiresAt = parseInt(expiresAtStr || '0', 10)

        if (isNaN(expiresAt) || expiresAt < Date.now()) {
          return NextResponse.json({ error: 'Yêu cầu xác thực đã hết hạn' }, { status: 400 })
        }

        // Verify clientDataJSON contains the challengeToken (in base64url encoded format)
        const clientDataStr = new TextDecoder().decode(base64ToArrayBuffer(clientDataJSON))
        const clientData = JSON.parse(clientDataStr)
        
        // base64url encode the challengeToken
        const encoder = new TextEncoder()
        const data = encoder.encode(challengeToken)
        const base64 = btoa(String.fromCharCode(...data))
        const expectedChallenge = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

        if (clientData.challenge !== expectedChallenge) {
          return NextResponse.json({ error: 'Thử thách xác thực không khớp' }, { status: 400 })
        }

        // Verify signature
        if (!creds.passkeySpki) {
          return NextResponse.json({ error: 'Chưa đăng ký Passkey trên thiết bị này' }, { status: 400 })
        }

        const isPasskeyValid = await verifyPasskeyAssertion(
          clientDataJSON,
          authenticatorData,
          signature,
          creds.passkeySpki,
          process.env.PASSKEY_ORIGIN || new URL(req.url).origin,
          process.env.PASSKEY_RP_ID || new URL(req.url).hostname
        )

        if (!isPasskeyValid) {
          return NextResponse.json({ error: 'Mã xác thực sinh trắc không hợp lệ' }, { status: 400 })
        }

        // Login successful
        const token = await createSessionToken(creds.passwordHash)
        cookieStore.set(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          secure: true,
          path: '/',
          sameSite: 'strict',
          maxAge: 30 * 86400
        })

        return NextResponse.json({ success: true })
      } catch (err) {
        console.error('Passkey verification error:', err)
        return NextResponse.json({ error: 'Xác thực passkey thất bại' }, { status: 400 })
      }
    }

    // --- PROTECTED ACTIONS ---
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 })
    }

    if (action === 'change-password') {
      const { newPassword } = body
      if (!newPassword || newPassword.length < 12) {
        return NextResponse.json({ error: 'Mật khẩu phải tối thiểu 12 ký tự' }, { status: 400 })
      }

      const newHash = await hashPassword(newPassword)
      const ok = await saveAdminCredentials(newHash, creds.passkeySpki, creds.passkeyCredId, creds.passkeyEnabled)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể lưu mật khẩu mới' }, { status: 500 })
      }

      // Re-sign session with new hash
      const token = await createSessionToken(newHash)
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: 30 * 86400
      })

      return NextResponse.json({ success: true })
    }

    if (action === 'passkey-register') {
      const { credentialId, publicKeySpki } = body
      if (!credentialId || !publicKeySpki) {
        return NextResponse.json({ error: 'Thiếu thông tin passkey đăng ký' }, { status: 400 })
      }

      const ok = await saveAdminCredentials(creds.passwordHash, publicKeySpki, credentialId, true)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể lưu passkey đăng ký' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'toggle-passkey') {
      const { enable } = body
      const ok = await saveAdminCredentials(creds.passwordHash, creds.passkeySpki, creds.passkeyCredId, enable)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể thay đổi cài đặt passkey' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'disable-passkey') {
      const ok = await saveAdminCredentials(creds.passwordHash, '', '', false)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể hủy đăng ký passkey' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 })
  } catch (error: unknown) {
    console.error('API admin auth handler error:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}
