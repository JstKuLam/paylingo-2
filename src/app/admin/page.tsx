'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ShieldAlert, 
  Database, 
  Trash2, 
  Calendar, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Search, 
  LogOut, 
  Loader2, 
  Eye, 
  EyeOff,
  FileText,
  AlertTriangle,
  Lock,
  UserCheck,
  X,
  Volume2,
  Users,
  Settings,
  Key,
  Cpu,
  Coins,
  Check
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { downloadSessionPDF } from '@/lib/pdf-generator'

const PARTNER_LANGUAGES = [
  { code: 'any', name: 'Mọi ngôn ngữ (Any)', flag: '🌐' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
]

export default function AdminPage() {
  const router = useRouter()
  
  // Auth states
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)

  // Tabs state
  const [activeTab, setActiveTab] = useState<'users' | 'sessions' | 'stats' | 'api-settings'>('users')

  // Global Sessions History state
  const [globalSessions, setGlobalSessions] = useState<any[]>([])
  const [searchSessionQuery, setSearchSessionQuery] = useState('')
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [viewingSession, setViewingSession] = useState<any | null>(null)
  const [sessionEntries, setSessionEntries] = useState<any[]>([])

  // Dashboard Stats state
  const [stats, setStats] = useState({
    totalMinutes: 0,
    estimatedCost: 0,
    activeUsersCount: 0
  })

  // Token Usage Stats
  const [usageLogs, setUsageLogs] = useState<any[]>([])
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [usageStats, setUsageStats] = useState({
    totalSummaries: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCostUSD: 0
  })

  // API Config Form states
  const [apiProvider, setApiProvider] = useState<'gemini' | 'openai'>('gemini')
  const [apiEndpoint, setApiEndpoint] = useState('')
  const [apiModel, setApiModel] = useState('gemini-2.5-flash')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [savingApi, setSavingApi] = useState(false)
  const [apiSuccessMsg, setApiSuccessMsg] = useState(false)

  const supabase = createClient()

  // 1. Check if logged in as Admin
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && session.user?.app_metadata?.role === 'admin') {
        setIsAdmin(true)
        loadData()
      } else {
        setIsAdmin(false)
      }
      setCheckingAuth(false)
    }
    checkAdmin()
  }, [])

  // 2. Load admin data
  const loadData = async () => {
    setLoadingSessions(true)
    try {
      // Load Sessions directly
      const { data: sessionsData, error: sessErr } = await supabase
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false })

      if (sessErr) throw sessErr

      setGlobalSessions(sessionsData || [])
      setLoadingSessions(false)

      // Compute statistics
      if (sessionsData) {
        let totalSec = sessionsData.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0)
        let totalMin = Math.ceil(totalSec / 60)
        let cost = totalMin * 0.002 // Soniox estimated rate
        
        const uniqueUsernames = Array.from(new Set(sessionsData.map(s => s.username).filter(Boolean)))

        setStats({
          totalMinutes: totalMin,
          estimatedCost: cost,
          activeUsersCount: uniqueUsernames.length
        })
      }

      // Load API key settings
      loadApiSettings()

      // Load AI Usage Logs
      loadUsageLogs()
    } catch (err: any) {
      console.error(err)
      setLoadingSessions(false)
    }
  }

  // Load API Key Settings
  const loadApiSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!data.error) {
        setApiProvider(data.provider || 'gemini')
        setApiEndpoint(data.endpoint || '')
        setApiModel(data.model || 'gemini-2.5-flash')
        setApiKeyInput(data.api_key || '')
      }
    } catch (err) {
      console.error('Failed to load api settings:', err)
    }
  }

  // Load AI Usage Logs
  const loadUsageLogs = async () => {
    setLoadingUsage(true)
    try {
      const res = await fetch('/api/admin/usage-logs')
      const data = await res.json()
      if (!data.error && Array.isArray(data)) {
        setUsageLogs(data)

        // Compute AI tokens metrics
        const summaries = data.length
        const promptTokens = data.reduce((acc, curr) => acc + (curr.prompt_tokens || 0), 0)
        const compTokens = data.reduce((acc, curr) => acc + (curr.completion_tokens || 0), 0)
        const cost = data.reduce((acc, curr) => acc + Number(curr.cost_usd || 0), 0)

        setUsageStats({
          totalSummaries: summaries,
          totalPromptTokens: promptTokens,
          totalCompletionTokens: compTokens,
          totalTokens: promptTokens + compTokens,
          totalCostUSD: cost
        })
      }
    } catch (err) {
      console.error('Failed to load usage logs:', err)
    } finally {
      setLoadingUsage(false)
    }
  }

  // Save API Key configurations
  const handleSaveApiSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingApi(true)
    setApiSuccessMsg(false)

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: apiProvider,
          endpoint: apiEndpoint,
          model: apiModel,
          api_key: apiKeyInput
        })
      })

      const data = await res.json()
      if (data.error) {
        alert(data.error)
      } else {
        setApiSuccessMsg(true)
        setTimeout(() => setApiSuccessMsg(false), 3000)
        loadApiSettings()
      }
    } catch (err) {
      alert('Lỗi hệ thống khi lưu cài đặt')
    } finally {
      setSavingApi(false)
    }
  }

  // 3. Login Action
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoadingAuth(true)
    setAuthError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        setAuthError('Đăng nhập không thành công: ' + error.message)
        setIsLoadingAuth(false)
        return
      }

      if (data.user?.app_metadata?.role !== 'admin') {
        await supabase.auth.signOut()
        setAuthError('Tài khoản này không có quyền quản trị viên (Admin)')
        setIsLoadingAuth(false)
        return
      }

      setIsAdmin(true)
      setIsLoadingAuth(false)
      loadData()
    } catch (err: any) {
      setAuthError('Lỗi kết nối: ' + err.message)
      setIsLoadingAuth(false)
    }
  }

  // 4. Logout Action
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsAdmin(false)
    router.push('/')
  }

  // 5. Delete Session from Admin Dashboard
  const handleDeleteSession = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn cuộc hội thoại này?')) return

    try {
      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (!error) {
        setGlobalSessions(prev => prev.filter(s => s.id !== id))
        setViewingSession(null)
        loadData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 6. View session details from admin
  const handleOpenSession = async (sess: any) => {
    setViewingSession(sess)
    setSessionEntries([])
    
    try {
      const { data, error } = await supabase
        .from('transcript_entries')
        .select('*')
        .eq('session_id', sess.id)
        .order('start_ms', { ascending: true })

      if (!error) {
        setSessionEntries(data || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 7. Export session to PDF from Admin Dashboard
  const handleExportPDF = async () => {
    if (!viewingSession) return
    const langObj = PARTNER_LANGUAGES.find(l => l.code === viewingSession.partner_language)
    const langName = langObj?.name || viewingSession.partner_language

    await downloadSessionPDF(
      viewingSession.name,
      viewingSession.partner_language,
      langName,
      viewingSession.started_at,
      sessionEntries
    )
  }

  // Compute users list from sessions dynamically
  const usersList = useMemo(() => {
    const userMap = new Map<string, { username: string; totalMinutes: number; totalSessions: number; lastActive: string }>()
    
    globalSessions.forEach(sess => {
      const u = sess.username || 'Khách'
      const existing = userMap.get(u)
      const durationMin = Math.ceil((sess.duration_seconds || 0) / 60)
      
      if (existing) {
        existing.totalMinutes += durationMin
        existing.totalSessions += 1
        if (new Date(sess.started_at) > new Date(existing.lastActive)) {
          existing.lastActive = sess.started_at
        }
      } else {
        userMap.set(u, {
          username: u,
          totalMinutes: durationMin,
          totalSessions: 1,
          lastActive: sess.started_at
        })
      }
    })
    
    return Array.from(userMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [globalSessions])

  // Filter sessions
  const filteredSessions = globalSessions.filter(sess => {
    const term = searchSessionQuery.toLowerCase().trim()
    if (!term) return true
    
    const matchesName = sess.name.toLowerCase().includes(term)
    const matchesUsername = sess.username?.toLowerCase().includes(term)
    return matchesName || matchesUsername
  })

  // Show detailed logs by clicking user
  const handleViewUserSessions = (username: string) => {
    setSearchSessionQuery(username)
    setActiveTab('sessions')
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-host" />
        <span className="text-slate-400 mt-4 text-sm font-medium">Đang xác thực thông tin...</span>
      </div>
    )
  }

  // Render Login Layout if not authenticated as Admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative">
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-host/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 bg-partner/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-sm glass-panel rounded-3xl p-8 relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 shimmer pointer-events-none opacity-20"></div>

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-host to-partner flex items-center justify-center shadow-lg mb-4">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white">Quản trị viên</h2>
            <p className="text-[10px] text-slate-400 mt-1.5 uppercase font-bold tracking-widest">
              Đăng nhập để vào hệ thống điều hành
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-extrabold uppercase text-slate-400">Email quản trị</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@paylingo.com"
                className="w-full py-3 px-4 rounded-xl glass-input text-xs font-bold text-white placeholder:text-slate-600 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-extrabold uppercase text-slate-400">Mật khẩu</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full py-3 px-4 rounded-xl glass-input text-xs font-bold text-white placeholder:text-slate-600 outline-none"
              />
            </div>

            {authError && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-xs animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoadingAuth}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-host to-partner text-white font-bold text-xs hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoadingAuth ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full flex flex-col p-4 relative overflow-hidden bg-background text-foreground">
      {/* Dynamic Ambient Blur Blobs */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-partner/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Admin Dashboard */}
      <header className="w-full flex flex-col md:flex-row md:items-center md:justify-between py-4 px-6 glass-panel rounded-3xl mb-4 relative z-20 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-host to-partner flex items-center justify-center shadow-lg shadow-host/10">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-black text-white leading-none flex items-center gap-2">
              PayLingo Control Panel
              <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-host/25 border border-host/30 text-white animate-pulse">ADMIN</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-1.5 font-bold">
              Điều hành người dùng, lịch sử dịch và định cấu hình AI
            </p>
          </div>
        </div>

        {/* Tab switch navigation */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/[0.03] border border-white/5 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'users' ? 'bg-gradient-to-r from-host to-host/80 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Người dùng
          </button>
          
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-2 px-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'sessions' ? 'bg-gradient-to-r from-host to-host/80 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cuộc hội thoại
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`py-2 px-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'stats' ? 'bg-gradient-to-r from-host to-host/80 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Thống kê Token & Phí
          </button>

          <button
            onClick={() => setActiveTab('api-settings')}
            className={`py-2 px-3.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'api-settings' ? 'bg-gradient-to-r from-host to-host/80 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Cấu hình API AI
          </button>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer ml-1"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0">
        
        {/* TAB 1: USERS LIST */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            
            {/* Users List Table */}
            <div className="glass-panel rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 font-extrabold uppercase tracking-widest text-[9px]">
                      <th className="py-4 px-5">Tên người dùng (Username)</th>
                      <th className="py-4 px-5">Số cuộc đàm thoại</th>
                      <th className="py-4 px-5">Tổng số phút dùng</th>
                      <th className="py-4 px-5">Hoạt động cuối cùng</th>
                      <th className="py-4 px-5 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-500 font-extrabold text-xs">
                          Chưa có người dùng nào sử dụng hệ thống
                        </td>
                      </tr>
                    ) : (
                      usersList.map((usr) => (
                        <tr key={usr.username} className="border-b border-white/5 hover:bg-white/[0.01] transition-all">
                          <td className="py-4 px-5 font-black text-white flex items-center gap-2">
                            <span className="w-7 h-7 rounded-xl bg-host/15 text-host flex items-center justify-center font-extrabold text-[11px] border border-host/10">👤</span>
                            {usr.username}
                          </td>
                          <td className="py-4 px-5 font-bold text-slate-300">{usr.totalSessions} Phiên</td>
                          <td className="py-4 px-5 font-black text-partner">{usr.totalMinutes} Phút</td>
                          <td className="py-4 px-5 text-slate-400 font-bold">{new Date(usr.lastActive).toLocaleString('vi-VN')}</td>
                          <td className="py-4 px-5 text-right">
                            <button
                              onClick={() => handleViewUserSessions(usr.username)}
                              className="py-1.5 px-3.5 rounded-xl border border-host/20 bg-host/5 hover:bg-host/10 text-host transition-all cursor-pointer font-extrabold text-[10px] uppercase tracking-wide"
                            >
                              Xem cuộc gọi
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: SYSTEM SESSIONS */}
        {activeTab === 'sessions' && (
          <div className="space-y-4">
            
            {/* Search sessions */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Tìm kiếm lịch sử theo tên hoặc Username..."
                value={searchSessionQuery}
                onChange={(e) => setSearchSessionQuery(e.target.value)}
                className="w-full py-3.5 pl-11 pr-4 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            {/* Sessions Table */}
            <div className="glass-panel rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 font-extrabold uppercase tracking-widest text-[9px]">
                      <th className="py-4 px-5">Username</th>
                      <th className="py-4 px-5">Tên cuộc hội thoại</th>
                      <th className="py-4 px-5">Ngôn ngữ đối tác</th>
                      <th className="py-4 px-5">Thời lượng</th>
                      <th className="py-4 px-5">Ngày đàm thoại</th>
                      <th className="py-4 px-5 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSessions ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          <Loader2 className="w-6 h-6 animate-spin text-host mx-auto" />
                        </td>
                      </tr>
                    ) : filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500 font-extrabold">
                          Không tìm thấy cuộc hội thoại nào
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((sess) => {
                        const min = Math.floor(sess.duration_seconds / 60)
                        const sec = sess.duration_seconds % 60
                        const langObj = PARTNER_LANGUAGES.find(l => l.code === sess.partner_language)

                        return (
                          <tr key={sess.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-all">
                            <td className="py-4 px-5">
                              <span className="px-2.5 py-0.5 rounded-lg bg-host/10 text-host border border-host/15 font-black uppercase text-[8px] tracking-widest">
                                {sess.username || 'Khách'}
                              </span>
                            </td>
                            <td className="py-4 px-5 font-black text-white truncate max-w-[150px]">{sess.name}</td>
                            <td className="py-4 px-5 font-bold"><span className="text-xs mr-1">{langObj?.flag}</span>{langObj?.name || sess.partner_language}</td>
                            <td className="py-4 px-5 font-bold text-slate-300">{min}p {sec}s</td>
                            <td className="py-4 px-5 text-slate-400 font-bold">{new Date(sess.started_at).toLocaleString('vi-VN')}</td>
                            <td className="py-4 px-5 text-right">
                              <button
                                onClick={() => handleOpenSession(sess)}
                                className="p-2 rounded-xl hover:bg-white/5 border border-white/5 text-slate-300 transition-all cursor-pointer inline-flex items-center justify-center"
                                title="Xem chi tiết"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: SYSTEM STATISTICS & TOKEN USAGE */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Top Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Stat Card 1 */}
              <div className="glass-panel rounded-3xl p-5 flex items-center justify-between border border-white/5 shadow-2xl relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Tổng thời lượng</span>
                  <h3 className="text-xl font-black text-white mt-1.5">{stats.totalMinutes} Phút</h3>
                  <p className="text-[9px] text-slate-500 font-bold mt-1">Hội thoại Soniox</p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-host/10 border border-host/20 flex items-center justify-center text-host group-hover:scale-105 transition-transform">
                  <Clock className="w-5 h-5 text-host" />
                </div>
              </div>

              {/* Stat Card 2 */}
              <div className="glass-panel rounded-3xl p-5 flex items-center justify-between border border-white/5 shadow-2xl relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Tóm tắt AI</span>
                  <h3 className="text-xl font-black text-white mt-1.5">{usageStats.totalSummaries} lượt</h3>
                  <p className="text-[9px] text-slate-500 font-bold mt-1">Đã khởi tạo thành công</p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-partner/10 border border-partner/20 flex items-center justify-center text-partner group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-5 h-5 text-partner" />
                </div>
              </div>

              {/* Stat Card 3 */}
              <div className="glass-panel rounded-3xl p-5 flex items-center justify-between border border-white/5 shadow-2xl relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Tổng Token Tiêu thụ</span>
                  <h3 className="text-xl font-black text-amber-glow mt-1.5">{usageStats.totalTokens.toLocaleString()}</h3>
                  <p className="text-[9px] text-slate-500 font-bold mt-1">Prompt + Completion</p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-amber-glow/10 border border-amber-glow/20 flex items-center justify-center text-amber-glow group-hover:scale-105 transition-transform">
                  <Coins className="w-5 h-5 text-amber-glow" />
                </div>
              </div>

              {/* Stat Card 4 */}
              <div className="glass-panel rounded-3xl p-5 flex items-center justify-between border border-white/5 shadow-2xl relative overflow-hidden group">
                <div>
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Chi phí AI ước tính</span>
                  <h3 className="text-xl font-black text-green-400 mt-1.5">${usageStats.totalCostUSD.toFixed(5)}</h3>
                  <p className="text-[9px] text-slate-500 font-bold mt-1">Ước tính theo giá trị model</p>
                </div>
                <div className="w-11 h-11 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 group-hover:scale-105 transition-transform">
                  <DollarSign className="w-5 h-5 text-green-400" />
                </div>
              </div>
            </div>

            {/* AI usage details list */}
            <div className="space-y-3">
              <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Database className="w-4 h-4 text-host" />
                Lịch sử tiêu hao Token và chi phí AI ({usageLogs.length})
              </h2>

              <div className="glass-panel rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5 text-slate-400 font-extrabold uppercase tracking-widest text-[9px]">
                        <th className="py-4 px-5">Người dùng</th>
                        <th className="py-4 px-5">Mô hình sử dụng</th>
                        <th className="py-4 px-5">Prompt Tokens</th>
                        <th className="py-4 px-5">Completion Tokens</th>
                        <th className="py-4 px-5">Tổng Tokens</th>
                        <th className="py-4 px-5">Chi phí ($)</th>
                        <th className="py-4 px-5">Thời gian thực hiện</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingUsage ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500">
                            <Loader2 className="w-6 h-6 animate-spin text-host mx-auto" />
                          </td>
                        </tr>
                      ) : usageLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500 font-extrabold">
                            Chưa có dữ liệu thống kê sử dụng AI
                          </td>
                        </tr>
                      ) : (
                        usageLogs.map((log) => (
                          <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-all">
                            <td className="py-4 px-5">
                              <span className="px-2.5 py-0.5 rounded-lg bg-host/10 text-host border border-host/15 font-black uppercase text-[8px] tracking-widest">
                                {log.username}
                              </span>
                            </td>
                            <td className="py-4 px-5 font-black text-white uppercase">{log.model}</td>
                            <td className="py-4 px-5 font-bold text-slate-350">{log.prompt_tokens.toLocaleString()}</td>
                            <td className="py-4 px-5 font-bold text-slate-350">{log.completion_tokens.toLocaleString()}</td>
                            <td className="py-4 px-5 font-black text-partner">{(log.prompt_tokens + log.completion_tokens).toLocaleString()}</td>
                            <td className="py-4 px-5 font-black text-green-400">${Number(log.cost_usd).toFixed(5)}</td>
                            <td className="py-4 px-5 text-slate-400 font-bold">{new Date(log.created_at).toLocaleString('vi-VN')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 4: API AI SETTINGS CONFIG */}
        {activeTab === 'api-settings' && (
          <div className="w-full max-w-xl mx-auto glass-panel rounded-3xl p-6 md:p-8 border border-white/5 shadow-2xl relative overflow-hidden animate-fadeIn">
            
            {/* Tab header title */}
            <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-glow/10 border border-amber-glow/20 flex items-center justify-center text-amber-glow">
                <Settings className="w-5 h-5 text-amber-glow" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">Cấu hình API Key AI</h2>
                <p className="text-[9px] text-slate-400 font-bold mt-1">Định cấu hình Gemini hoặc OpenAI-compatible cho tính năng AI Tóm tắt</p>
              </div>
            </div>

            <form onSubmit={handleSaveApiSettings} className="space-y-5">
              {/* Provider Selector */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-host" />
                  Nhà cung cấp dịch vụ (Provider)
                </label>
                <select
                  value={apiProvider}
                  onChange={(e: any) => {
                    setApiProvider(e.target.value)
                    setApiModel(e.target.value === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini')
                  }}
                  className="w-full py-3 px-4 rounded-xl glass-input text-xs font-bold text-white outline-none select-none"
                >
                  <option value="gemini" className="bg-slate-950 text-white font-bold">Google Gemini API (Khuyên dùng)</option>
                  <option value="openai" className="bg-slate-950 text-white font-bold">OpenAI hoặc Compatible (Custom Endpoint)</option>
                </select>
              </div>

              {/* Endpoint - Show only if OpenAI */}
              {apiProvider === 'openai' && (
                <div className="space-y-1.5 animate-fadeIn">
                  <label className="text-[9px] font-extrabold uppercase text-slate-400">Địa chỉ Endpoint (Base URL)</label>
                  <input
                    type="url"
                    required
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full py-3 px-4 rounded-xl glass-input text-xs font-bold text-white placeholder:text-slate-700 outline-none"
                  />
                  <p className="text-[8px] text-slate-500 font-bold">Ví dụ: `https://api.openai.com/v1` hoặc endpoint dịch vụ trung gian của bạn.</p>
                </div>
              )}

              {/* Model Name */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold uppercase text-slate-400">Tên mô hình (Model Name)</label>
                <input
                  type="text"
                  required
                  value={apiModel}
                  onChange={(e) => setApiModel(e.target.value)}
                  placeholder={apiProvider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'}
                  className="w-full py-3 px-4 rounded-xl glass-input text-xs font-bold text-white placeholder:text-slate-700 outline-none"
                />
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-extrabold uppercase text-slate-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-partner" />
                  Khóa API (API Key)
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    required
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Nhập khóa API bảo mật..."
                    className="w-full py-3 pl-4 pr-12 rounded-xl glass-input text-xs font-bold text-white placeholder:text-slate-700 outline-none tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 transition-all cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[8px] text-slate-500 font-bold leading-normal">
                  Chỉ lưu an toàn trên máy chủ. Khóa API được mã hóa bảo mật tối đa và hoàn toàn không bao giờ rò rỉ ra phía trình duyệt khách (Client-side).
                </p>
              </div>

              {/* Success message */}
              {apiSuccessMsg && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl p-3 text-xs animate-fadeIn font-bold">
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                  <span>Cập nhật cấu hình API AI thành công!</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={savingApi}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-host to-partner text-white font-extrabold text-xs uppercase tracking-wider hover:opacity-90 hover:scale-[1.01] shadow-xl shadow-host/10 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingApi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang lưu cấu hình...
                  </>
                ) : 'Lưu cấu hình API'}
              </button>
            </form>
          </div>
        )}

      </main>

      {/* SYSTEM SESSION DETAILED VIEW MODAL */}
      {viewingSession && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-fadeIn">
          <div className="w-full max-w-4xl h-[90vh] glass-panel rounded-3xl p-5 md:p-8 flex flex-col relative overflow-hidden max-h-[750px] shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/5 shrink-0">
              <div className="flex-1 mr-4 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base md:text-lg font-black text-white leading-none truncate max-w-xs md:max-w-md">
                    {viewingSession.name}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-host/10 border border-host/15 text-host">
                    {viewingSession.username || 'Khách'}
                  </span>
                </div>
                
                <p className="text-[10px] text-slate-400 mt-2 font-bold flex items-center gap-3">
                  <span>Khởi tạo: {new Date(viewingSession.started_at).toLocaleString('vi-VN')}</span>
                  <span>Ngôn ngữ đối tác: {PARTNER_LANGUAGES.find(l => l.code === viewingSession.partner_language)?.name}</span>
                </p>
              </div>

              {/* Action triggers */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleExportPDF}
                  className="p-2.5 rounded-xl border border-partner/20 bg-partner/5 hover:bg-partner/10 text-partner transition-all cursor-pointer flex items-center gap-1 text-xs font-bold"
                  title="Xuất file PDF"
                >
                  <FileText className="w-4 h-4" />
                  <span className="hidden sm:inline">Xuất PDF</span>
                </button>
                
                <button
                  onClick={() => handleDeleteSession(viewingSession.id)}
                  className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer"
                  title="Xóa vĩnh viễn"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setViewingSession(null)}
                  className="p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Dialog columns */}
            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1 min-h-0">
              {sessionEntries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                  <Volume2 className="w-10 h-10 text-host mb-2" />
                  <p className="text-xs font-bold text-slate-400">Phiên hội thoại này không có nội dung text</p>
                </div>
              ) : (
                sessionEntries.map((entry) => {
                  const partObj = PARTNER_LANGUAGES.find(l => l.code === viewingSession.partner_language)

                  return (
                    <div 
                      key={entry.id} 
                      className={`flex flex-col p-3.5 rounded-2xl border transition-all ${
                        entry.speaker === 'host' 
                          ? 'bg-host/5 border-host/15 max-w-[90%] mr-auto' 
                          : 'bg-partner/5 border-partner/15 max-w-[90%] ml-auto'
                      }`}
                    >
                      <div className="space-y-1.5">
                        {/* Host Bubble */}
                        <div className="flex items-start gap-1.5">
                          <span className="text-[9px] font-extrabold uppercase text-host tracking-wider min-w-[50px]">Host:</span>
                          <span className="text-xs text-slate-200 font-medium">
                            {entry.speaker === 'host' ? entry.original_text : entry.translated_text}
                          </span>
                        </div>

                        {/* Partner Bubble */}
                        <div className="flex items-start gap-1.5">
                          <span className="text-[9px] font-extrabold uppercase text-partner tracking-wider min-w-[50px]">{partObj?.name}:</span>
                          <span className="text-xs text-slate-300">
                            {entry.speaker === 'partner' ? entry.original_text : entry.translated_text}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
