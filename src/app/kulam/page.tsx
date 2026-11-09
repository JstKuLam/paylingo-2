'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Check,
  Cpu,
  Database,
  Download,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Volume2,
  X,
  Coins,
  Wifi,
  Clock,
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import type { LocalTranscriptEntry } from '@/lib/db'
import { getPartnerLanguage } from '@/lib/languages'

type AdminTab = 'dashboard' | 'sessions' | 'usage' | 'api-settings'
type ApiProvider = 'gemini' | 'openai'

interface AdminSession {
  id: string
  username: string | null
  name: string
  partner_language: string
  duration_seconds: number
  started_at: string
  transcript_entries?: { count: number }[]
}

type AdminTranscriptEntry = LocalTranscriptEntry

interface UsageLog {
  id: string
  username: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number | string
  created_at: string
}

interface UserRankingRow {
  username: string
  totalSessions: number
  conversationsCount: number
  totalDurationSeconds: number
  totalEntries: number
  supabaseStorageKB: number
  supabaseBandwidthKB: number
  cloudflareStorage: string
  cloudflareBandwidthMB: number
  tokensUsed: number
  estimatedCostUSD: number
  lastActive: string
}

const MASKED_API_KEY = '••••••••••••••••'

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours} giờ ${minutes} phút` : `${minutes} phút`
}

function formatDurationShort(totalSeconds: number) {
  if (totalSeconds === 0) return '0s'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  const parts = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

// Utility to convert ArrayBuffer <-> Base64 in client side
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof window === 'undefined') return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof window === 'undefined') return new ArrayBuffer(0)
  try {
    const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const binaryString = window.atob(padded)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    return new ArrayBuffer(0)
  }
}

export default function AdminPage() {
  const router = useRouter()
  
  // Custom authentication states
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)

  // Custom password change states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingPwd, setSavingPwd] = useState(false)

  // Passkey states
  const [hasPasskeyRegistered, setHasPasskeyRegistered] = useState(false)
  const [passkeyEnabled, setPasskeyEnabled] = useState(false)
  const [passkeySupport, setPasskeySupport] = useState(false)
  const [passkeyMessage, setPasskeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [registeringPasskey, setRegisteringPasskey] = useState(false)

  // Main operational data states
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')
  const [globalSessions, setGlobalSessions] = useState<AdminSession[]>([])
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [searchSessionQuery, setSearchSessionQuery] = useState('')
  const [viewingSession, setViewingSession] = useState<AdminSession | null>(null)
  const [sessionEntries, setSessionEntries] = useState<AdminTranscriptEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  
  // AI Settings states
  const [apiProvider, setApiProvider] = useState<ApiProvider>('gemini')
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [apiModel, setApiModel] = useState('gemini-2.5-flash')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [savingApi, setSavingApi] = useState(false)
  const [apiMessage, setApiMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Google OAuth Settings states
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [hasGoogleSecret, setHasGoogleSecret] = useState(false)
  const [savingGoogle, setSavingGoogle] = useState(false)
  const [googleMessage, setGoogleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    try {
      const [sessionsResponse, settingsResponse, usageResponse] = await Promise.all([
        fetch('/api/admin/sessions'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/usage-logs'),
      ])
      const sessions = await sessionsResponse.json().catch(() => null)
      const settings: {
        provider?: ApiProvider
        endpoint?: string
        model?: string
        hasApiKey?: boolean
        googleClientId?: string
        hasGoogleSecret?: boolean
        error?: string
      } = (await settingsResponse.json().catch(() => ({}))) || {}
      const usage: UsageLog[] | { error: string } = (await usageResponse.json().catch(() => null)) || []

      if (!sessionsResponse.ok || !Array.isArray(sessions)) {
        throw new Error(sessions?.error || 'Không thể tải danh sách phiên.')
      }
      if (!settingsResponse.ok) throw new Error(settings.error || 'Không thể tải cấu hình AI.')
      if (!usageResponse.ok || !Array.isArray(usage)) {
        throw new Error(!Array.isArray(usage) ? usage.error : 'Không thể tải thống kê AI.')
      }

      setGlobalSessions(sessions as AdminSession[])
      setUsageLogs(usage)
      setApiProvider(settings.provider || 'gemini')
      setApiEndpoint(settings.endpoint || '')
      setApiModel(settings.model || 'gemini-2.5-flash')
      setHasApiKey(Boolean(settings.hasApiKey))
      setApiKeyInput('')
      setGoogleClientId(settings.googleClientId || '')
      setHasGoogleSecret(Boolean(settings.hasGoogleSecret))
      setGoogleClientSecret('')
    } catch (error) {
      console.error('Failed to load admin data:', error)
      setDataError(error instanceof Error ? error.message : 'Không thể tải dữ liệu quản trị.')
    } finally {
      setLoadingData(false)
    }
  }, [])

  // Check passkey support on client
  useEffect(() => {
    if (window.PublicKeyCredential) {
      const timer = setTimeout(() => setPasskeySupport(true), 0)
      return () => clearTimeout(timer)
    }
  }, [])

  // Custom authentication check on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const response = await fetch('/api/auth/admin')
        const data = await response.json()
        if (response.ok) {
          setIsAdmin(data.authorized)
          setHasPasskeyRegistered(data.hasPasskeyRegistered)
          setPasskeyEnabled(data.passkeyEnabled)
          if (data.authorized) {
            await loadData()
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
      } finally {
        setCheckingAuth(false)
      }
    }
    initAuth()
  }, [loadData])

  const userRankingList = useMemo<UserRankingRow[]>(() => {
    const users = new Map<string, UserRankingRow>()
    
    const aiUsageMap = new Map<string, { tokens: number; cost: number }>()
    for (const log of usageLogs) {
      const username = log.username || 'Khách'
      const existing = aiUsageMap.get(username) || { tokens: 0, cost: 0 }
      existing.tokens += (log.prompt_tokens || 0) + (log.completion_tokens || 0)
      existing.cost += Number(log.cost_usd || 0)
      aiUsageMap.set(username, existing)
    }

    for (const session of globalSessions) {
      const username = session.username || 'Khách'
      const existing = users.get(username)
      const duration = session.duration_seconds || 0
      const entriesCount = session.transcript_entries?.[0]?.count || 0
      const hasContent = entriesCount > 0 ? 1 : 0

      const supabaseStorage = entriesCount * 1.2
      const syncRequestsCount = Math.ceil(duration / 15) || 1
      const supabaseBandwidth = (syncRequestsCount * 2.0) + (entriesCount * 0.6) + 15.0 // KB
      const cloudflareBandwidth = 2.8

      if (existing) {
        existing.totalSessions += 1
        existing.conversationsCount += hasContent
        existing.totalDurationSeconds += duration
        existing.totalEntries += entriesCount
        existing.supabaseStorageKB += supabaseStorage
        existing.supabaseBandwidthKB += supabaseBandwidth
        existing.cloudflareBandwidthMB += cloudflareBandwidth
        if (new Date(session.started_at) > new Date(existing.lastActive)) {
          existing.lastActive = session.started_at
        }
      } else {
        users.set(username, {
          username,
          totalSessions: 1,
          conversationsCount: hasContent,
          totalDurationSeconds: duration,
          totalEntries: entriesCount,
          supabaseStorageKB: supabaseStorage,
          supabaseBandwidthKB: supabaseBandwidth,
          cloudflareStorage: '0 B (Tĩnh)',
          cloudflareBandwidthMB: cloudflareBandwidth,
          tokensUsed: 0,
          estimatedCostUSD: 0,
          lastActive: session.started_at
        })
      }
    }

    const result = Array.from(users.values())
    for (const row of result) {
      const ai = aiUsageMap.get(row.username) || { tokens: 0, cost: 0 }
      row.tokensUsed = ai.tokens
      const sonioxCost = (row.totalDurationSeconds / 60) * 0.002
      row.estimatedCostUSD = sonioxCost + ai.cost
    }

    return result.sort((a, b) => b.estimatedCostUSD - a.estimatedCostUSD)
  }, [globalSessions, usageLogs])

  const filteredSessions = useMemo(() => {
    const term = searchSessionQuery.trim().toLocaleLowerCase('vi')
    if (!term) return globalSessions
    return globalSessions.filter((session) =>
      session.name.toLocaleLowerCase('vi').includes(term)
      || session.username?.toLocaleLowerCase('vi').includes(term)
    )
  }, [globalSessions, searchSessionQuery])

  const dashboardStats = useMemo(() => {
    const totalDuration = globalSessions.reduce((total, session) => total + (session.duration_seconds || 0), 0)
    const totalAIcost = usageLogs.reduce((total, log) => total + Number(log.cost_usd || 0), 0)
    const totalAItokens = usageLogs.reduce((total, log) => total + (log.prompt_tokens || 0) + (log.completion_tokens || 0), 0)
    
    let totalEntries = 0
    for (const session of globalSessions) {
      totalEntries += session.transcript_entries?.[0]?.count || 0
    }
    
    const totalSupaStorageKB = totalEntries * 1.2
    
    let totalSupaEgressKB = 0
    for (const session of globalSessions) {
      const duration = session.duration_seconds || 0
      const entries = session.transcript_entries?.[0]?.count || 0
      const syncs = Math.ceil(duration / 15) || 1
      totalSupaEgressKB += (syncs * 2.0) + (entries * 0.6) + 15.0
    }
    
    const totalCFEgressMB = globalSessions.length * 2.8
    const totalSonioxCost = (totalDuration / 60) * 0.002
    const totalOpsCostUSD = totalSonioxCost + totalAIcost

    return {
      totalDuration,
      totalAItokens,
      totalAIcost,
      totalEntries,
      totalSupaStorageKB,
      totalSupaEgressKB,
      totalCFEgressMB,
      totalSonioxCost,
      totalOpsCostUSD
    }
  }, [globalSessions, usageLogs])

  // Custom password login handler
  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoadingAuth(true)
    setAuthError('')
    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Mật khẩu không hợp lệ')
      setIsAdmin(true)
      await loadData()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Không thể đăng nhập.')
    } finally {
      setIsLoadingAuth(false)
    }
  }

  // Passkey Login handler
  const handleLoginPasskey = async () => {
    setIsLoadingAuth(true)
    setAuthError('')
    try {
      const challengeResponse = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-challenge' })
      })
      const challengeData = await challengeResponse.json()
      if (!challengeResponse.ok) throw new Error(challengeData.error || 'Lỗi tạo thử thách xác thực')

      const { challengeToken, credentialId } = challengeData

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: new TextEncoder().encode(challengeToken),
          allowCredentials: [{
            type: 'public-key',
            id: base64ToArrayBuffer(credentialId)
          }],
          userVerification: 'preferred'
        }
      }) as PublicKeyCredential

      if (!credential) throw new Error('Hủy xác thực vân tay/khuôn mặt')

      const assertion = credential.response as AuthenticatorAssertionResponse

      const loginResponse = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'passkey-login',
          challengeToken,
          credentialId: arrayBufferToBase64(credential.rawId),
          clientDataJSON: arrayBufferToBase64(assertion.clientDataJSON),
          authenticatorData: arrayBufferToBase64(assertion.authenticatorData),
          signature: arrayBufferToBase64(assertion.signature)
        })
      })

      const loginData = await loginResponse.json()
      if (!loginResponse.ok) throw new Error(loginData.error || 'Xác thực sinh trắc học thất bại')

      setIsAdmin(true)
      await loadData()
    } catch (error) {
      console.error(error)
      setAuthError(error instanceof Error ? error.message : 'Xác thực sinh trắc học thất bại.')
    } finally {
      setIsLoadingAuth(false)
    }
  }

  // Custom password change handler
  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 12) {
      setPwdMessage({ type: 'error', text: 'Mật khẩu mới phải có tối thiểu 12 ký tự' })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: 'error', text: 'Xác nhận mật khẩu mới không khớp' })
      return
    }
    setSavingPwd(true)
    setPwdMessage(null)
    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change-password', newPassword })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Lỗi cập nhật mật khẩu')
      setNewPassword('')
      setConfirmPassword('')
      setPwdMessage({ type: 'success', text: 'Đã đổi mật khẩu đăng nhập Admin thành công.' })
    } catch (error) {
      setPwdMessage({ type: 'error', text: error instanceof Error ? error.message : 'Lỗi cập nhật mật khẩu' })
    } finally {
      setSavingPwd(false)
    }
  }

  // Passkey registration handler
  const handleRegisterPasskey = async () => {
    setRegisteringPasskey(true)
    setPasskeyMessage(null)
    try {
      const challenge = new Uint8Array(32)
      window.crypto.getRandomValues(challenge)

      const userId = new Uint8Array(16)
      window.crypto.getRandomValues(userId)

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'PayLingo Admin' },
          user: {
            id: userId,
            name: 'admin',
            displayName: 'System Admin'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256 (TouchID / FaceID)
            { type: 'public-key', alg: -257 } // RS256
          ],
          authenticatorSelection: {
            userVerification: 'preferred'
          }
        }
      }) as PublicKeyCredential

      if (!credential) throw new Error('Hủy đăng ký mã sinh trắc')

      const attestation = credential.response as AuthenticatorAttestationResponse
      const publicKeySpki = attestation.getPublicKey()
      if (!publicKeySpki) throw new Error('Thiết bị không trả về khoá bảo mật công khai')

      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'passkey-register',
          credentialId: arrayBufferToBase64(credential.rawId),
          publicKeySpki: arrayBufferToBase64(publicKeySpki)
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Lỗi lưu thông tin passkey')

      setHasPasskeyRegistered(true)
      setPasskeyEnabled(true)
      setPasskeyMessage({ type: 'success', text: 'Đã kích hoạt đăng nhập Passkey thành công!' })
    } catch (error) {
      console.error(error)
      setPasskeyMessage({ type: 'error', text: error instanceof Error ? error.message : 'Lỗi liên kết Passkey.' })
    } finally {
      setRegisteringPasskey(false)
    }
  }

  const handleTogglePasskey = async (enable: boolean) => {
    setPasskeyMessage(null)
    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-passkey', enable })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Lỗi cập nhật cấu hình passkey')
      setPasskeyEnabled(enable)
      setPasskeyMessage({ type: 'success', text: enable ? 'Đã kích hoạt Passkey' : 'Đã tạm ngưng Passkey' })
    } catch (error) {
      setPasskeyMessage({ type: 'error', text: error instanceof Error ? error.message : 'Lỗi cập nhật Passkey' })
    }
  }

  const handleDeletePasskey = async () => {
    if (!confirm('Hủy đăng ký Passkey hiện tại? Thiết bị này sẽ không thể dùng vân tay/khuôn mặt.')) return
    setPasskeyMessage(null)
    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable-passkey' })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Lỗi hủy đăng ký passkey')
      setHasPasskeyRegistered(false)
      setPasskeyEnabled(false)
      setPasskeyMessage({ type: 'success', text: 'Đã xóa thiết bị Passkey khỏi hệ thống' })
    } catch (error) {
      setPasskeyMessage({ type: 'error', text: error instanceof Error ? error.message : 'Lỗi xóa Passkey' })
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    })
    setIsAdmin(false)
    router.replace('/')
  }

  const handleOpenSession = async (session: AdminSession) => {
    setViewingSession(session)
    setSessionEntries([])
    setLoadingEntries(true)
    try {
      const res = await fetch(`/api/admin/sessions?id=${encodeURIComponent(session.id)}`)
        .then(r => r.json())
        .catch(() => ({ entries: [] }))
      setSessionEntries((res?.entries || []) as AdminTranscriptEntry[])
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Không thể tải transcript')
    } finally {
      setLoadingEntries(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!viewingSession || !confirm('Xóa vĩnh viễn hội thoại này khỏi hệ thống?')) return
    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: viewingSession.id }),
      })
        .then(r => r.json())
        .catch(() => ({ error: 'Không thể xóa phiên' }))
      if (res?.error) {
        setDataError(res.error)
        return
      }
      setGlobalSessions((current) => current.filter((session) => session.id !== viewingSession.id))
      setViewingSession(null)
    } catch (err: unknown) {
      setDataError(err instanceof Error ? err.message : 'Không thể xóa phiên')
    }
  }

  const handleExportMarkdown = async () => {
    if (!viewingSession) return
    const languageName = getPartnerLanguage(viewingSession.partner_language)?.name || viewingSession.partner_language || 'Tự động'
    const { downloadSessionMarkdown } = await import('@/lib/pdf-generator')
    await downloadSessionMarkdown(
      viewingSession.name,
      languageName,
      viewingSession.started_at,
      sessionEntries
    )
  }

  const handleSaveApiSettings = async (event: FormEvent) => {
    event.preventDefault()
    setSavingApi(true)
    setApiMessage(null)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: apiProvider,
          endpoint: apiEndpoint,
          model: apiModel,
          api_key: apiKeyInput.trim() || (hasApiKey ? MASKED_API_KEY : ''),
        }),
      })
      const data: { error?: string } = await response.json()
      if (!response.ok) throw new Error(data.error || 'Không thể lưu cấu hình.')
      setHasApiKey(true)
      setApiKeyInput('')
      setApiMessage({ type: 'success', text: 'Đã cập nhật cấu hình AI.' })
    } catch (error) {
      setApiMessage({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu cấu hình.' })
    } finally {
      setSavingApi(false)
    }
  }

  const handleSaveGoogleOAuth = async (event: FormEvent) => {
    event.preventDefault()
    setSavingGoogle(true)
    setGoogleMessage(null)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_google_oauth',
          googleClientId: googleClientId.trim(),
          googleClientSecret:
            googleClientSecret.trim() || (hasGoogleSecret ? MASKED_API_KEY : ''),
        }),
      })
      const data: { error?: string } = await response.json()
      if (!response.ok) throw new Error(data.error || 'Không thể lưu cấu hình Google OAuth.')
      setHasGoogleSecret(true)
      setGoogleClientSecret('')
      setGoogleMessage({ type: 'success', text: 'Đã lưu cấu hình Google SSO (OAuth 2.0).' })
    } catch (error) {
      setGoogleMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Không thể lưu cấu hình Google OAuth.',
      })
    } finally {
      setSavingGoogle(false)
    }
  }

  const handleViewUserSessions = (username: string) => {
    setSearchSessionQuery(username)
    setActiveTab('sessions')
  }

  if (checkingAuth) {
    return <div className="app-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang xác thực quyền quản trị</span></div>
  }

  if (!isAdmin) {
    return (
      <main className="scr-view">
        <WorkspaceHeader
          title="Quản trị Hệ thống"
          subtitle="PayLingo Admin"
        />
        <div className="scr-body">
          <section className="gate-card">
            <div className="gate-icon">
              <LockKeyhole className="i" aria-hidden="true" />
            </div>
            <h2>Đăng nhập Quản trị</h2>
            <p>Vui lòng nhập mật khẩu quản trị hoặc xác thực bằng Passkey.</p>
            <form className="entry-form" onSubmit={handleLogin}>
              <label htmlFor="admin-password" className="sr-only">Mật khẩu Admin</label>
              <input
                id="admin-password"
                type="password"
                className="auth-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu Admin..."
                autoComplete="current-password"
                required
              />
              {authError && (
                <div className="session-alert session-alert--danger" role="alert">
                  <p>{authError}</p>
                </div>
              )}

              <button type="submit" className="btn btn--primary" disabled={isLoadingAuth}>
                {isLoadingAuth ? <Loader2 className="i animate-spin" aria-hidden="true" /> : <ShieldCheck className="i" aria-hidden="true" />}
                <span>{isLoadingAuth ? 'Đang kiểm tra...' : 'Đăng nhập Admin'}</span>
              </button>

              {passkeySupport && hasPasskeyRegistered && passkeyEnabled && (
                <button type="button" onClick={handleLoginPasskey} className="btn btn--outline" disabled={isLoadingAuth}>
                  <Cpu className="i" aria-hidden="true" />
                  <span>Đăng nhập bằng Passkey (TouchID / FaceID)</span>
                </button>
              )}

              <button type="button" className="btn btn--sm btn--outline" onClick={() => router.push('/')}>
                <span>Trở về ứng dụng</span>
              </button>
            </form>
          </section>
        </div>
      </main>
    )
  }

  return (
    <div className="scr-view">
      <WorkspaceHeader
        title="Bảng điều khiển Quản trị"
        subtitle="Quản trị hệ thống PayLingo"
        actions={
          <button type="button" className="btn btn--sm btn--danger" onClick={handleLogout} aria-label="Đăng xuất quản trị" title="Đăng xuất">
            <LogOut className="i" aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        }
      />
      <main className="scr-body">
        <div className="scr-wrap">
          <section className="kpi-grid" aria-label="Chỉ số vận hành hệ thống">
            <div className="kpi-card">
              <div className="kpi-card__lbl">
                <span>Hoạt động &amp; Dịch</span>
                <Users size={15} />
              </div>
              <div className="kpi-card__val">
                {userRankingList.length} user / {globalSessions.length} phiên
              </div>
              <div className="kpi-card__sub">
                <Clock size={11} /> {formatDuration(dashboardStats.totalDuration)} dịch thoại
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card__lbl">
                <span>Cloudflare D1 (SQLite)</span>
                <Database size={15} />
              </div>
              <div className="kpi-card__val">
                {dashboardStats.totalSupaStorageKB < 1024 ? `${dashboardStats.totalSupaStorageKB.toFixed(1)} KB` : `${(dashboardStats.totalSupaStorageKB / 1024).toFixed(2)} MB`}
              </div>
              <div className="kpi-card__sub">
                Băng thông D1: {dashboardStats.totalSupaEgressKB < 1024 ? `${dashboardStats.totalSupaEgressKB.toFixed(1)} KB` : `${(dashboardStats.totalSupaEgressKB / 1024).toFixed(2)} MB`}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card__lbl">
                <span>Cloudflare Edge Worker</span>
                <Wifi size={15} />
              </div>
              <div className="kpi-card__val">
                {dashboardStats.totalCFEgressMB < 1024 ? `${dashboardStats.totalCFEgressMB.toFixed(1)} MB` : `${(dashboardStats.totalCFEgressMB / 1024).toFixed(2)} GB`}
              </div>
              <div className="kpi-card__sub">
                Bundle Edge: &lt; 3.0 MiB (Edge Runtime)
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-card__lbl">
                <span>Chi phí vận hành</span>
                <Coins size={15} />
              </div>
              <div className="kpi-card__val">
                ${dashboardStats.totalOpsCostUSD.toFixed(3)}
              </div>
              <div className="kpi-card__sub">
                Quy đổi: {Math.round(dashboardStats.totalOpsCostUSD * 25400).toLocaleString('vi-VN')} VNĐ
              </div>
            </div>
          </section>

          <nav className="seg" aria-label="Khu vực quản trị">
            {([
              ['dashboard', 'Tổng quan & Xếp hạng', BarChart3],
              ['sessions', 'Hội thoại toàn hệ thống', Database],
              ['usage', 'Mức sử dụng AI', Cpu],
              ['api-settings', 'Cấu hình hệ thống & Passkey', Settings],
            ] as const).map(([value, label, Icon]) => (
              <button
                type="button"
                key={value}
                className={`seg__btn ${activeTab === value ? 'is-active' : ''}`}
                aria-pressed={activeTab === value}
                onClick={() => setActiveTab(value)}
              >
                <Icon className="i" aria-hidden="true" />
                <span className="seg__label">{label}</span>
              </button>
            ))}
          </nav>

          {dataError && <div className="session-alert session-alert--danger" role="alert"><p>{dataError}</p></div>}

          {loadingData ? (
            <div className="g-card list-empty"><Loader2 className="i animate-spin" aria-hidden="true" /><span>Đang tải dữ liệu...</span></div>
          ) : activeTab === 'dashboard' ? (
            <section className="g-card">
              <div className="g-head">
                <div>
                  <h3 className="g-title">Xếp Hạng Người Dùng &amp; Lưu Lượng Tài Nguyên</h3>
                  <p>Thống kê chi tiết tài nguyên sử dụng, lưu lượng băng thông D1, token AI và chi phí quy đổi theo từng người dùng.</p>
                </div>
                <span className="meta-pill">{userRankingList.length} thành viên</span>
              </div>

              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Tên người dùng</th>
                      <th>Lượt dùng</th>
                      <th>Hội thoại</th>
                      <th>Tổng thời lượng</th>
                      <th>Cloudflare D1 (DB / Egress)</th>
                      <th>Cloudflare Edge (Web)</th>
                      <th>AI Tokens</th>
                      <th>Chi phí ước tính ($ / VND)</th>
                      <th>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRankingList.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="table-empty">Chưa có dữ liệu thống kê người dùng</td>
                      </tr>
                    ) : (
                      userRankingList.map((row, index) => (
                        <tr key={row.username}>
                          <td>{index + 1}</td>
                          <td>
                            <strong>{row.username}</strong>
                          </td>
                          <td>{row.totalSessions}</td>
                          <td>{row.conversationsCount}</td>
                          <td>{formatDurationShort(row.totalDurationSeconds)}</td>
                          <td>
                            Size: <b>{row.supabaseStorageKB < 1024 ? `${row.supabaseStorageKB.toFixed(1)} KB` : `${(row.supabaseStorageKB / 1024).toFixed(2)} MB`}</b> · Egress: <b>{row.supabaseBandwidthKB < 1024 ? `${row.supabaseBandwidthKB.toFixed(1)} KB` : `${(row.supabaseBandwidthKB / 1024).toFixed(2)} MB`}</b>
                          </td>
                          <td>
                            {row.cloudflareStorage} · <b>{row.cloudflareBandwidthMB.toFixed(1)} MB</b>
                          </td>
                          <td>{row.tokensUsed > 0 ? row.tokensUsed.toLocaleString() : '-'}</td>
                          <td>
                            <b>${row.estimatedCostUSD.toFixed(3)}</b> ({Math.round(row.estimatedCostUSD * 25400).toLocaleString('vi-VN')}đ)
                          </td>
                          <td>
                            <button type="button" className="btn btn--sm btn--outline" onClick={() => handleViewUserSessions(row.username)}>Xem phiên</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : activeTab === 'sessions' ? (
            <section className="g-card">
              <div className="g-head">
                <div>
                  <h3 className="g-title">Hội thoại toàn hệ thống</h3>
                  <p>Mở transcript, xuất Markdown hoặc xóa dữ liệu.</p>
                </div>
                <div className="search">
                  <Search className="i" aria-hidden="true" />
                  <input type="search" value={searchSessionQuery} onChange={(event) => setSearchSessionQuery(event.target.value)} placeholder="Tên phiên hoặc người dùng..." aria-label="Tìm hội thoại" />
                </div>
              </div>
              <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Người dùng</th><th>Hội thoại</th><th>Ngôn ngữ</th><th>Thời lượng</th><th>Thời gian</th><th><span className="sr-only">Hành động</span></th></tr></thead><tbody>
                {filteredSessions.length === 0 ? <tr><td colSpan={6} className="table-empty">Không tìm thấy hội thoại</td></tr> : filteredSessions.map((session) => {
                  const language = getPartnerLanguage(session.partner_language)
                  return <tr key={session.id}><td>{session.username || 'Khách'}</td><td><strong>{session.name}</strong></td><td><span className="meta-pill"><b>{language?.shortName || (session.partner_language ? session.partner_language.toUpperCase() : 'AUTO')}</b> {language?.name || session.partner_language || 'Tự động'}</span></td><td>{formatDuration(session.duration_seconds)}</td><td>{new Date(session.started_at).toLocaleString('vi-VN')}</td><td><button type="button" className="btn btn--sm btn--outline" onClick={() => void handleOpenSession(session)}>Mở</button></td></tr>
                })}
              </tbody></table></div>
            </section>
          ) : activeTab === 'usage' ? (
            <section className="g-card">
              <div className="g-head"><div><h3 className="g-title">Mức sử dụng AI</h3><p>{dashboardStats.totalAItokens.toLocaleString()} token trong {usageLogs.length} lượt tóm tắt.</p></div><span className="meta-pill">${dashboardStats.totalAIcost.toFixed(5)}</span></div>
              <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Người dùng</th><th>Model</th><th>Prompt</th><th>Hoàn thành</th><th>Tổng token</th><th>Chi phí</th><th>Thời gian</th></tr></thead><tbody>
                {usageLogs.length === 0 ? <tr><td colSpan={7} className="table-empty">Chưa có dữ liệu sử dụng AI</td></tr> : usageLogs.map((log) => <tr key={log.id}><td>{log.username}</td><td><strong>{log.model}</strong></td><td>{log.prompt_tokens.toLocaleString()}</td><td>{log.completion_tokens.toLocaleString()}</td><td>{(log.prompt_tokens + log.completion_tokens).toLocaleString()}</td><td>${Number(log.cost_usd).toFixed(5)}</td><td>{new Date(log.created_at).toLocaleString('vi-VN')}</td></tr>)}
              </tbody></table></div>
            </section>
          ) : (
            <div className="scr-wrap">
              <section className="g-card">
                <div className="g-head"><div><h3 className="g-title">Cấu hình dịch vụ AI</h3><p>Áp dụng cho tính năng tóm tắt hội thoại và thư mục.</p></div></div>
                <form className="entry-form" onSubmit={handleSaveApiSettings}>
                  <label htmlFor="api-provider">Nhà cung cấp</label>
                  <select id="api-provider" className="set-select" value={apiProvider} onChange={(event) => { const provider = event.target.value as ApiProvider; setApiProvider(provider); setApiModel(provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4.1-mini') }}><option value="gemini">Google Gemini</option><option value="openai">OpenAI hoặc endpoint tương thích</option></select>
                  {apiProvider === 'openai' && <><label htmlFor="api-endpoint">Endpoint HTTPS</label><input id="api-endpoint" className="auth-input" type="url" value={apiEndpoint} onChange={(event) => setApiEndpoint(event.target.value)} placeholder="https://api.openai.com/v1" required /></>}
                  <label htmlFor="api-model">Tên model</label><input id="api-model" className="auth-input" value={apiModel} onChange={(event) => setApiModel(event.target.value)} required maxLength={200} />
                  <label htmlFor="api-key"><KeyRound aria-hidden="true" /> API key</label>
                  <input id="api-key" className="auth-input" type="password" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={hasApiKey ? 'Đã cấu hình. Nhập khóa mới để thay thế.' : 'Nhập API key'} autoComplete="new-password" required={!hasApiKey} maxLength={1000} />
                  <p className="field-note">Khóa hiện tại không được gửi lại trình duyệt. Để trống nếu chỉ cập nhật provider, endpoint hoặc model.</p>
                  {apiMessage && <div className={`session-alert session-alert--${apiMessage.type === 'success' ? 'success' : 'danger'}`} role="status">{apiMessage.type === 'success' && <Check aria-hidden="true" />}<p>{apiMessage.text}</p></div>}
                  <button type="submit" className="btn btn--primary" disabled={savingApi}>{savingApi ? <Loader2 className="i animate-spin" aria-hidden="true" /> : <Settings className="i" aria-hidden="true" />}<span>{savingApi ? 'Đang lưu' : 'Lưu cấu hình'}</span></button>
                </form>
              </section>

              <section className="g-card">
                <div className="g-head"><div><h3 className="g-title">Cấu hình Google SSO (OAuth 2.0)</h3><p>Cho phép người dùng đăng nhập và đăng ký bằng tài khoản Google (PKCE S256). Redirect URI: <code>/api/auth/google/callback</code></p></div></div>
                <form className="entry-form" onSubmit={handleSaveGoogleOAuth}>
                  <label htmlFor="google-client-id">Google Client ID</label>
                  <input id="google-client-id" className="auth-input" type="text" value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} placeholder="xxxx.apps.googleusercontent.com" required maxLength={300} />
                  <label htmlFor="google-client-secret"><KeyRound aria-hidden="true" /> Google Client Secret</label>
                  <input id="google-client-secret" className="auth-input" type="password" value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} placeholder={hasGoogleSecret ? 'Đã cấu hình. Nhập secret mới để thay thế.' : 'GOCSPX-...'} autoComplete="new-password" required={!hasGoogleSecret} maxLength={500} />
                  <p className="field-note">Có thể cấu hình tại đây hoặc qua biến môi trường <code>GOOGLE_CLIENT_ID</code> &amp; <code>GOOGLE_CLIENT_SECRET</code> trên Cloudflare Pages.</p>
                  {googleMessage && <div className={`session-alert session-alert--${googleMessage.type === 'success' ? 'success' : 'danger'}`} role="status">{googleMessage.type === 'success' && <Check aria-hidden="true" />}<p>{googleMessage.text}</p></div>}
                  <button type="submit" className="btn btn--primary" disabled={savingGoogle}>{savingGoogle ? <Loader2 className="i animate-spin" aria-hidden="true" /> : <Settings className="i" aria-hidden="true" />}<span>{savingGoogle ? 'Đang lưu' : 'Lưu cấu hình Google SSO'}</span></button>
                </form>
              </section>

              <section className="g-card">
                <div className="g-head"><div><h3 className="g-title">Bảo mật &amp; Passkey</h3><p>Thay đổi mật khẩu đăng nhập admin và thiết lập đăng nhập bằng sinh trắc học thiết bị.</p></div></div>
                <form className="entry-form" onSubmit={handleChangePassword}>
                  <label htmlFor="new-password">Mật khẩu mới</label>
                  <input id="new-password" className="auth-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} placeholder="Tối thiểu 12 ký tự" />
                  <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
                  <input id="confirm-password" className="auth-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={12} placeholder="Nhập lại mật khẩu mới (tối thiểu 12 ký tự)" />
                  {pwdMessage && <div className={`session-alert session-alert--${pwdMessage.type === 'success' ? 'success' : 'danger'}`} role="status"><p>{pwdMessage.text}</p></div>}
                  <button type="submit" className="btn btn--primary" disabled={savingPwd}>{savingPwd ? <Loader2 className="i animate-spin" aria-hidden="true" /> : <LockKeyhole className="i" aria-hidden="true" />}<span>{savingPwd ? 'Đang lưu' : 'Cập nhật mật khẩu'}</span></button>
                </form>

                <div className="f-box">
                  <p className="f-box__h">Đăng nhập sinh trắc học (Passkey ECDSA P-256)</p>
                  <p className="field-note">Đăng nhập nhanh an toàn bằng vân tay (TouchID) hoặc khuôn mặt (FaceID) trên thiết bị của bạn.</p>
                  {passkeySupport ? (
                    <div className="h-feed__search-row">
                      {hasPasskeyRegistered ? (
                        <>
                          <span className="meta-pill meta-pill--sync">
                            <i />
                            <span>Trạng thái: {passkeyEnabled ? 'Kích hoạt' : 'Tạm dừng'}</span>
                          </span>
                          <button type="button" className="btn btn--sm btn--outline" onClick={() => handleTogglePasskey(!passkeyEnabled)}>
                            {passkeyEnabled ? 'Tạm ngưng Passkey' : 'Kích hoạt Passkey'}
                          </button>
                          <button type="button" className="btn btn--sm btn--danger" onClick={handleDeletePasskey}>
                            Hủy đăng ký Passkey
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn btn--sm btn--outline" onClick={handleRegisterPasskey} disabled={registeringPasskey}>
                          {registeringPasskey ? <Loader2 className="i animate-spin" aria-hidden="true" /> : <Cpu className="i" aria-hidden="true" />}
                          <span>{registeringPasskey ? 'Đang liên kết...' : 'Liên kết Passkey'}</span>
                        </button>
                      )}
                      {passkeyMessage && <div className={`session-alert session-alert--${passkeyMessage.type === 'success' ? 'success' : 'danger'}`} role="status"><p>{passkeyMessage.text}</p></div>}
                    </div>
                  ) : (
                    <div className="session-alert session-alert--danger"><p>Trình duyệt hoặc thiết bị này không hỗ trợ API Passkey (WebAuthn).</p></div>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </main>

      {viewingSession && (
        <div className="dialog-backdrop" role="presentation">
          <section className="admin-session-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-session-title">
            <header><div><h2 id="admin-session-title">{viewingSession.name}</h2><p>{viewingSession.username || 'Khách'} · {new Date(viewingSession.started_at).toLocaleString('vi-VN')}</p></div><div><button type="button" onClick={handleExportMarkdown} aria-label="Xuất Markdown" title="Xuất Markdown (.md)"><Download aria-hidden="true" /></button><button type="button" className="is-danger" onClick={handleDeleteSession} aria-label="Xóa hội thoại" title="Xóa"><Trash2 aria-hidden="true" /></button><button type="button" onClick={() => setViewingSession(null)} aria-label="Đóng"><X aria-hidden="true" /></button></div></header>
            <div className="admin-transcript">
              {loadingEntries ? <div className="admin-loading"><Loader2 className="animate-spin" aria-hidden="true" /></div> : sessionEntries.length === 0 ? <div className="transcript-archive__empty"><Volume2 aria-hidden="true" /><strong>Không có transcript</strong></div> : sessionEntries.map((entry) => {
                const language = getPartnerLanguage(viewingSession.partner_language)
                const hostText = entry.speaker === 'host' ? entry.original_text : entry.translated_text
                const partnerText = entry.speaker === 'partner' ? entry.original_text : entry.translated_text
                return <article key={entry.id} className={`admin-entry admin-entry--${entry.speaker}`}><header><strong>{entry.speaker === 'host' ? 'Bạn' : language?.name || 'Đối tác'}</strong><time>{Math.floor(entry.start_ms / 1000)} giây</time></header>{hostText && <p><b>VI</b>{hostText}</p>}{partnerText && <p><b>{language?.shortName || 'INTL'}</b>{partnerText}</p>}</article>
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
