'use client'

import { useEffect } from 'react'

export default function PwaUpdater() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Helper function to unregister service workers, clear caches and reload
      const recoverFromCacheStaleness = async () => {
        try {
          console.warn('[PWA] Stale assets or crash detected. Cleaning PWA caches and reloads...')
          
          // 1. Unregister all service workers
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations()
            for (const registration of registrations) {
              await registration.unregister()
            }
          }
          
          // 2. Clear all cache storage keys
          if ('caches' in window) {
            const cacheNames = await caches.keys()
            await Promise.all(cacheNames.map(name => caches.delete(name)))
          }

          // 3. Clear sessionStorage reload trackers
          sessionStorage.removeItem('pwa_last_reload')
          sessionStorage.removeItem('pwa_chunk_last_reload')
          
          // 4. Force reload with cache-busting query parameter
          const cleanUrl = window.location.origin + window.location.pathname + '?clear_cache=' + Date.now()
          window.location.replace(cleanUrl)
        } catch (err) {
          console.error('[PWA] Failed to self-recover:', err)
          window.location.reload()
        }
      }

      // 1. Manually register our custom Network-Only service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('[PWA] Service Worker registered successfully on scope:', registration.scope)
            
            // Listen for updates to the service worker
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New service worker has installed and is ready to take control.
                    // Force refresh to get the latest client files.
                    recoverFromCacheStaleness()
                  }
                })
              }
            })
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error)
          })

        // Listen for new service worker taking control
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          const lastReload = sessionStorage.getItem('pwa_last_reload')
          const now = Date.now()
          if (!lastReload || now - parseInt(lastReload) > 5000) {
            sessionStorage.setItem('pwa_last_reload', now.toString())
            window.location.reload()
          }
        })
      }

      // 2. Catch Next.js ChunkLoadErrors and failed imports
      const handleGlobalError = (event: ErrorEvent) => {
        const errorMsg = event.message || ''
        const errorStack = event.error?.stack || ''
        const isChunkError = 
          errorMsg.includes('Loading chunk') || 
          errorMsg.includes('ChunkLoadError') ||
          errorMsg.includes('loading failed') ||
          errorMsg.toLowerCase().includes('failed to fetch') ||
          errorStack.includes('ChunkLoadError') ||
          errorStack.includes('Failed to fetch dynamically imported module')

        if (isChunkError) {
          event.preventDefault()
          recoverFromCacheStaleness()
        }
      }

      // 3. Catch unhandled promise rejections (often how chunk import failures present)
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason
        const reasonStr = String(reason || '')
        const reasonStack = reason?.stack || ''
        
        const isChunkError = 
          reasonStr.includes('ChunkLoadError') ||
          reasonStr.includes('Loading chunk') ||
          reasonStr.includes('failed to fetch') ||
          reasonStr.toLowerCase().includes('failed to fetch dynamically imported module') ||
          reasonStack.includes('ChunkLoadError') ||
          reasonStack.includes('Failed to fetch dynamically imported module')

        if (isChunkError) {
          event.preventDefault()
          recoverFromCacheStaleness()
        }
      }

      window.addEventListener('error', handleGlobalError)
      window.addEventListener('unhandledrejection', handleUnhandledRejection)
      
      return () => {
        window.removeEventListener('error', handleGlobalError)
        window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      }
    }
  }, [])

  return null
}
