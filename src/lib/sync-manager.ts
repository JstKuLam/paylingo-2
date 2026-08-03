import { claimLegacyLocalData, db } from './db'
import { createClient } from './supabase/client'
import { stringToUUID } from './soniox-parser'

/**
 * Sweeps the local IndexedDB and pushes all 'pending' sessions and transcript entries to Supabase.
 * Handles network connection checking and error states gracefully.
 */
export async function syncPendingData(): Promise<{ success: boolean; syncedFolders?: number; syncedSessions: number; syncedEntries: number; error?: string }> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedFolders: 0, syncedSessions: 0, syncedEntries: 0, error: 'Offline' }
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

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
    // A non-null owner is immutable here so shared browsers cannot transfer another user's data.
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

    // 0. Sync pending/failed folders
    const pendingFolders = await db.folders.where('sync_status').anyOf(['pending', 'failed']).toArray()
    const ownedFolders = pendingFolders.filter((folder) => folder.owner_id === ownerId)

    if (ownedFolders.length > 0) {
      const { error: folderError } = await supabase
        .from('folders')
        .upsert(ownedFolders.map((folder) => ({
          id: folder.id,
          owner_id: ownerId,
          username: folder.username,
          name: folder.name,
          created_at: folder.created_at,
          updated_at: folder.updated_at
        })))

      if (!folderError) {
        await db.folders.bulkUpdate(
          ownedFolders.map((folder) => ({ key: folder.id, changes: { owner_id: ownerId, sync_status: 'synced' as const } }))
        )
        syncedFolders = ownedFolders.length
      } else {
        console.error('Failed to sync folders:', folderError.message)
        await db.folders.bulkUpdate(
          ownedFolders.map((folder) => ({ key: folder.id, changes: { sync_status: 'failed' as const } }))
        )
      }
    }

    // 1. Sync pending/failed sessions
    const pendingSessions = await db.sessions.where('sync_status').anyOf(['pending', 'failed']).toArray()
    const ownedSessions = pendingSessions.filter((localSession) => localSession.owner_id === ownerId)

    if (ownedSessions.length > 0) {
      const { error: sessError } = await supabase
        .from('sessions')
        .upsert(ownedSessions.map((localSession) => ({
          id: localSession.id,
          owner_id: ownerId,
          username: localSession.username,
          folder_id: localSession.folder_id || null,
          name: localSession.name,
          partner_language: localSession.partner_language,
          started_at: localSession.started_at,
          ended_at: localSession.ended_at,
          duration_seconds: localSession.duration_seconds
        })))

      if (!sessError) {
        await db.sessions.bulkUpdate(
          ownedSessions.map((localSession) => ({
            key: localSession.id,
            changes: { owner_id: ownerId, sync_status: 'synced' as const }
          }))
        )
        syncedSessions = ownedSessions.length
      } else {
        console.error('Failed to sync sessions:', sessError.message)
        await db.sessions.bulkUpdate(
          ownedSessions.map((localSession) => ({ key: localSession.id, changes: { sync_status: 'failed' as const } }))
        )
      }
    }

    // 2. Sync pending/failed transcript entries
    const pendingEntries = await db.transcriptEntries.where('sync_status').anyOf(['pending', 'failed']).toArray()

    if (pendingEntries.length > 0) {
      // Group entries by session to verify RLS safety
      const sessionIds = Array.from(new Set(pendingEntries.map(e => e.session_id)))
      
      // Load local sessions for verification
      const verifiedSessionIds = new Set<string>()
      for (const sessId of sessionIds) {
        const localSess = await db.sessions.get(sessId)
        if (localSess?.owner_id === ownerId) {
          verifiedSessionIds.add(sessId)
        }
      }

      // Filter entries that belong to verified sessions
      const safeEntries = pendingEntries.filter(entry => verifiedSessionIds.has(entry.session_id))

      if (safeEntries.length > 0) {
        const supaEntries = safeEntries.map(entry => {
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

        // Push all in one batch upsert
        const { error: entriesError } = await supabase
          .from('transcript_entries')
          .upsert(supaEntries)

        if (!entriesError) {
          // Mark all safe entries as synced in local DB
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
          syncedEntries += safeEntries.length
        } else {
          console.error('Failed to sync transcript entries batch:', entriesError.message)
          // Fallback to updating individually on failures to sync what is possible
          for (const entry of safeEntries) {
            const entryId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)
              ? entry.id
              : stringToUUID(entry.id)
            const { error: singleError } = await supabase
              .from('transcript_entries')
              .upsert({
                id: entryId,
                session_id: entry.session_id,
                speaker: entry.speaker,
                original_text: entry.original_text,
                translated_text: entry.translated_text,
                start_ms: entry.start_ms,
                end_ms: entry.end_ms,
                created_at: entry.created_at
              })

            if (!singleError) {
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
              syncedEntries++
            } else {
              await db.transcriptEntries.update(entry.id, { sync_status: 'failed' })
            }
          }
        }
      }
    }

    return { success: true, syncedFolders, syncedSessions, syncedEntries }
  } catch (error: unknown) {
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

export function initAutoSync() {
  if (typeof window === 'undefined') return () => undefined
  if (stopAutoSync) return stopAutoSync

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
  return stopAutoSync
}
