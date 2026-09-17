'use client'

import { useEffect } from 'react'

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Ignore storage restriction errors in private browsing
  }
}

export default function PwaUpdater() {
  useEffect(() => {
    // Clean up clear_cache query param from URL if present
    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href)
      if (currentUrl.searchParams.has('clear_cache')) {
        currentUrl.searchParams.delete('clear_cache')
        const search = currentUrl.searchParams.toString()
        const newUrl = currentUrl.pathname + (search ? `?${search}` : '') + currentUrl.hash
        window.history.replaceState(null, '', newUrl)
      }
    }

    const recoverFromCacheStaleness = async () => {
      const lastRecovery = Number(safeSessionGet('pwa_chunk_last_recovery') || 0)
      const now = Date.now()
      if (now - lastRecovery < 10_000) {
        console.warn('[PWA] Suppressing chunk recovery loop; last attempt was less than 10s ago')
        return
      }
      safeSessionSet('pwa_chunk_last_recovery', now.toString())

      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations
            .filter((item) => {
              const scriptUrl = item.active?.scriptURL || item.waiting?.scriptURL || item.installing?.scriptURL
              return scriptUrl ? new URL(scriptUrl).pathname === '/sw.js' : false
            })
            .map((item) => item.unregister())
        )

        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('paylingo-'))
            .map((cacheName) => caches.delete(cacheName))
        )

        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.set('clear_cache', Date.now().toString())
        window.location.replace(cleanUrl)
      } catch (error) {
        console.error('[PWA] Failed to self-recover:', error)
        window.location.reload()
      }
    }

    const handleControllerChange = () => {
      const lastReload = Number(safeSessionGet('pwa_last_reload') || 0)
      const now = Date.now()
      if (now - lastReload > 5_000) {
        safeSessionSet('pwa_last_reload', now.toString())
        window.location.reload()
      }
    }

    const handleGlobalError = (event: ErrorEvent) => {
      const errorMessage = event.message || ''
      const errorStack = event.error?.stack || ''
      const isChunkError =
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('ChunkLoadError') ||
        errorStack.includes('ChunkLoadError') ||
        errorStack.includes('Failed to fetch dynamically imported module')

      if (isChunkError) {
        event.preventDefault()
        void recoverFromCacheStaleness()
      }
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const reasonText = String(reason || '')
      const reasonStack = reason instanceof Error ? reason.stack || '' : ''
      const isChunkError =
        reasonText.includes('ChunkLoadError') ||
        reasonText.includes('Loading chunk') ||
        reasonStack.includes('ChunkLoadError') ||
        reasonStack.includes('Failed to fetch dynamically imported module')

      if (isChunkError) {
        event.preventDefault()
        void recoverFromCacheStaleness()
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      void navigator.serviceWorker.register('/sw.js')
        .catch((error) => console.error('[PWA] Service Worker registration failed:', error))
    }

    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange)
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
