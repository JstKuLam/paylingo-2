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
import { createClient } from '@/lib/supabase/client'

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
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  
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

  const loadData = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    try {
      const [sessionsResult, settingsResponse, usageResponse] = await Promise.all([
        supabase
          .from('sessions')
          .select('*, transcript_entries(count)')
          .order('started_at', { ascending: false }),
        fetch('/api/admin/settings'),
        fetch('/api/admin/usage-logs'),
      ])
      if (sessionsResult.error) throw sessionsResult.error
      const settings: {
        provider?: ApiProvider
        endpoint?: string
        model?: string
        hasApiKey?: boolean
        error?: string
      } = await settingsResponse.json()
      const usage: UsageLog[] | { error: string } = await usageResponse.json()

      if (!settingsResponse.ok) throw new Error(settings.error || 'Không thể tải cấu hình AI.')
      if (!usageResponse.ok || !Array.isArray(usage)) {
        throw new Error(!Array.isArray(usage) ? usage.error : 'Không thể tải thống kê AI.')
      }

      setGlobalSessions((sessionsResult.data || []) as AdminSession[])
      setUsageLogs(usage)
      setApiProvider(settings.provider || 'gemini')
      setApiEndpoint(settings.endpoint || '')
      setApiModel(settings.model || 'gemini-2.5-flash')
      setHasApiKey(Boolean(settings.hasApiKey))
      setApiKeyInput('')
    } catch (error) {
      console.error('Failed to load admin data:', error)
      setDataError(error instanceof Error ? error.message : 'Không thể tải dữ liệu quản trị.')
    } finally {
      setLoadingData(false)
    }
  }, [supabase])

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
      const sonioxCost = (row.totalDurationSeconds / 60) * 0.012
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
    const totalSonioxCost = (totalDuration / 60) * 0.012
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
          challenge: base64ToArrayBuffer(challengeToken),
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
    const { data, error } = await supabase
      .from('transcript_entries')
      .select('*')
      .eq('session_id', session.id)
      .order('start_ms', { ascending: true })
    if (error) setDataError(error.message)
    else setSessionEntries((data || []) as AdminTranscriptEntry[])
    setLoadingEntries(false)
  }

  const handleDeleteSession = async () => {
    if (!viewingSession || !confirm('Xóa vĩnh viễn hội thoại này khỏi hệ thống?')) return
    const { error } = await supabase.from('sessions').delete().eq('id', viewingSession.id)
    if (error) {
      setDataError(error.message)
      return
    }
    setGlobalSessions((current) => current.filter((session) => session.id !== viewingSession.id))
    setViewingSession(null)
  }

  const handleExportPDF = async () => {
    if (!viewingSession) return
    const languageName = getPartnerLanguage(viewingSession.partner_language)?.name || viewingSession.partner_language
    const { downloadSessionPDF } = await import('@/lib/pdf-generator')
    await downloadSessionPDF(
      viewingSession.name,
      viewingSession.partner_language,
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

  const handleViewUserSessions = (username: string) => {
    setSearchSessionQuery(username)
    setActiveTab('sessions')
  }

  if (checkingAuth) {
    return <div className="app-loading" role="status"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang xác thực quyền quản trị</span></div>
  }

  if (!isAdmin) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-panel">
          <div className="admin-login-heading">
            <span><LockKeyhole aria-hidden="true" /></span>
            <p className="eyebrow">Khu vực hạn chế</p>
            <h1>Đăng nhập quản trị</h1>
            <p>Nhập mật khẩu admin để xem dữ liệu vận hành và cấu hình hệ thống.</p>
          </div>
          <form onSubmit={handleLogin}>
            <label htmlFor="admin-password">Mật khẩu Admin</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            {authError && <div className="session-alert session-alert--danger" role="alert"><p>{authError}</p></div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
              <button type="submit" className="primary-command" disabled={isLoadingAuth}>
                {isLoadingAuth ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                {isLoadingAuth ? 'Đang kiểm tra' : 'Đăng nhập'}
              </button>

              {passkeySupport && hasPasskeyRegistered && passkeyEnabled && (
                <button type="button" onClick={handleLoginPasskey} className="primary-command" style={{ background: '#10B981', borderColor: '#10B981' }} disabled={isLoadingAuth}>
                  <Cpu aria-hidden="true" /> Đăng nhập bằng Passkey (Vân tay/FaceID)
                </button>
              )}
            </div>
          </form>
          <button type="button" className="back-link" onClick={() => router.push('/')}>
            Trở về ứng dụng
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="workspace-shell">
      <WorkspaceHeader
        title="Bảng điều khiển"
        subtitle="Quản trị hệ thống PayLingo"
        actions={<button type="button" onClick={handleLogout} aria-label="Đăng xuất quản trị" title="Đăng xuất"><LogOut aria-hidden="true" /></button>}
      />
      <main className="admin-main">
        <section className="admin-overview" style={{ marginBottom: '24px' }}>
          <div>
            <p className="eyebrow">Thống Kê Tài Nguyên</p>
            <h2>Tổng Quan Vận Hành Hệ Thống</h2>
            <p>Dữ liệu hợp nhất mức độ sử dụng cơ sở dữ liệu Supabase, Cloudflare hosting tĩnh, Soniox Speech-to-Text và dịch vụ AI.</p>
          </div>
          <div className="admin-metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Hoạt động & Dịch</span>
                <Users size={14} style={{ color: 'var(--primary)' }} />
              </div>
              <strong style={{ fontSize: '18px', display: 'block', color: 'var(--foreground)' }}>
                {userRankingList.length} user / {globalSessions.length} phiên
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <Clock size={10} /> {formatDuration(dashboardStats.totalDuration)} dịch thoại
              </span>
            </div>

            <div style={{ padding: '16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Supabase (Database)</span>
                <Database size={14} style={{ color: '#3B82F6' }} />
              </div>
              <strong style={{ fontSize: '18px', display: 'block', color: 'var(--foreground)' }}>
                {dashboardStats.totalSupaStorageKB < 1024 ? `${dashboardStats.totalSupaStorageKB.toFixed(1)} KB` : `${(dashboardStats.totalSupaStorageKB / 1024).toFixed(2)} MB`}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Băng thông Egress: {dashboardStats.totalSupaEgressKB < 1024 ? `${dashboardStats.totalSupaEgressKB.toFixed(1)} KB` : `${(dashboardStats.totalSupaEgressKB / 1024).toFixed(2)} MB`}
              </span>
            </div>

            <div style={{ padding: '16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Cloudflare (Hosting)</span>
                <Wifi size={14} style={{ color: '#10B981' }} />
              </div>
              <strong style={{ fontSize: '18px', display: 'block', color: 'var(--foreground)' }}>
                {dashboardStats.totalCFEgressMB < 1024 ? `${dashboardStats.totalCFEgressMB.toFixed(1)} MB` : `${(dashboardStats.totalCFEgressMB / 1024).toFixed(2)} GB`}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                Dung lượng tĩnh: 2.8 MB (Unlimited)
              </span>
            </div>

            <div style={{ padding: '16px', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>Chi phí vận hành</span>
                <Coins size={14} style={{ color: '#F59E0B' }} />
              </div>
              <strong style={{ fontSize: '18px', display: 'block', color: 'var(--foreground)' }}>
                ${dashboardStats.totalOpsCostUSD.toFixed(3)}
              </strong>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: 'bold' }}>
                Quy đổi: {Math.round(dashboardStats.totalOpsCostUSD * 25400).toLocaleString('vi-VN')} VNĐ
              </span>
            </div>
          </div>
        </section>

        <nav className="admin-tabs" aria-label="Khu vực quản trị">
          {([
            ['dashboard', 'Tổng quan & Xếp hạng', BarChart3],
            ['sessions', 'Hội thoại', Database],
            ['usage', 'Mức sử dụng AI', Cpu],
            ['api-settings', 'Cấu hình hệ thống', Settings],
          ] as const).map(([value, label, Icon]) => (
            <button type="button" key={value} className={activeTab === value ? 'is-active' : ''} onClick={() => setActiveTab(value)}>
              <Icon aria-hidden="true" />{label}
            </button>
          ))}
        </nav>

        {dataError && <div className="session-alert session-alert--danger" role="alert"><p>{dataError}</p></div>}

        {loadingData ? (
          <div className="admin-loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang tải dữ liệu</span></div>
        ) : activeTab === 'dashboard' ? (
          <section className="admin-section">
            <header>
              <div>
                <h3>Xếp Hạng Người Dùng & Lưu Lượng Tài Nguyên</h3>
                <p>Thống kê chi tiết tài nguyên sử dụng, lưu lượng băng thông, token và chi phí quy đổi theo từng người dùng.</p>
              </div>
              <span>{userRankingList.length} thành viên</span>
            </header>
            
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', paddingLeft: '16px' }}>STT</th>
                    <th>Tên người dùng</th>
                    <th style={{ textAlign: 'center' }}>Lượt dùng</th>
                    <th style={{ textAlign: 'center' }}>Hội thoại</th>
                    <th>Tổng thời lượng</th>
                    <th>Supabase (DB / Băng thông)</th>
                    <th>Cloudflare (Web / Băng thông)</th>
                    <th style={{ textAlign: 'right' }}>AI Tokens</th>
                    <th style={{ textAlign: 'right', paddingRight: '16px' }}>Chi phí ước tính ($ / VND)</th>
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
                        <td style={{ fontWeight: 'bold', color: 'var(--text-muted)', paddingLeft: '16px' }}>
                          {index + 1}
                        </td>
                        <td>
                          <span className="user-mark" style={{
                            background: index === 0 ? 'var(--primary-soft)' : 'var(--surface-muted)',
                            color: index === 0 ? 'var(--primary)' : 'var(--text-muted)'
                          }}>
                            {row.username.slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{row.username}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.totalSessions}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            color: row.conversationsCount > 0 ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: row.conversationsCount > 0 ? 'bold' : 'normal'
                          }}>
                            {row.conversationsCount}
                          </span>
                        </td>
                        <td>{formatDurationShort(row.totalDurationSeconds)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3B82F6' }}></span>
                              Size: <b>{row.supabaseStorageKB < 1024 ? `${row.supabaseStorageKB.toFixed(1)} KB` : `${(row.supabaseStorageKB/1024).toFixed(2)} MB`}</b>
                            </span>
                            <span style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#EF4444' }}></span>
                              Egress: <b>{row.supabaseBandwidthKB < 1024 ? `${row.supabaseBandwidthKB.toFixed(1)} KB` : `${(row.supabaseBandwidthKB/1024).toFixed(2)} MB`}</b>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-muted)' }}>
                              Size: <i>{row.cloudflareStorage}</i>
                            </span>
                            <span style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10B981' }}></span>
                              Egress: <b>{row.cloudflareBandwidthMB.toFixed(1)} MB</b>
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-app-mono), monospace', fontSize: '9px' }}>
                          {row.tokensUsed > 0 ? row.tokensUsed.toLocaleString() : '-'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.estimatedCostUSD > 0 ? 'var(--foreground)' : 'var(--text-muted)', paddingRight: '16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span>${row.estimatedCostUSD.toFixed(3)}</span>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                              ({Math.round(row.estimatedCostUSD * 25400).toLocaleString('vi-VN')}đ)
                            </span>
                          </div>
                        </td>
                        <td>
                          <button type="button" onClick={() => handleViewUserSessions(row.username)}>Xem phiên</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : activeTab === 'sessions' ? (
          <section className="admin-section">
            <header><div><h3>Hội thoại toàn hệ thống</h3><p>Mở transcript, xuất PDF hoặc xóa dữ liệu.</p></div><div className="table-search"><Search aria-hidden="true" /><input type="search" value={searchSessionQuery} onChange={(event) => setSearchSessionQuery(event.target.value)} placeholder="Tên phiên hoặc người dùng" aria-label="Tìm hội thoại" /></div></header>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Người dùng</th><th>Hội thoại</th><th>Ngôn ngữ</th><th>Thời lượng</th><th>Thời gian</th><th><span className="sr-only">Hành động</span></th></tr></thead><tbody>
              {filteredSessions.length === 0 ? <tr><td colSpan={6} className="table-empty">Không tìm thấy hội thoại</td></tr> : filteredSessions.map((session) => {
                const language = getPartnerLanguage(session.partner_language)
                return <tr key={session.id}><td>{session.username || 'Khách'}</td><td><strong>{session.name}</strong></td><td><span className="language-inline"><b>{language?.shortName || session.partner_language.toUpperCase()}</b>{language?.name || session.partner_language}</span></td><td>{formatDuration(session.duration_seconds)}</td><td>{new Date(session.started_at).toLocaleString('vi-VN')}</td><td><button type="button" onClick={() => void handleOpenSession(session)}>Mở</button></td></tr>
              })}
            </tbody></table></div>
          </section>
        ) : activeTab === 'usage' ? (
          <section className="admin-section">
            <header><div><h3>Mức sử dụng AI</h3><p>{dashboardStats.totalAItokens.toLocaleString()} token trong {usageLogs.length} lượt tóm tắt.</p></div><span>${dashboardStats.totalAIcost.toFixed(5)}</span></header>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Người dùng</th><th>Model</th><th>Prompt</th><th>Hoàn thành</th><th>Tổng token</th><th>Chi phí</th><th>Thời gian</th></tr></thead><tbody>
              {usageLogs.length === 0 ? <tr><td colSpan={7} className="table-empty">Chưa có dữ liệu sử dụng AI</td></tr> : usageLogs.map((log) => <tr key={log.id}><td>{log.username}</td><td><strong>{log.model}</strong></td><td>{log.prompt_tokens.toLocaleString()}</td><td>{log.completion_tokens.toLocaleString()}</td><td>{(log.prompt_tokens + log.completion_tokens).toLocaleString()}</td><td>${Number(log.cost_usd).toFixed(5)}</td><td>{new Date(log.created_at).toLocaleString('vi-VN')}</td></tr>)}
            </tbody></table></div>
          </section>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: 'min(100%, 620px)', margin: '10px auto 0' }}>
            <section className="api-settings-section" style={{ width: '100%', margin: 0 }}>
              <header><span><Cpu aria-hidden="true" /></span><div><h3>Cấu hình dịch vụ AI</h3><p>Áp dụng cho tính năng tóm tắt hội thoại và thư mục.</p></div></header>
              <form onSubmit={handleSaveApiSettings}>
                <label htmlFor="api-provider">Nhà cung cấp</label>
                <select id="api-provider" value={apiProvider} onChange={(event) => { const provider = event.target.value as ApiProvider; setApiProvider(provider); setApiModel(provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4.1-mini') }}><option value="gemini">Google Gemini</option><option value="openai">OpenAI hoặc endpoint tương thích</option></select>
                {apiProvider === 'openai' && <><label htmlFor="api-endpoint">Endpoint HTTPS</label><input id="api-endpoint" type="url" value={apiEndpoint} onChange={(event) => setApiEndpoint(event.target.value)} placeholder="https://api.openai.com/v1" required /></>}
                <label htmlFor="api-model">Tên model</label><input id="api-model" value={apiModel} onChange={(event) => setApiModel(event.target.value)} required maxLength={200} />
                <label htmlFor="api-key"><KeyRound aria-hidden="true" /> API key</label>
                <input id="api-key" type="password" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={hasApiKey ? 'Đã cấu hình. Nhập khóa mới để thay thế.' : 'Nhập API key'} autoComplete="new-password" required={!hasApiKey} maxLength={1000} />
                <p className="field-note">Khóa hiện tại không được gửi lại trình duyệt. Để trống nếu chỉ cập nhật provider, endpoint hoặc model.</p>
                {apiMessage && <div className={`session-alert session-alert--${apiMessage.type === 'success' ? 'success' : 'danger'}`} role="status">{apiMessage.type === 'success' && <Check aria-hidden="true" />}<p>{apiMessage.text}</p></div>}
                <button type="submit" className="primary-command" disabled={savingApi}>{savingApi ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Settings aria-hidden="true" />}{savingApi ? 'Đang lưu' : 'Lưu cấu hình'}</button>
              </form>
            </section>

            <section className="api-settings-section" style={{ width: '100%', margin: 0 }}>
              <header><span><LockKeyhole aria-hidden="true" /></span><div><h3>Bảo mật & Passkey</h3><p>Thay đổi mật khẩu đăng nhập admin và thiết lập đăng nhập bằng sinh trắc học thiết bị.</p></div></header>
              <div style={{ gridColumn: '2' }}>
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '24px' }}>
                  <label htmlFor="new-password">Mật khẩu mới</label>
                  <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} placeholder="Tối thiểu 6 ký tự" />
                  <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
                  <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Nhập lại mật khẩu mới" />
                  {pwdMessage && <div className={`session-alert session-alert--${pwdMessage.type === 'success' ? 'success' : 'danger'}`} role="status"><p>{pwdMessage.text}</p></div>}
                  <button type="submit" className="primary-command" disabled={savingPwd}>{savingPwd ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}{savingPwd ? 'Đang lưu' : 'Cập nhật mật khẩu'}</button>
                </form>

                <div>
                  <h4 style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--foreground)', marginBottom: '8px' }}>Đăng nhập sinh trắc học (Passkey)</h4>
                  <p className="field-note" style={{ marginBottom: '16px' }}>Đăng nhập nhanh an toàn bằng vân tay (TouchID) hoặc khuôn mặt (FaceID) trên thiết bị của bạn.</p>
                  
                  {passkeySupport ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {hasPasskeyRegistered ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9px', color: 'var(--foreground)', fontWeight: 'bold' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: passkeyEnabled ? '#10B981' : '#EF4444' }}></span>
                            Trạng thái: {passkeyEnabled ? 'Kích hoạt' : 'Tạm dừng'}
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button type="button" className="primary-command" style={{ background: 'var(--surface-muted)', color: 'var(--foreground)', borderColor: 'var(--border)' }} onClick={() => handleTogglePasskey(!passkeyEnabled)}>
                              {passkeyEnabled ? 'Tạm ngưng Passkey' : 'Kích hoạt Passkey'}
                            </button>
                            <button type="button" className="primary-command is-danger" onClick={handleDeletePasskey}>
                              Hủy đăng ký Passkey
                            </button>
                          </div>
                        </>
                      ) : (
                        <button type="button" className="primary-command" style={{ background: '#10B981', borderColor: '#10B981' }} onClick={handleRegisterPasskey} disabled={registeringPasskey}>
                          {registeringPasskey ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Cpu aria-hidden="true" />}
                          {registeringPasskey ? 'Đang liên kết...' : 'Liên kết Passkey cho thiết bị này'}
                        </button>
                      )}
                      {passkeyMessage && <div className={`session-alert session-alert--${passkeyMessage.type === 'success' ? 'success' : 'danger'}`} role="status"><p>{passkeyMessage.text}</p></div>}
                    </div>
                  ) : (
                    <div className="session-alert session-alert--danger"><p>Trình duyệt hoặc thiết bị này không hỗ trợ API Passkey (WebAuthn).</p></div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {viewingSession && (
        <div className="dialog-backdrop" role="presentation">
          <section className="admin-session-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-session-title">
            <header><div><h2 id="admin-session-title">{viewingSession.name}</h2><p>{viewingSession.username || 'Khách'} · {new Date(viewingSession.started_at).toLocaleString('vi-VN')}</p></div><div><button type="button" onClick={handleExportPDF} aria-label="Xuất PDF" title="Xuất PDF"><Download aria-hidden="true" /></button><button type="button" className="is-danger" onClick={handleDeleteSession} aria-label="Xóa hội thoại" title="Xóa"><Trash2 aria-hidden="true" /></button><button type="button" onClick={() => setViewingSession(null)} aria-label="Đóng"><X aria-hidden="true" /></button></div></header>
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
