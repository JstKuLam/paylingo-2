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
  FileText,
  AlertTriangle,
  Lock,
  UserCheck,
  X,
  Volume2,
  Users
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { downloadSessionPDF } from '@/lib/pdf-generator'

const PARTNER_LANGUAGES = [
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
  const [activeTab, setActiveTab] = useState<'users' | 'sessions' | 'stats'>('users')

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
        let cost = totalMin * 0.002 // $0.12 per hour is $0.002 per minute
        
        const uniqueUsernames = Array.from(new Set(sessionsData.map(s => s.username).filter(Boolean)))

        setStats({
          totalMinutes: totalMin,
          estimatedCost: cost,
          activeUsersCount: uniqueUsernames.length
        })
      }
    } catch (err: any) {
      console.error(err)
      setLoadingSessions(false)
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
    <div className="min-h-screen w-full flex flex-col p-4 relative overflow-hidden bg-background">
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-host/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header Admin Dashboard */}
      <header className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between py-3.5 px-5 glass-panel rounded-2xl mb-4 relative z-20 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-host to-partner flex items-center justify-center shadow-lg">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">Bản quản trị PayLingo</h1>
            <p className="text-[10px] text-slate-400 mt-1 font-semibold">
              Điều hành người dùng, lịch sử và chi phí API
            </p>
          </div>
        </div>

        {/* Tab switch navigation */}
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'users' ? 'bg-host text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Người dùng
          </button>
          
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'sessions' ? 'bg-host text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Lịch sử cuộc gọi
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
              activeTab === 'stats' ? 'bg-host text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Thống kê
          </button>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-white/5 text-red-400 hover:text-red-300 transition-all cursor-pointer ml-1"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full relative z-10 overflow-y-auto min-h-0">
        
        {/* TAB 1: USERS LIST */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            
            {/* Users List Table */}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-3 px-4">Tên người dùng (Username)</th>
                      <th className="py-3 px-4">Số lượng hội thoại</th>
                      <th className="py-3 px-4">Tổng số phút đàm thoại</th>
                      <th className="py-3 px-4">Hoạt động gần nhất</th>
                      <th className="py-3 px-4 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-bold">
                          Chưa có người dùng nào sử dụng hệ thống
                        </td>
                      </tr>
                    ) : (
                      usersList.map((usr) => (
                        <tr key={usr.username} className="border-b border-white/5 hover:bg-white/[0.01]">
                          <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-host/15 text-host flex items-center justify-center font-extrabold text-[10px]">👤</span>
                            {usr.username}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-300">{usr.totalSessions} Phiên</td>
                          <td className="py-3.5 px-4 font-extrabold text-partner">{usr.totalMinutes} Phút</td>
                          <td className="py-3.5 px-4 text-slate-400">{new Date(usr.lastActive).toLocaleString('vi-VN')}</td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleViewUserSessions(usr.username)}
                              className="py-1 px-3 rounded-lg border border-host/20 bg-host/5 hover:bg-host/10 text-host transition-all cursor-pointer font-bold text-[10px] uppercase"
                            >
                              Xem hội thoại
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
                className="w-full py-3 pl-11 pr-4 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            {/* Sessions Table */}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                      <th className="py-3 px-4">Username</th>
                      <th className="py-3 px-4">Tên hội thoại</th>
                      <th className="py-3 px-4">Ngôn ngữ đối tác</th>
                      <th className="py-3 px-4">Thời lượng</th>
                      <th className="py-3 px-4">Ngày đàm thoại</th>
                      <th className="py-3 px-4 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSessions ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          <Loader2 className="w-6 h-6 animate-spin text-host mx-auto" />
                        </td>
                      </tr>
                    ) : filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 font-bold">
                          Không tìm thấy cuộc hội thoại nào
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((sess) => {
                        const min = Math.floor(sess.duration_seconds / 60)
                        const sec = sess.duration_seconds % 60
                        const langObj = PARTNER_LANGUAGES.find(l => l.code === sess.partner_language)

                        return (
                          <tr key={sess.id} className="border-b border-white/5 hover:bg-white/[0.01]">
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-0.5 rounded bg-host/10 text-host border border-host/15 font-bold uppercase text-[9px] tracking-wider">
                                {sess.username || 'Khách'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-white truncate max-w-[150px]">{sess.name}</td>
                            <td className="py-3.5 px-4"><span className="text-xs mr-1">{langObj?.flag}</span>{langObj?.name || sess.partner_language}</td>
                            <td className="py-3.5 px-4 font-medium text-slate-300">{min}p {sec}s</td>
                            <td className="py-3.5 px-4 text-slate-400">{new Date(sess.started_at).toLocaleString('vi-VN')}</td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => handleOpenSession(sess)}
                                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-300 transition-all cursor-pointer"
                                title="Xem chi tiết"
                              >
                                <Eye className="w-3.5 h-3.5" />
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

        {/* TAB 3: SYSTEM STATISTICS */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Stat Card 1 */}
            <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Thời lượng dùng</span>
                <h3 className="text-2xl font-black text-white mt-1">{stats.totalMinutes} Phút</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Tổng cộng các cuộc đàm thoại</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-host/10 border border-host/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-host" />
              </div>
            </div>

            {/* Stat Card 2 */}
            <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Số người dùng</span>
                <h3 className="text-2xl font-black text-white mt-1">{stats.activeUsersCount} Users</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Đã tham gia dịch trên hệ thống</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-partner/10 border border-partner/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-partner" />
              </div>
            </div>

            {/* Stat Card 3 */}
            <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Ước tính phí Soniox</span>
                <h3 className="text-2xl font-black text-green-400 mt-1">${stats.estimatedCost.toFixed(3)}</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Dựa trên $0.12/giờ đàm thoại</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
            </div>

            {/* Billing rate info card */}
            <div className="sm:col-span-3 glass-panel rounded-2xl p-5 flex items-start gap-3 border-l-4 border-host/50">
              <TrendingUp className="w-5 h-5 text-host mt-0.5 shrink-0" />
              <div className="text-slate-300 text-xs leading-relaxed space-y-1">
                <p className="font-extrabold text-white">Cách tính chi phí Soniox API v4:</p>
                <p>Chi phí truyền nhận âm thanh và dịch song ngữ trực tuyến trên mô hình Soniox `stt-rt-v4` là <strong>$0.12 một giờ</strong>.</p>
                <p>Tương ứng với khoảng <strong>$0.002 một phút</strong>. Hệ thống tính tiền theo số phút thực tế đã kích hoạt ghi âm.</p>
              </div>
            </div>

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
