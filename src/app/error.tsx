'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Trash2, Home, ArrowLeft } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isRecovering, setIsRecovering] = useState(false)
  const [errorDetails, setErrorDetails] = useState<string>('')

  useEffect(() => {
    // Log the error for developer inspection
    console.error('[Global Error Boundary]:', error)
    if (error) {
      setErrorDetails(`${error.name}: ${error.message}\n\nStack Trace:\n${error.stack || 'No stack trace available.'}`)
    }
  }, [error])

  const handleHardReset = async () => {
    setIsRecovering(true)
    try {
      // 1. Unregister all active Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
      }

      // 2. Wipe out Cache Storage completely
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }

      // 3. Clear localStorage and sessionStorage parameters related to PwaUpdater
      localStorage.removeItem('theme') // Reset theme to default dark to prevent theme loading crashes
      sessionStorage.removeItem('pwa_last_reload')
      sessionStorage.removeItem('pwa_chunk_last_reload')

      // 4. Force hard reload from network with query parameter to bypass HTTP caches
      const cleanUrl = window.location.origin + window.location.pathname + '?clear_cache=' + Date.now()
      window.location.replace(cleanUrl)
    } catch (err: any) {
      console.error('Failed to reset cache:', err)
      window.location.reload()
    }
  }

  return (
    <html lang="vi" className="dark h-full">
      <head>
        <title>Đã xảy ra lỗi - PayLingo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body className="min-h-full flex items-center justify-center p-4 bg-[#09090b] text-[#fafafa] font-sans">
        <div className="w-full max-w-lg bg-zinc-900/60 border border-white/5 rounded-[32px] p-6 md:p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl">
          {/* Ambient light glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>

          {/* Header Icon */}
          <div className="flex flex-col items-center text-center mb-6 relative z-10">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 text-red-400">
              <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
              ĐÃ XẢY RA SỰ CỐ TẢI TRANG
            </h1>
            <p className="text-xs text-zinc-400 mt-2 max-w-xs font-semibold leading-relaxed">
              Trình duyệt gặp lỗi ngoài ý muốn. Điều này thường do xung đột phiên bản cũ trong bộ nhớ đệm (stale cache) hoặc thiết bị thiếu quyền truy cập âm thanh.
            </p>
          </div>

          {/* Actions panel */}
          <div className="space-y-3 relative z-10 mb-6">
            <button
              onClick={() => reset()}
              className="w-full h-[50px] px-6 rounded-full font-bold bg-[#fafafa] text-[#09090b] hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại trang (Thử lại)</span>
            </button>

            <button
              onClick={handleHardReset}
              disabled={isRecovering}
              className="w-full h-[50px] px-6 rounded-full font-bold bg-zinc-800 hover:bg-zinc-700 text-red-400 border border-red-500/10 hover:border-red-500/20 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isRecovering ? 'Đang dọn dẹp...' : 'Sửa lỗi bộ nhớ đệm (Xóa cache & Reload)'}</span>
            </button>

            <button
              onClick={() => window.location.replace('/')}
              className="w-full h-[50px] px-6 rounded-full font-bold bg-transparent hover:bg-white/5 text-zinc-300 border border-white/5 hover:border-white/10 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Home className="w-4 h-4" />
              <span>Quay về Trang chủ</span>
            </button>
          </div>

          {/* Collapsible/Scrollable technical stack details */}
          <div className="relative z-10 border-t border-white/5 pt-4 text-left">
            <details className="group">
              <summary className="text-[10px] font-black uppercase text-zinc-500 group-open:text-zinc-400 cursor-pointer select-none flex items-center justify-between hover:text-zinc-300 transition-colors">
                <span>Chi tiết kỹ thuật (Technical Details)</span>
                <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded transition-transform group-open:rotate-180">Xem</span>
              </summary>
              <div className="mt-3 bg-black/40 rounded-2xl p-4 border border-white/5 font-mono text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap max-h-[180px] leading-relaxed">
                {errorDetails || 'Không có thêm thông tin chi tiết.'}
              </div>
            </details>
          </div>

          <div className="mt-6 text-center text-[9px] text-zinc-600 font-extrabold tracking-widest uppercase">
            PayLingo Auto-Recovery Utility
          </div>
        </div>
      </body>
    </html>
  )
}
