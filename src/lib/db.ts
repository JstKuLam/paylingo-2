import Dexie, { Table } from 'dexie'
import { stringToUUID } from './soniox-parser'

export interface LocalFolder {
  id: string
  owner_id?: string
  username: string
  name: string
  created_at: string
  updated_at: string
  sync_status: 'synced' | 'pending' | 'failed'
}

export interface LocalSession {
  id: string
  owner_id?: string
  username: string
  folder_id?: string | null
  name: string
  partner_language: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  sync_status: 'synced' | 'pending' | 'failed'
  updated_at: string
}

export interface LocalTranscriptEntry {
  id: string
  session_id: string
  speaker: 'host' | 'partner'
  speaker_label?: string
  original_text: string
  translated_text: string
  start_ms: number
  end_ms: number
  created_at: string
  sync_status: 'synced' | 'pending' | 'failed'
  updated_at: string
}

class PayLingoDatabase extends Dexie {
  sessions!: Table<LocalSession>
  transcriptEntries!: Table<LocalTranscriptEntry>
  folders!: Table<LocalFolder>

  constructor() {
    super('PayLingoDatabase')
    
    // Schema definition. Index columns are specified inside the versions store list.
    this.version(1).stores({
      sessions: 'id, username, started_at, sync_status, updated_at',
      transcriptEntries: 'id, session_id, [session_id+start_ms], sync_status, updated_at'
    })

    this.version(2).stores({
      sessions: 'id, username, folder_id, started_at, sync_status, updated_at',
      transcriptEntries: 'id, session_id, [session_id+start_ms], sync_status, updated_at',
      folders: 'id, username, sync_status, updated_at'
    })

    this.version(3).stores({
      sessions: 'id, owner_id, username, folder_id, started_at, sync_status, updated_at',
      transcriptEntries: 'id, session_id, [session_id+start_ms], sync_status, updated_at',
      folders: 'id, owner_id, username, sync_status, updated_at'
    }).upgrade(async (tx) => {
      // Safe schema migration: ensure sync_status is valid on legacy records
      await tx.table('sessions').toCollection().modify((session) => {
        if (!session.sync_status) session.sync_status = 'synced'
      })
      await tx.table('folders').toCollection().modify((folder) => {
        if (!folder.sync_status) folder.sync_status = 'synced'
      })
      await tx.table('transcriptEntries').toCollection().modify((entry) => {
        if (!entry.sync_status) entry.sync_status = 'synced'
      })
    })

    this.version(4).stores({
      sessions: 'id, owner_id, [owner_id+started_at], username, folder_id, started_at, sync_status, updated_at',
      transcriptEntries: 'id, session_id, [session_id+start_ms], sync_status, updated_at',
      folders: 'id, owner_id, username, sync_status, updated_at'
    }).upgrade(async (tx) => {
      // Validate duration_seconds and transcript ranges on upgraded records
      await tx.table('sessions').toCollection().modify((session) => {
        if (typeof session.duration_seconds !== 'number' || isNaN(session.duration_seconds) || session.duration_seconds < 0) {
          session.duration_seconds = 0
        }
        if (!session.sync_status || !['synced', 'pending', 'failed'].includes(session.sync_status)) {
          session.sync_status = 'synced'
        }
      })
      await tx.table('transcriptEntries').toCollection().modify((entry) => {
        if (typeof entry.start_ms !== 'number' || isNaN(entry.start_ms) || entry.start_ms < 0) {
          entry.start_ms = 0
        }
        if (typeof entry.end_ms !== 'number' || isNaN(entry.end_ms) || entry.end_ms < entry.start_ms) {
          entry.end_ms = entry.start_ms
        }
        if (!entry.sync_status || !['synced', 'pending', 'failed'].includes(entry.sync_status)) {
          entry.sync_status = 'synced'
        }
      })
    })
  }
}

export const db = new PayLingoDatabase()

let hasPurgedDemoData = false
const claimedOwnerKeys = new Set<string>()

export async function purgeLegacyDemoData() {
  if (typeof window === 'undefined' || hasPurgedDemoData) return
  hasPurgedDemoData = true
  try {
    localStorage.removeItem('paylingo_demo_active')
    localStorage.removeItem('paylingo_demo_email')
  } catch {}
  if (typeof indexedDB === 'undefined') return
  try {
    await db.transaction('rw', db.sessions, db.folders, db.transcriptEntries, async () => {
      const demoSessions = await db.sessions
        .filter((s) => s.id.startsWith('sess-demo-') || s.owner_id === 'demo-owner-kulam')
        .primaryKeys()
      if (demoSessions.length > 0) {
        await db.sessions.bulkDelete(demoSessions)
        await db.transcriptEntries.where('session_id').anyOf(demoSessions).delete()
      }
      const demoFolders = await db.folders
        .filter(
          (f) =>
            f.id === 'folder-paypay-q4' ||
            f.id === 'folder-security-audit' ||
            f.owner_id === 'demo-owner-kulam'
        )
        .primaryKeys()
      if (demoFolders.length > 0) {
        await db.folders.bulkDelete(demoFolders)
      }
    })
  } catch {}
}

export async function claimLegacyLocalData(ownerId: string, username: string) {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined' || !ownerId || !username) return
  await purgeLegacyDemoData()
  const cleanUsername = username.trim().toLowerCase()
  if (!cleanUsername) return
  const claimKey = `${ownerId}:${cleanUsername}`
  if (claimedOwnerKeys.has(claimKey)) return
  claimedOwnerKeys.add(claimKey)

  try {
    await db.transaction('rw', db.sessions, db.folders, async () => {
      const allSessions = await db.sessions.toArray()
      const allFolders = await db.folders.toArray()

      const legacySessions = allSessions.filter(
        (session) => !session.owner_id && session.username?.trim().toLowerCase() === cleanUsername
      )
      const legacyFolders = allFolders.filter(
        (folder) => !folder.owner_id && folder.username?.trim().toLowerCase() === cleanUsername
      )

      for (const session of legacySessions) {
        await db.sessions.update(session.id, { owner_id: ownerId, sync_status: 'pending' })
      }
      for (const folder of legacyFolders) {
        await db.folders.update(folder.id, { owner_id: ownerId, sync_status: 'pending' })
      }
    })
  } catch (err) {
    console.warn('Failed to claim legacy local data:', err)
  }
}

export async function rekeyLocalDataOwner(oldOwnerId: string, newOwnerId: string) {
  if (
    typeof window === 'undefined' ||
    typeof indexedDB === 'undefined' ||
    !oldOwnerId ||
    !newOwnerId ||
    oldOwnerId === newOwnerId
  ) {
    return
  }
  try {
    const now = new Date().toISOString()
    await db.transaction('rw', db.sessions, db.folders, db.transcriptEntries, async () => {
      const folderIdMap = new Map<string, string>()
      const oldFolders = await db.folders.where('owner_id').equals(oldOwnerId).toArray()
      for (const folder of oldFolders) {
        const newFolderId = stringToUUID(`${newOwnerId}:folder:${folder.id}`)
        folderIdMap.set(folder.id, newFolderId)
        await db.folders.delete(folder.id)
        await db.folders.put({
          ...folder,
          id: newFolderId,
          owner_id: newOwnerId,
          sync_status: 'pending',
          updated_at: now,
        })
      }

      const oldSessions = await db.sessions.where('owner_id').equals(oldOwnerId).toArray()
      for (const session of oldSessions) {
        const mappedFolderId = session.folder_id
          ? folderIdMap.get(session.folder_id) ?? null
          : null
        if (!session.ended_at) {
          // Active in-progress recording session: update owner_id in place without changing primary key id
          // so useSessionLifecycle's activeSessionRef continues writing entries to this session seamlessly.
          await db.sessions.update(session.id, {
            owner_id: newOwnerId,
            folder_id: mappedFolderId,
            sync_status: 'pending',
            updated_at: now,
          })
          continue
        }
        const newSessionId = stringToUUID(`${newOwnerId}:session:${session.id}`)
        const oldEntries = await db.transcriptEntries
          .where('session_id')
          .equals(session.id)
          .toArray()
        if (oldEntries.length > 0) {
          await db.transcriptEntries.where('session_id').equals(session.id).delete()
          await db.transcriptEntries.bulkPut(
            oldEntries.map((entry) => ({
              ...entry,
              id: stringToUUID(`${newSessionId}:${entry.id}`),
              session_id: newSessionId,
              sync_status: 'pending' as const,
              updated_at: now,
            }))
          )
        }
        await db.sessions.delete(session.id)
        await db.sessions.put({
          ...session,
          id: newSessionId,
          folder_id: mappedFolderId,
          owner_id: newOwnerId,
          sync_status: 'pending',
          updated_at: now,
        })
      }
    })
  } catch (err) {
    console.warn('Failed to rekey local data owner:', err)
  }
}
