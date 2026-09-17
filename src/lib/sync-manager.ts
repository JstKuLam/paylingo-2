import { claimLegacyLocalData, db } from './db'
import { authClient } from './auth-client'
import { stringToUUID } from './soniox-parser'

/**
 * Sweeps the local IndexedDB and pushes all 'pending' folders, sessions and transcript entries to Cloudflare D1 via /api/sync.
 * Handles network connection checking and error states gracefully.
 */
export async function syncPendingData(): Promise<{ success: boolean; syncedFolders?: number; syncedSessions: number; syncedEntries: number; error?: string }> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedFolders: 0, syncedSessions: 0, syncedEntries: 0, error: 'Offline' }
  }

  const { data: { session } } = await authClient.getSession()

  const ownerId = session?.user?.id
  const username = session?.user?.user_metadata?.username ||
                   session?.user?.user_metadata?.full_name ||
                   session?.user?.user_metadata?.name ||
                   session?.user?.email?.split('@')[0]
  const legacyUsername = session?.user?.email?.split('@')[0]
  if (!session || !username || !legacyUsername || !ownerId) {
    return { success: false, syncedFolders: 0, syncedSessions: 0, syncedEntries: 0, error: 'Unauthenticated' }
  }
  let syncedFolders = 0
  let syncedSessions = 0
  let syncedEntries = 0

  try {
    // Claim only ownerless legacy records that already match this trusted account name.
    await claimLegacyLocalData(ownerId, legacyUsername)

    const allSessions = await db.sessions.where('owner_id').equals(ownerId).toArray()
    for (const sessionRecord of allSessions) {
      if (sessionRecord.sync_status === 'failed') {
        await db.sessions.update(sessionRecord.id, { sync_status: 'pending' })
      }
    }

    const allFolders = await db.folders.where('owner_id').equals(ownerId).toArray()
    for (const folder of allFolders) {
      if (folder.sync_status === 'failed') {
        await db.folders.update(folder.id, { sync_status: 'pending' })
      }
    }

    // 0. Prepare pending/failed folders
    const pendingFolders = await db.folders.where('sync_status').anyOf(['pending', 'failed']).toArray()
    const ownedFolders = pendingFolders.filter((folder) => folder.owner_id === ownerId)

    // 1. Prepare pending/failed sessions
    const pendingSessions = await db.sessions.where('sync_status').anyOf(['pending', 'failed']).toArray()
    const ownedSessions = pendingSessions.filter((localSession) => localSession.owner_id === ownerId)

    // 2. Prepare pending/failed transcript entries
    const pendingEntries = await db.transcriptEntries.where('sync_status').anyOf(['pending', 'failed']).toArray()
    const sessionIds = Array.from(new Set(pendingEntries.map(e => e.session_id)))
    const verifiedSessionIds = new Set<string>()
    for (const sessId of sessionIds) {
      const localSess = await db.sessions.get(sessId)
      if (localSess?.owner_id === ownerId) {
        verifiedSessionIds.add(sessId)
      }
    }
    const safeEntries = pendingEntries.filter(entry => verifiedSessionIds.has(entry.session_id))

    if (ownedFolders.length === 0 && ownedSessions.length === 0 && safeEntries.length === 0) {
      return { success: true, syncedFolders: 0, syncedSessions: 0, syncedEntries: 0 }
    }

    // Normalized transcript entries with valid UUID
    const normalizedEntries = safeEntries.map(entry => {
      const entryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)
        ? entry.id
        : stringToUUID(entry.id)
      return {
        id: entryId,
        session_id: entry.session_id,
        speaker: entry.speaker,
        original_text: entry.original_text,
        translated_text: entry.translated_text,
        start_ms: entry.start_ms,
        end_ms: entry.end_ms,
        created_at: entry.created_at
      }
    })

    // Dispatch batch sync request to /api/sync
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folders: ownedFolders.map(f => ({
          id: f.id,
          name: f.name,
          username: f.username,
          created_at: f.created_at,
          updated_at: f.updated_at
        })),
        sessions: ownedSessions.map(s => ({
          id: s.id,
          name: s.name,
          username: s.username,
          folder_id: s.folder_id || null,
          partner_language: s.partner_language,
          started_at: s.started_at,
          ended_at: s.ended_at,
          duration_seconds: s.duration_seconds,
          updated_at: s.updated_at
        })),
        entries: normalizedEntries
      })
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Sync API error ${res.status}`)
    }

    await res.json()

    // Mark folders as synced
    if (ownedFolders.length > 0) {
      await db.folders.bulkUpdate(
        ownedFolders.map(folder => ({ key: folder.id, changes: { sync_status: 'synced' as const } }))
      )
      syncedFolders = ownedFolders.length
    }

    // Mark sessions as synced
    if (ownedSessions.length > 0) {
      await db.sessions.bulkUpdate(
        ownedSessions.map(session => ({ key: session.id, changes: { sync_status: 'synced' as const } }))
      )
      syncedSessions = ownedSessions.length
    }

    // Mark entries as synced
    if (safeEntries.length > 0) {
      for (const entry of safeEntries) {
        const entryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)
          ? entry.id
          : stringToUUID(entry.id)
        if (entryId !== entry.id) {
          await db.transcriptEntries.delete(entry.id)
          await db.transcriptEntries.put({
            ...entry,
            id: entryId,
            sync_status: 'synced',
            updated_at: new Date().toISOString()
          })
        } else {
          await db.transcriptEntries.update(entry.id, { sync_status: 'synced' })
        }
      }
      syncedEntries = safeEntries.length
    }

    return { success: true, syncedFolders, syncedSessions, syncedEntries }
  } catch (error: unknown) {
    console.error('Background sync failed:', error)
    return {
      success: false,
      syncedFolders,
      syncedSessions,
      syncedEntries,
      error: error instanceof Error ? error.message : 'Unknown sync error'
    }
  }
}

/**
 * Initializes automatic background synchronization listeners.
 */
let stopAutoSync: (() => void) | null = null
let autoSyncRefCount = 0

export function initAutoSync() {
  if (typeof window === 'undefined') return () => undefined
  autoSyncRefCount++

  if (!stopAutoSync) {
    const handleOnline = () => void syncPendingData()
    window.addEventListener('online', handleOnline)

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        void syncPendingData()
      }
    }, 15000)

    stopAutoSync = () => {
      window.removeEventListener('online', handleOnline)
      window.clearInterval(intervalId)
      stopAutoSync = null
    }
  }

  return () => {
    autoSyncRefCount = Math.max(0, autoSyncRefCount - 1)
    if (autoSyncRefCount === 0 && stopAutoSync) {
      stopAutoSync()
    }
  }
}
