import { db, purgeLegacyDemoData, rekeyLocalDataOwner } from './db'

export interface ClientUser {
  id: string
  email: string
  email_confirmed_at?: string | null
  created_at: string
  user_metadata?: {
    full_name?: string
    name?: string
    username?: string
  }
}

export interface ClientSession {
  user: ClientUser
  access_token: string
}

type AuthListener = (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION', session: ClientSession | null) => void

const USER_NAME_KEY = 'paylingo_user_name'
const USER_ID_KEY = 'paylingo_user_id'
const USER_EMAIL_KEY = 'paylingo_user_email'
const DEVICE_SECRET_KEY = 'paylingo_device_secret'
const SONIOX_KEY_STORAGE = 'paylingo_soniox_api_key'
const SONIOX_CONTEXT_DOMAIN_STORAGE = 'paylingo_soniox_context_domain'
const SONIOX_CONTEXT_TERMS_STORAGE = 'paylingo_soniox_context_terms'

export interface SonioxContextConfig {
  domain: string
  termsRaw: string
}

export interface SonioxV6TranscriptionContext {
  general?: Array<{ key: string; value: string }>
  terms?: string[]
  translation_terms?: Array<{ source: string; target: string }>
}

export interface SonioxContextPreset {
  id: string
  labelVi: string
  labelEn: string
  labelZh: string
  domain: string
  termsRaw: string
}

export const SONIOX_CONTEXT_PRESETS: SonioxContextPreset[] = [
  {
    id: 'fintech',
    labelVi: 'Fintech & Thanh toán',
    labelEn: 'Fintech & Payments',
    labelZh: '金融科技与支付',
    domain: 'Fintech & Cross-border Payments',
    termsRaw:
      'PayLingo, VietQR, Napas, Settlement = Đối soát, Reconciliation = Đối chiếu, Acquirer = Ngân hàng thanh toán, Chargeback = Bồi hoàn',
  },
  {
    id: 'logistics',
    labelVi: 'Thương mại & Logistics',
    labelEn: 'Trade & Logistics',
    labelZh: '国际贸易与物流',
    domain: 'International Trade & Supply Chain',
    termsRaw:
      'Incoterms, FOB, CIF, Bill of Lading = Vận đơn, Customs Clearance = Thông quan, Lead Time = Thời gian giao hàng',
  },
  {
    id: 'tech',
    labelVi: 'Công nghệ & Phần mềm',
    labelEn: 'Software & AI',
    labelZh: '软件与人工智能',
    domain: 'Software Engineering & Cloud Architecture',
    termsRaw:
      'PayLingo, Soniox, Latency = Độ trễ, Throughput = Thông lượng, Deployment = Triển khai, Edge Runtime',
  },
  {
    id: 'medical',
    labelVi: 'Y tế & Sức khỏe',
    labelEn: 'Healthcare',
    labelZh: '医疗健康',
    domain: 'Healthcare & Clinical Consultation',
    termsRaw:
      'Diagnosis = Chẩn đoán, Prescription = Đơn thuốc, Symptom = Triệu chứng, Contraindication = Chống chỉ định',
  },
]

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const listeners = new Set<AuthListener>()
let cachedUser: ClientUser | null = null
let hasFetchedInitial = false
let serverSessionSynced = false
let inflightSessionSync: Promise<void> | null = null

function notify(event: 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION', session: ClientSession | null) {
  listeners.forEach(cb => {
    try {
      cb(event, session)
    } catch (e) {
      console.error('Auth listener error:', e)
    }
  })
}

function getOrCreateDeviceSecret(): string {
  if (typeof window === 'undefined') return ''
  try {
    let secret = localStorage.getItem(DEVICE_SECRET_KEY)?.trim() || ''
    if (secret.length < 32) {
      secret = `${crypto.randomUUID()}-${crypto.randomUUID()}`
      localStorage.setItem(DEVICE_SECRET_KEY, secret)
    }
    return secret
  } catch {
    return ''
  }
}

function normalizeDisplayName(raw: string): string {
  let out = raw.trim()
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(out)) break
    try {
      const next = decodeURIComponent(out)
      if (next === out) break
      out = next
    } catch {
      break
    }
  }
  return out.trim().slice(0, 80)
}

function readLocalProfile(): ClientUser | null {
  if (typeof window === 'undefined') return null
  try {
    const savedEmail = localStorage.getItem(USER_EMAIL_KEY)?.trim()
    if (!savedEmail || savedEmail.toLowerCase().endsWith('@paylingo.app')) {
      localStorage.removeItem(USER_NAME_KEY)
      localStorage.removeItem(USER_EMAIL_KEY)
      return null
    }
    const userId = localStorage.getItem(USER_ID_KEY)?.trim()
    if (!userId || !UUID_V4_REGEX.test(userId)) {
      return null
    }
    const rawName = normalizeDisplayName(
      localStorage.getItem(USER_NAME_KEY)?.trim() ||
        savedEmail.split('@')[0] ||
        'User'
    )
    if (localStorage.getItem(USER_NAME_KEY) !== rawName) {
      localStorage.setItem(USER_NAME_KEY, rawName)
    }
    return {
      id: userId,
      email: savedEmail,
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      user_metadata: {
        username: rawName,
        full_name: rawName,
        name: rawName,
      },
    }
  } catch {
    return null
  }
}

export const authClient = {
  getSonioxApiKey(): string {
    if (typeof window === 'undefined') return ''
    try {
      return localStorage.getItem(SONIOX_KEY_STORAGE)?.trim() || ''
    } catch {
      return ''
    }
  },

  setSonioxApiKey(key: string): void {
    if (typeof window === 'undefined') return
    try {
      const clean = key.trim()
      if (clean) {
        localStorage.setItem(SONIOX_KEY_STORAGE, clean)
      } else {
        localStorage.removeItem(SONIOX_KEY_STORAGE)
      }
    } catch {}
  },

  getSonioxContext(): SonioxContextConfig {
    if (typeof window === 'undefined') {
      return { domain: '', termsRaw: '' }
    }
    try {
      return {
        domain: localStorage.getItem(SONIOX_CONTEXT_DOMAIN_STORAGE)?.trim() || '',
        termsRaw: localStorage.getItem(SONIOX_CONTEXT_TERMS_STORAGE)?.trim() || '',
      }
    } catch {
      return { domain: '', termsRaw: '' }
    }
  },

  setSonioxContext(config: Partial<SonioxContextConfig>): void {
    if (typeof window === 'undefined') return
    try {
      if (typeof config.domain === 'string') {
        const cleanDomain = config.domain.trim().slice(0, 120)
        if (cleanDomain) {
          localStorage.setItem(SONIOX_CONTEXT_DOMAIN_STORAGE, cleanDomain)
        } else {
          localStorage.removeItem(SONIOX_CONTEXT_DOMAIN_STORAGE)
        }
      }
      if (typeof config.termsRaw === 'string') {
        const cleanTerms = config.termsRaw.trim().slice(0, 1200)
        if (cleanTerms) {
          localStorage.setItem(SONIOX_CONTEXT_TERMS_STORAGE, cleanTerms)
        } else {
          localStorage.removeItem(SONIOX_CONTEXT_TERMS_STORAGE)
        }
      }
    } catch {}
  },

  buildSonioxTranscriptionContext(override?: Partial<SonioxContextConfig>): SonioxV6TranscriptionContext {
    const current = {
      ...this.getSonioxContext(),
      ...override,
    }
    const general: Array<{ key: string; value: string }> = [
      { key: 'app', value: 'PayLingo Bilingual Interpretation' },
    ]
    if (current.domain.trim()) {
      general.push({ key: 'domain', value: current.domain.trim() })
    }

    const termsSet = new Set<string>(['PayLingo', 'Soniox'])
    const translationTerms: Array<{ source: string; target: string }> = []

    if (current.termsRaw.trim()) {
      const entries = current.termsRaw
        .split(/[\n,;]+/)
        .map(item => item.trim())
        .filter(Boolean)

      for (const entry of entries) {
        const pairMatch = entry.split(/\s*(?:=>|->|=)\s*/)
        if (pairMatch.length === 2 && pairMatch[0] && pairMatch[1]) {
          const source = pairMatch[0].trim()
          const target = pairMatch[1].trim()
          translationTerms.push({ source, target })
          termsSet.add(source)
        } else {
          termsSet.add(entry)
        }
      }
    }

    const context: SonioxV6TranscriptionContext = {
      general,
      terms: Array.from(termsSet).slice(0, 100),
    }
    if (translationTerms.length > 0) {
      context.translation_terms = translationTerms.slice(0, 60)
    }
    return context
  },

  async verifySonioxApiKey(rawKey: string): Promise<{ valid: boolean; error?: string }> {
    const cleanKey = rawKey.trim()
    if (!cleanKey) {
      return { valid: false, error: 'Vui lòng nhập Soniox API Key' }
    }
    if (typeof WebSocket === 'undefined') {
      return { valid: false, error: 'Trình duyệt không hỗ trợ WebSocket' }
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: { valid: boolean; error?: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          ws.close()
        } catch {}
        resolve(result)
      }

      const timer = setTimeout(() => {
        finish({ valid: false, error: 'Quá thời gian kết nối tới Soniox (6s)' })
      }, 6000)

      let ws: WebSocket
      try {
        ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket')
      } catch {
        clearTimeout(timer)
        resolve({ valid: false, error: 'Không thể khởi tạo kết nối WebSocket' })
        return
      }

      ws.onopen = () => {
        try {
          ws.send(
            JSON.stringify({
              api_key: cleanKey,
              model: 'stt-rt-v6',
              audio_format: 'pcm_s16le',
              sample_rate: 16000,
              num_channels: 1,
            })
          )
          ws.send('')
        } catch {
          finish({ valid: false, error: 'Không thể gửi gói xác thực tới Soniox' })
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data))
          if (data.error_code || data.error_message) {
            finish({
              valid: false,
              error: String(data.error_message || `Lỗi Soniox (${data.error_code})`),
            })
            return
          }
          if (data.finished || Array.isArray(data.tokens)) {
            finish({ valid: true })
          }
        } catch {
          finish({ valid: false, error: 'Phản hồi từ Soniox không hợp lệ' })
        }
      }

      ws.onerror = () => {
        finish({ valid: false, error: 'Lỗi mạng khi kết nối tới Soniox' })
      }

      ws.onclose = (event) => {
        if (!settled) {
          if (event.code === 1000) {
            finish({ valid: true })
          } else {
            finish({ valid: false, error: `Kết nối đóng bất thường (mã ${event.code})` })
          }
        }
      }
    })
  },

  signInWithGoogle(options?: {
    mode?: 'signin' | 'signup'
    sonioxApiKey?: string
  }): void {
    if (typeof window === 'undefined') return
    if (options?.sonioxApiKey?.trim()) {
      this.setSonioxApiKey(options.sonioxApiKey.trim())
    }
    const mode = options?.mode === 'signup' ? 'signup' : 'signin'
    window.location.assign(`/api/auth/google?mode=${mode}`)
  },

  async signInWithProfile({
    name,
    sonioxApiKey,
  }: {
    name: string
    sonioxApiKey?: string
  }): Promise<{ data: { user: ClientUser | null }; error: Error | null }> {
    const cleanName = name.trim().slice(0, 80)
    if (!cleanName) {
      return { data: { user: null }, error: new Error('Vui lòng nhập tên của bạn') }
    }

    let userId = ''
    if (typeof window !== 'undefined') {
      try {
        userId = localStorage.getItem(USER_ID_KEY)?.trim() || ''
        if (!userId || !UUID_V4_REGEX.test(userId)) {
          userId = crypto.randomUUID()
          localStorage.setItem(USER_ID_KEY, userId)
        }
        localStorage.setItem(USER_NAME_KEY, cleanName)
        if (typeof sonioxApiKey === 'string') {
          this.setSonioxApiKey(sonioxApiKey)
        }
      } catch {}
    }

    const localUser = readLocalProfile()
    const deviceSecret = getOrCreateDeviceSecret()
    try {
      const res = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          userId: localUser?.id || userId,
          deviceSecret,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const prevId = localUser?.id || userId
        if (data?.user?.id && typeof window !== 'undefined') {
          if (Boolean(data?.rotated) && prevId && data.user.id !== prevId) {
            await rekeyLocalDataOwner(prevId, data.user.id)
          }
          if (Boolean(data?.rotated) || !prevId || data.user.id === prevId) {
            try {
              localStorage.setItem(USER_ID_KEY, data.user.id)
            } catch {}
          }
        }
        serverSessionSynced = true
      }
    } catch {
      // Offline-first fallback uses localUser
    }

    const finalUser = readLocalProfile() || localUser
    cachedUser = finalUser
    hasFetchedInitial = true
    if (finalUser) {
      notify('SIGNED_IN', { user: finalUser, access_token: 'cookie_session' })
    }
    return { data: { user: finalUser }, error: null }
  },

  resetServerSessionSync(): void {
    serverSessionSynced = false
    inflightSessionSync = null
  },

  isServerSessionSynced(): boolean {
    return serverSessionSynced
  },

  async getUser(): Promise<{ data: { user: ClientUser | null }; error: Error | null }> {
    void purgeLegacyDemoData()
    if (typeof window !== 'undefined') {
      const localUser = readLocalProfile()
      if (navigator.onLine && (!localUser || !serverSessionSynced)) {
        if (!inflightSessionSync) {
          inflightSessionSync = (async () => {
            try {
              const res = await fetch('/api/auth/me', {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' },
                signal: AbortSignal.timeout(4000),
              })
              if (res.ok) {
                const data = (await res.json().catch(() => ({}))) as {
                  user?: ClientUser | null
                }
                if (
                  data?.user?.id &&
                  data?.user?.email &&
                  !data.user.email.toLowerCase().endsWith('@paylingo.app')
                ) {
                  const displayName = normalizeDisplayName(
                    data.user.user_metadata?.full_name ||
                      data.user.user_metadata?.username ||
                      data.user.email.split('@')[0] ||
                      'User'
                  )
                  if (localUser?.id && data.user.id !== localUser.id) {
                    await rekeyLocalDataOwner(localUser.id, data.user.id)
                  }
                  try {
                    localStorage.setItem(USER_ID_KEY, data.user.id)
                    localStorage.setItem(USER_NAME_KEY, displayName)
                    localStorage.setItem(USER_EMAIL_KEY, data.user.email)
                  } catch {}
                  cachedUser = {
                    ...data.user,
                    user_metadata: {
                      username: displayName,
                      full_name: displayName,
                      name: displayName,
                    },
                  }
                  serverSessionSynced = true
                } else {
                  try {
                    localStorage.removeItem(USER_NAME_KEY)
                    localStorage.removeItem(USER_EMAIL_KEY)
                    localStorage.removeItem(USER_ID_KEY)
                  } catch {}
                  cachedUser = null
                  serverSessionSynced = false
                }
              }
            } catch {
              // Offline or transient network error falls back to localUser
            } finally {
              inflightSessionSync = null
            }
          })()
        }
        await inflightSessionSync
      }
      const resolvedUser = cachedUser || readLocalProfile()
      cachedUser = resolvedUser
      hasFetchedInitial = true
      return { data: { user: resolvedUser }, error: null }
    }

    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) {
        cachedUser = null
        return { data: { user: null }, error: null }
      }
      const data = await res.json()
      cachedUser = data.user || null
      hasFetchedInitial = true
      return { data: { user: cachedUser }, error: null }
    } catch (err: unknown) {
      return { data: { user: cachedUser }, error: err instanceof Error ? err : new Error(String(err)) }
    }
  },

  async getSession(): Promise<{ data: { session: ClientSession | null }; error: Error | null }> {
    const { data, error } = await this.getUser()
    if (!data.user) {
      return { data: { session: null }, error }
    }
    const session: ClientSession = {
      user: data.user,
      access_token: 'cookie_session',
    }
    return { data: { session }, error: null }
  },

  async signInWithOtp({ email, lang }: { email: string; lang?: string }): Promise<{ error: Error | null }> {
    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        return { error: new Error(data.error || 'Gửi mã xác thực thất bại') }
      }
      return { error: null }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  },

  async verifyOtp({ token, email }: { token: string; email?: string }): Promise<{ data: { user: ClientUser | null }; error: Error | null }> {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        return { data: { user: null }, error: new Error(data.error || 'Xác thực thất bại') }
      }
      cachedUser = data.user
      const session: ClientSession = {
        user: data.user,
        access_token: 'cookie_session',
      }
      notify('SIGNED_IN', session)
      return { data: { user: cachedUser }, error: null }
    } catch (err: unknown) {
      return { data: { user: null }, error: err instanceof Error ? err : new Error(String(err)) }
    }
  },

  async signOut(): Promise<{ error: Error | null }> {
    void purgeLegacyDemoData()
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(USER_NAME_KEY)
        localStorage.removeItem(USER_EMAIL_KEY)
      } catch {}
    }
    serverSessionSynced = false
    try {
      await fetch('/api/auth/signout', { method: 'POST' })
      cachedUser = null
      notify('SIGNED_OUT', null)
      return { error: null }
    } catch (err: unknown) {
      cachedUser = null
      notify('SIGNED_OUT', null)
      return { error: err instanceof Error ? err : new Error(String(err)) }
    }
  },

  async clearDeviceData(): Promise<{ error: Error | null }> {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      return { error: new Error('Vui lòng kết nối mạng để xóa đồng thời dữ liệu trên đám mây.') }
    }
    try {
      const localUser = readLocalProfile()
      let delRes = await fetch('/api/auth/soniox-key', { method: 'DELETE' })
      if (delRes.status === 401 && localUser) {
        const deviceSecret = getOrCreateDeviceSecret()
        const authRes = await fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: localUser.user_metadata?.username || 'User',
            userId: localUser.id,
            deviceSecret,
          }),
        }).catch(() => null)
        if (authRes?.ok) {
          const authData = await authRes.json().catch(() => ({}))
          if (Boolean(authData?.rotated)) {
            return {
              error: new Error(
                'Phiên xác thực thiết bị không khớp dữ liệu đám mây. Không thể xóa dữ liệu trên máy chủ.'
              ),
            }
          }
          delRes = await fetch('/api/auth/soniox-key', { method: 'DELETE' })
        }
      }
      if (!delRes.ok && delRes.status !== 404 && (delRes.status !== 401 || Boolean(localUser))) {
        return { error: new Error('Không thể xóa dữ liệu đám mây lúc này. Vui lòng thử lại.') }
      }
      await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {})
    } catch {
      return { error: new Error('Không thể kết nối máy chủ để xóa dữ liệu đám mây.') }
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(USER_NAME_KEY)
        localStorage.removeItem(USER_ID_KEY)
        localStorage.removeItem(USER_EMAIL_KEY)
        localStorage.removeItem(DEVICE_SECRET_KEY)
        localStorage.removeItem(SONIOX_KEY_STORAGE)
        localStorage.removeItem(SONIOX_CONTEXT_DOMAIN_STORAGE)
        localStorage.removeItem(SONIOX_CONTEXT_TERMS_STORAGE)
      } catch {}
      try {
        await Promise.allSettled([
          db.transcriptEntries.clear(),
          db.sessions.clear(),
          db.folders.clear(),
        ])
      } catch {}
    }
    serverSessionSynced = false
    cachedUser = null
    notify('SIGNED_OUT', null)
    return { error: null }
  },

  onAuthStateChange(callback: AuthListener): { data: { subscription: { unsubscribe: () => void } } } {
    listeners.add(callback)
    if (hasFetchedInitial) {
      const sess = cachedUser ? { user: cachedUser, access_token: 'cookie_session' } : null
      callback('INITIAL_SESSION', sess)
    } else {
      this.getUser().then(({ data }) => {
        const sess = data.user ? { user: data.user, access_token: 'cookie_session' } : null
        callback('INITIAL_SESSION', sess)
      })
    }

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback)
          }
        }
      }
    }
  }
}
