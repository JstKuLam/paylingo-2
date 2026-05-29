import { db, LocalSession, LocalTranscriptEntry } from './db'
import { createClient } from './supabase/client'

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

  const username = session?.user?.user_metadata?.username
  if (!session || !username) {
    return { success: false, syncedFolders: 0, syncedSessions: 0, syncedEntries: 0, error: 'Unauthenticated' }
  }
  let syncedFolders = 0
  let syncedSessions = 0
  let syncedEntries = 0

  try {
    // 0. Sync pending folders
    const pendingFolders = await db.folders.where('sync_status').equals('pending').toArray()

    for (const localFolder of pendingFolders) {
      if (localFolder.username !== username) continue

      const { error: folderError } = await supabase
        .from('folders')
        .upsert({
          id: localFolder.id,
          username: localFolder.username,
          name: localFolder.name,
          created_at: localFolder.created_at,
          updated_at: localFolder.updated_at
        })

      if (!folderError) {
        await db.folders.update(localFolder.id, { sync_status: 'synced' })
        syncedFolders++
      } else {
        console.error(`Failed to sync folder ${localFolder.id}:`, folderError.message)
        await db.folders.update(localFolder.id, { sync_status: 'failed' })
      }
    }

    // 1. Sync pending sessions
    const pendingSessions = await db.sessions.where('sync_status').equals('pending').toArray()

    for (const localSess of pendingSessions) {
      // Security check: ensure session belongs to the currently logged in username
      if (localSess.username !== username) continue

      // Map to Supabase sessions format
      const { error: sessError } = await supabase
        .from('sessions')
        .upsert({
          id: localSess.id,
          username: localSess.username,
          folder_id: localSess.folder_id || null,
          name: localSess.name,
          partner_language: localSess.partner_language,
          started_at: localSess.started_at,
          ended_at: localSess.ended_at,
          duration_seconds: localSess.duration_seconds
        })

      if (!sessError) {
        await db.sessions.update(localSess.id, { sync_status: 'synced' })
        syncedSessions++
      } else {
        console.error(`Failed to sync session ${localSess.id}:`, sessError.message)
        await db.sessions.update(localSess.id, { sync_status: 'failed' })
      }
    }

    // 2. Sync pending transcript entries
    const pendingEntries = await db.transcriptEntries.where('sync_status').equals('pending').toArray()

    if (pendingEntries.length > 0) {
      // Group entries by session to verify RLS safety
      const sessionIds = Array.from(new Set(pendingEntries.map(e => e.session_id)))
      
      // Load local sessions for verification
      const verifiedSessionIds = new Set<string>()
      for (const sessId of sessionIds) {
        const localSess = await db.sessions.get(sessId)
        if (localSess && localSess.username === username) {
          verifiedSessionIds.add(sessId)
        }
      }

      // Filter entries that belong to verified sessions
      const safeEntries = pendingEntries.filter(entry => verifiedSessionIds.has(entry.session_id))

      if (safeEntries.length > 0) {
        const supaEntries = safeEntries.map(entry => ({
          id: entry.id,
          session_id: entry.session_id,
          speaker: entry.speaker,
          original_text: entry.original_text,
          translated_text: entry.translated_text,
          start_ms: entry.start_ms,
          end_ms: entry.end_ms,
          created_at: entry.created_at
        }))

        // Push all in one batch upsert
        const { error: entriesError } = await supabase
          .from('transcript_entries')
          .upsert(supaEntries)

        if (!entriesError) {
          // Mark all safe entries as synced in local DB
          const entryIds = safeEntries.map(e => e.id)
          await db.transcriptEntries.where('id').anyOf(entryIds).modify({ sync_status: 'synced' })
          syncedEntries += safeEntries.length
        } else {
          console.error('Failed to sync transcript entries batch:', entriesError.message)
          // Fallback to updating individually on failures to sync what is possible
          for (const entry of safeEntries) {
            const { error: singleError } = await supabase
              .from('transcript_entries')
              .upsert({
                id: entry.id,
                session_id: entry.session_id,
                speaker: entry.speaker,
                original_text: entry.original_text,
                translated_text: entry.translated_text,
                start_ms: entry.start_ms,
                end_ms: entry.end_ms,
                created_at: entry.created_at
              })

            if (!singleError) {
              await db.transcriptEntries.update(entry.id, { sync_status: 'synced' })
              syncedEntries++
            } else {
              await db.transcriptEntries.update(entry.id, { sync_status: 'failed' })
            }
          }
        }
      }
    }

    return { success: true, syncedFolders, syncedSessions, syncedEntries }
  } catch (error: any) {
    return { success: false, syncedFolders, syncedSessions, syncedEntries, error: error.message }
  }
}

/**
 * Initializes automatic background synchronization listeners.
 */
export function initAutoSync() {
  if (typeof window === 'undefined') return

  // Sync when coming online
  window.addEventListener('online', () => {
    syncPendingData()
  })

  // Periodic check every 15 seconds if online
  setInterval(() => {
    if (navigator.onLine) {
      syncPendingData()
    }
  }, 15000)
}
