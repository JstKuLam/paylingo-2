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
} from 'lucide-react'
import WorkspaceHeader from '@/components/WorkspaceHeader'
import type { LocalTranscriptEntry } from '@/lib/db'
import { getPartnerLanguage } from '@/lib/languages'
import { createClient } from '@/lib/supabase/client'

type AdminTab = 'users' | 'sessions' | 'usage' | 'api-settings'
type ApiProvider = 'gemini' | 'openai'

interface AdminSession {
  id: string
  username: string | null
  name: string
  partner_language: string
  duration_seconds: number
  started_at: string
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

const MASKED_API_KEY = '••••••••••••••••'

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours} giờ ${minutes} phút` : `${minutes} phút`
}

export default function AdminPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [globalSessions, setGlobalSessions] = useState<AdminSession[]>([])
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [searchSessionQuery, setSearchSessionQuery] = useState('')
  const [viewingSession, setViewingSession] = useState<AdminSession | null>(null)
  const [sessionEntries, setSessionEntries] = useState<AdminTranscriptEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
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
        supabase.from('sessions').select('*').order('started_at', { ascending: false }),
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

  useEffect(() => {
    const authTimer = window.setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const admin = session?.user?.app_metadata?.role === 'admin'
      setIsAdmin(admin)
      setCheckingAuth(false)
      if (admin) await loadData()
    }, 0)
    return () => window.clearTimeout(authTimer)
  }, [loadData, supabase])

  const usersList = useMemo(() => {
    const users = new Map<string, { username: string; totalMinutes: number; totalSessions: number; lastActive: string }>()
    for (const session of globalSessions) {
      const username = session.username || 'Khách'
      const existing = users.get(username)
      const minutes = Math.ceil((session.duration_seconds || 0) / 60)
      if (existing) {
        existing.totalMinutes += minutes
        existing.totalSessions += 1
        if (new Date(session.started_at) > new Date(existing.lastActive)) existing.lastActive = session.started_at
      } else {
        users.set(username, { username, totalMinutes: minutes, totalSessions: 1, lastActive: session.started_at })
      }
    }
    return Array.from(users.values()).sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [globalSessions])

  const filteredSessions = useMemo(() => {
    const term = searchSessionQuery.trim().toLocaleLowerCase('vi')
    if (!term) return globalSessions
    return globalSessions.filter((session) =>
      session.name.toLocaleLowerCase('vi').includes(term)
      || session.username?.toLocaleLowerCase('vi').includes(term)
    )
  }, [globalSessions, searchSessionQuery])

  const dashboardStats = useMemo(() => ({
    totalDuration: globalSessions.reduce((total, session) => total + (session.duration_seconds || 0), 0),
    totalTokens: usageLogs.reduce((total, log) => total + log.prompt_tokens + log.completion_tokens, 0),
    totalCost: usageLogs.reduce((total, log) => total + Number(log.cost_usd || 0), 0),
  }), [globalSessions, usageLogs])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoadingAuth(true)
    setAuthError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (data.user?.app_metadata?.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('Tài khoản này không có quyền quản trị.')
      }
      setIsAdmin(true)
      await loadData()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Không thể đăng nhập.')
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
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
            <p>Dùng tài khoản có vai trò admin để xem dữ liệu vận hành và cấu hình AI.</p>
          </div>
          <form onSubmit={handleLogin}>
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            <label htmlFor="admin-password">Mật khẩu</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            {authError && <div className="session-alert session-alert--danger" role="alert"><p>{authError}</p></div>}
            <button type="submit" className="primary-command" disabled={isLoadingAuth}>
              {isLoadingAuth ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              {isLoadingAuth ? 'Đang kiểm tra' : 'Đăng nhập'}
            </button>
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
        <section className="admin-overview">
          <div><p className="eyebrow">Tổng quan vận hành</p><h2>Hệ thống phiên dịch</h2><p>Dữ liệu phiên, người dùng ẩn danh và mức sử dụng AI.</p></div>
          <div className="admin-metrics">
            <div><strong>{globalSessions.length}</strong><span>Hội thoại</span></div>
            <div><strong>{usersList.length}</strong><span>Người dùng</span></div>
            <div><strong>{formatDuration(dashboardStats.totalDuration)}</strong><span>Thời lượng</span></div>
            <div><strong>${dashboardStats.totalCost.toFixed(4)}</strong><span>Chi phí AI</span></div>
          </div>
        </section>

        <nav className="admin-tabs" aria-label="Khu vực quản trị">
          {([
            ['users', 'Người dùng', Users],
            ['sessions', 'Hội thoại', Database],
            ['usage', 'Mức sử dụng', BarChart3],
            ['api-settings', 'Cấu hình AI', Settings],
          ] as const).map(([value, label, Icon]) => (
            <button type="button" key={value} className={activeTab === value ? 'is-active' : ''} onClick={() => setActiveTab(value)}>
              <Icon aria-hidden="true" />{label}
            </button>
          ))}
        </nav>

        {dataError && <div className="session-alert session-alert--danger" role="alert"><p>{dataError}</p></div>}

        {loadingData ? (
          <div className="admin-loading"><Loader2 className="animate-spin" aria-hidden="true" /><span>Đang tải dữ liệu</span></div>
        ) : activeTab === 'users' ? (
          <section className="admin-section">
            <header><div><h3>Người dùng</h3><p>Tổng hợp theo tên hiển thị trong phiên ẩn danh.</p></div><span>{usersList.length} người dùng</span></header>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Tên hiển thị</th><th>Hội thoại</th><th>Thời lượng</th><th>Hoạt động gần nhất</th><th><span className="sr-only">Hành động</span></th></tr></thead><tbody>
              {usersList.length === 0 ? <tr><td colSpan={5} className="table-empty">Chưa có dữ liệu người dùng</td></tr> : usersList.map((user) => (
                <tr key={user.username}><td><span className="user-mark">{user.username.slice(0, 2).toUpperCase()}</span><strong>{user.username}</strong></td><td>{user.totalSessions}</td><td>{user.totalMinutes} phút</td><td>{new Date(user.lastActive).toLocaleString('vi-VN')}</td><td><button type="button" onClick={() => handleViewUserSessions(user.username)}>Xem phiên</button></td></tr>
              ))}
            </tbody></table></div>
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
            <header><div><h3>Mức sử dụng AI</h3><p>{dashboardStats.totalTokens.toLocaleString()} token trong {usageLogs.length} lượt tóm tắt.</p></div><span>${dashboardStats.totalCost.toFixed(5)}</span></header>
            <div className="table-wrap"><table className="data-table"><thead><tr><th>Người dùng</th><th>Model</th><th>Prompt</th><th>Hoàn thành</th><th>Tổng token</th><th>Chi phí</th><th>Thời gian</th></tr></thead><tbody>
              {usageLogs.length === 0 ? <tr><td colSpan={7} className="table-empty">Chưa có dữ liệu sử dụng AI</td></tr> : usageLogs.map((log) => <tr key={log.id}><td>{log.username}</td><td><strong>{log.model}</strong></td><td>{log.prompt_tokens.toLocaleString()}</td><td>{log.completion_tokens.toLocaleString()}</td><td>{(log.prompt_tokens + log.completion_tokens).toLocaleString()}</td><td>${Number(log.cost_usd).toFixed(5)}</td><td>{new Date(log.created_at).toLocaleString('vi-VN')}</td></tr>)}
            </tbody></table></div>
          </section>
        ) : (
          <section className="api-settings-section">
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
