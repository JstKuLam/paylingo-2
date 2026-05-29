'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User, Languages, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function Home() {
  const router = useRouter()
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

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 md:p-10 relative overflow-hidden">
        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer pointer-events-none rounded-3xl opacity-40"></div>

        {/* Logo / Header */}
        <div className="flex flex-col items-center text-center mb-8 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-host to-partner flex items-center justify-center shadow-lg shadow-host/20 mb-4 animate-pulse-glowing">
            <Languages className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            PayLingo
          </h1>
          <p className="text-slate-400 mt-2 text-sm max-w-xs font-medium">
            Giải pháp dịch song ngữ hội thoại song song real-time trực tiếp 2 chiều
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
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
              className="w-full py-4 px-5 rounded-xl glass-input text-base font-bold text-white transition-all placeholder:text-slate-600 focus:placeholder:text-slate-700 outline-none text-center"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-sm animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className={`w-full py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all duration-300 ${
              username.trim() && !isLoading
                ? 'bg-gradient-to-r from-host to-host/80 hover:from-host/90 hover:to-host/70 text-white shadow-lg shadow-host/30 hover:scale-[1.02] cursor-pointer'
                : 'bg-white/5 border border-white/10 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang kết nối...
              </>
            ) : (
              <>
                Vào phòng dịch
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 text-center text-xs text-slate-500 font-medium relative z-10 flex flex-col gap-1">
          <span>Hỗ trợ đàm thoại đa ngôn ngữ với độ trễ tối thiểu.</span>
          <span>Dành cho Host người Việt & đối tác nước ngoài.</span>
        </div>
      </div>
    </div>
  )
}
