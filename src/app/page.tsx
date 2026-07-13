'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, ArrowRight, Loader2, AlertCircle, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/hooks/useTheme'

import PayPayLogo from '@/components/PayPayLogo'

export default function Home() {
  const router = useRouter()
  const { theme, changeTheme } = useTheme()
  const [username, setUsername] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.user_metadata?.username) {
        router.push('/session')
      }
    }
    checkUser()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUsername = username.trim().toLowerCase()
    
    if (!trimmedUsername) {
      setError('Vui lòng nhập tên người dùng')
      return
    }

    if (trimmedUsername.length < 2) {
      setError('Tên người dùng phải có ít nhất 2 ký tự')
      return
    }

    if (!/^[a-zA-Z0-9_À-ỹ\s]+$/.test(trimmedUsername)) {
      setError('Tên người dùng không được chứa ký tự đặc biệt')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Perform anonymous sign-in client-side to persist session instantly
      const { error: authError } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            username: trimmedUsername,
          }
        }
      })

      if (authError) {
        setError('Không thể tham gia: ' + authError.message)
        setIsLoading(false)
        return
      }

      router.push('/session')

    } catch (err: any) {
      setError('Đã xảy ra lỗi kết nối. Vui lòng thử lại.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 relative">
      {/* Decorative Blur Blobs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-host/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 bg-partner/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel rounded-[32px] p-8 md:p-10 relative overflow-hidden">
        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer pointer-events-none rounded-[32px] opacity-40"></div>

        {/* Logo / Header */}
        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <PayPayLogo className="h-16 w-auto text-white mb-4 hover:scale-[1.02] transition-transform duration-300 ease-out cursor-pointer shrink-0" width={180} height={68} />
          <p className="text-slate-400 mt-2 text-sm max-w-xs font-semibold tracking-wide">
            Giải pháp dịch song ngữ hội thoại song song real-time trực tiếp 2 chiều
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center justify-center gap-2">
              <User className="w-3.5 h-3.5 text-host" />
              Tên / Biệt danh của bạn
            </label>
            
            <input
              type="text"
              placeholder="Nhập tên của bạn để tiếp tục..."
              value={username}
              onChange={(e) => {
                setError(null)
                setUsername(e.target.value)
              }}
              disabled={isLoading}
              autoComplete="off"
              className="w-full h-[54px] px-6 rounded-full glass-input text-base font-bold text-white transition-all placeholder:text-slate-600 focus:placeholder:text-slate-700 outline-none text-center border border-white/5 focus:border-host/40"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full py-3 px-5 text-sm animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="font-semibold leading-none">{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className={`w-full h-[54px] px-6 rounded-full font-bold flex items-center justify-center gap-2.5 transition-all duration-200 ease-out active:scale-[0.97] ${
              username.trim() && !isLoading
                ? 'bg-gradient-to-r from-host to-host/80 hover:from-host/90 hover:to-host/70 text-white shadow-lg shadow-host/30 hover:scale-[1.01] cursor-pointer'
                : 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-white" />
                <span>Đang kết nối...</span>
              </>
            ) : (
              <>
                <span>Vào phòng dịch</span>
                <ArrowRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-slate-500 font-medium relative z-10 flex flex-col gap-1">
          <span>Hỗ trợ đàm thoại đa ngôn ngữ với độ trễ tối thiểu.</span>
          <span>Dành cho Host người Việt & đối tác nước ngoài.</span>
          <span className="text-[10px] text-slate-600 font-semibold mt-1">
            Phiên bản v3.0.2 • Cập nhật: 2026-07-13 11:58 (GMT+7)
          </span>
        </div>
      </div>

      {/* Premium Theme Selector Pill */}
      <div className="absolute top-6 right-6 z-50 glass-panel rounded-full p-1 flex items-center gap-1 border border-white/10 shadow-2xl">
        <button
          onClick={() => changeTheme('dark')}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
            theme === 'dark' ? 'bg-host text-white shadow-md scale-105' : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          title="Steel Dark - Giao diện tối kim loại"
        >
          <Moon className="w-4 h-4" />
        </button>
        <button
          onClick={() => changeTheme('light')}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer ${
            theme === 'light' ? 'bg-host text-white shadow-md scale-105' : 'text-slate-500 hover:text-slate-800'
          }`}
          title="Tech Blue Light - Giao diện sáng công nghệ"
        >
          <Sun className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
