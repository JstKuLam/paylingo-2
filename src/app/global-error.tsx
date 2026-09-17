'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Home, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import './globals.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    console.error('[Root layout global error]:', error)
  }, [error])

  const handleCacheReset = async () => {
    setIsRecovering(true)
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames.filter((name) => name.startsWith('paylingo-')).map((name) => caches.delete(name))
        )
      }
      sessionStorage.removeItem('pwa_chunk_last_recovery')
      sessionStorage.removeItem('pwa_last_reload')
      window.location.reload()
    } catch (recoveryError: unknown) {
      console.error('Failed to clear application cache:', recoveryError)
      window.location.reload()
    }
  }

  return (
    <html lang="vi" data-theme="dark" className="dark">
      <head>
        <title>Sự cố hệ thống - PayLingo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <main className="error-shell">
          <section className="error-panel">
            <span className="error-icon"><AlertTriangle aria-hidden="true" /></span>
            <p className="eyebrow">Không thể tiếp tục</p>
            <h1>Sự cố hệ thống</h1>
            <p>Hệ thống gặp sự cố ngoài dự kiến. Dữ liệu hội thoại đã lưu trên thiết bị không bị xóa. Hãy thử tải lại phần giao diện này trước.</p>
            <div className="error-actions">
              <button type="button" className="primary-command" onClick={reset}>
                <RefreshCw aria-hidden="true" /> Thử lại
              </button>
              <button type="button" className="secondary-command" onClick={handleCacheReset} disabled={isRecovering}>
                {isRecovering ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                {isRecovering ? 'Đang dọn cache' : 'Dọn cache ứng dụng'}
              </button>
              <button type="button" className="secondary-command" onClick={() => { window.location.href = '/' }}>
                <Home aria-hidden="true" /> Trang chính
              </button>
            </div>
            {error?.digest && <small>Mã lỗi: {error.digest}</small>}
          </section>
        </main>
      </body>
    </html>
  )
}
