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
  const noStoreHeader = { 'Cache-Control': 'no-store, max-age=0' }
  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Payload JSON không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }
    const { action } = body

    const creds = await getAdminCredentials()
    const cookieStore = await cookies()

    if (!action || typeof action !== 'string' || action.length > 64) {
      return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400, headers: noStoreHeader })
    }

    if (action === 'login') {
      const { password } = body
      if (!password || typeof password !== 'string' || password.length > 256) {
        return NextResponse.json({ error: 'Mật khẩu trống hoặc không hợp lệ' }, { status: 400, headers: noStoreHeader })
      }

      const loginLimit = checkRateLimit({
        key: `admin-login:${getRequestIp(req)}`,
        limit: 5,
        windowMs: 15 * 60_000,
      })
      if (!loginLimit.allowed) return rateLimitResponse(loginLimit.retryAfterSeconds)

      if (!creds.configured) {
        return NextResponse.json({ error: 'Admin chưa được cấu hình an toàn' }, { status: 503, headers: noStoreHeader })
      }

      if (!(await verifyPassword(password, creds.passwordHash))) {
        return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 400, headers: noStoreHeader })
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
        if (!migrated) return NextResponse.json({ error: 'Không thể nâng cấp bảo mật mật khẩu' }, { status: 500, headers: noStoreHeader })
      }

      const token = await createSessionToken(activePasswordHash)
      cookieStore.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: 30 * 86400
      })

      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'logout') {
      cookieStore.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: true,
        path: '/',
        sameSite: 'strict',
        maxAge: 0
      })
      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'get-challenge') {
      if (!creds.configured || !creds.passkeyEnabled || !creds.passkeySpki || !creds.passkeyCredId) {
        return NextResponse.json({ error: 'Passkey chưa được cấu hình' }, { status: 400, headers: noStoreHeader })
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
      }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'passkey-login') {
      const passkeyLimit = checkRateLimit({
        key: `admin-passkey-verify:${getRequestIp(req)}`,
        limit: 10,
        windowMs: 15 * 60_000,
      })
      if (!passkeyLimit.allowed) return rateLimitResponse(passkeyLimit.retryAfterSeconds)

      const { challengeToken, credentialId, clientDataJSON, authenticatorData, signature } = body
      if (
        !challengeToken || typeof challengeToken !== 'string' || challengeToken.length > 2048 ||
        !credentialId || typeof credentialId !== 'string' || credentialId.length > 2048 ||
        !clientDataJSON || typeof clientDataJSON !== 'string' || clientDataJSON.length > 4096 ||
        !authenticatorData || typeof authenticatorData !== 'string' || authenticatorData.length > 4096 ||
        !signature || typeof signature !== 'string' || signature.length > 2048
      ) {
        return NextResponse.json({ error: 'Thiếu hoặc dữ liệu xác thực passkey không hợp lệ' }, { status: 400, headers: noStoreHeader })
      }

      // Verify challenge token
      try {
        const cookieChallenge = cookieStore.get(CHALLENGE_COOKIE_NAME)?.value
        cookieStore.delete(CHALLENGE_COOKIE_NAME)
        cookieStore.set(CHALLENGE_COOKIE_NAME, '', {
          httpOnly: true,
          secure: true,
          path: '/api/auth/admin',
          sameSite: 'strict',
          maxAge: 0,
        })
        if (
          !cookieChallenge ||
          !timingSafeEqualStr(cookieChallenge, challengeToken) ||
          !timingSafeEqualStr(credentialId, creds.passkeyCredId)
        ) {
          return NextResponse.json({ error: 'Yêu cầu xác thực không hợp lệ hoặc đã được sử dụng' }, { status: 400, headers: noStoreHeader })
        }

        const challengeStr = await verifySignedAdminValue(challengeToken, creds.passwordHash)
        if (!challengeStr) return NextResponse.json({ error: 'Chữ ký yêu cầu không hợp lệ' }, { status: 400, headers: noStoreHeader })
        const [expiresAtStr] = challengeStr.split(':')
        const expiresAt = parseInt(expiresAtStr || '0', 10)

        if (isNaN(expiresAt) || expiresAt < Date.now()) {
          return NextResponse.json({ error: 'Yêu cầu xác thực đã hết hạn' }, { status: 400, headers: noStoreHeader })
        }

        // Verify clientDataJSON contains the challengeToken (in base64url encoded format)
        const clientDataStr = new TextDecoder().decode(base64ToArrayBuffer(clientDataJSON))
        const clientData = JSON.parse(clientDataStr)
        
        // base64url encode the challengeToken
        const encoder = new TextEncoder()
        const data = encoder.encode(challengeToken)
        const base64 = btoa(String.fromCharCode(...data))
        const expectedChallenge = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

        if (!clientData.challenge || typeof clientData.challenge !== 'string' || !timingSafeEqualStr(clientData.challenge, expectedChallenge)) {
          return NextResponse.json({ error: 'Thử thách xác thực không khớp' }, { status: 400, headers: noStoreHeader })
        }

        // Verify signature
        if (!creds.passkeySpki) {
          return NextResponse.json({ error: 'Chưa đăng ký Passkey trên thiết bị này' }, { status: 400, headers: noStoreHeader })
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
          return NextResponse.json({ error: 'Mã xác thực sinh trắc không hợp lệ' }, { status: 400, headers: noStoreHeader })
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

        return NextResponse.json({ success: true }, {
          headers: noStoreHeader,
        })
      } catch (err) {
        console.error('Passkey verification error:', err)
        return NextResponse.json({ error: 'Xác thực passkey thất bại' }, { status: 400, headers: noStoreHeader })
      }
    }

    // --- PROTECTED ACTIONS ---
    const isAuthorized = await checkAdminSession()
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403, headers: noStoreHeader })
    }

    if (action === 'change-password') {
      const { newPassword } = body
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) {
        return NextResponse.json({ error: 'Mật khẩu phải từ 12 đến 256 ký tự' }, { status: 400, headers: noStoreHeader })
      }

      const newHash = await hashPassword(newPassword)
      const ok = await saveAdminCredentials(newHash, creds.passkeySpki, creds.passkeyCredId, creds.passkeyEnabled)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể lưu mật khẩu mới' }, { status: 500, headers: noStoreHeader })
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

      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'passkey-register') {
      const { credentialId, publicKeySpki } = body
      if (
        !credentialId || typeof credentialId !== 'string' || credentialId.length > 1024 ||
        !publicKeySpki || typeof publicKeySpki !== 'string' || publicKeySpki.length > 2048
      ) {
        return NextResponse.json({ error: 'Thiếu hoặc thông tin passkey đăng ký không hợp lệ' }, { status: 400, headers: noStoreHeader })
      }

      // Verify that publicKeySpki is a valid ECDSA P-256 SPKI key before persisting
      try {
        const spkiBuffer = base64ToArrayBuffer(publicKeySpki)
        await crypto.subtle.importKey(
          'spki',
          spkiBuffer,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        )
      } catch {
        return NextResponse.json({ error: 'Khoá công khai passkey không đúng định dạng SPKI ECDSA P-256' }, { status: 400, headers: noStoreHeader })
      }

      const ok = await saveAdminCredentials(creds.passwordHash, publicKeySpki, credentialId, true)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể lưu passkey đăng ký' }, { status: 500, headers: noStoreHeader })
      }

      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'toggle-passkey') {
      const { enable } = body
      if (typeof enable !== 'boolean') {
        return NextResponse.json({ error: 'Trạng thái passkey không hợp lệ' }, { status: 400, headers: noStoreHeader })
      }
      const ok = await saveAdminCredentials(creds.passwordHash, creds.passkeySpki, creds.passkeyCredId, enable)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể thay đổi cài đặt passkey' }, { status: 500, headers: noStoreHeader })
      }

      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    if (action === 'disable-passkey') {
      const ok = await saveAdminCredentials(creds.passwordHash, '', '', false)
      if (!ok) {
        return NextResponse.json({ error: 'Không thể hủy đăng ký passkey' }, { status: 500, headers: noStoreHeader })
      }

      return NextResponse.json({ success: true }, {
        headers: noStoreHeader,
      })
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400, headers: noStoreHeader })
  } catch (error: unknown) {
    console.error('API admin auth handler error:', error)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500, headers: noStoreHeader })
  }
}
