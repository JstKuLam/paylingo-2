import Dexie, { Table } from 'dexie'

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
    })
  }
}

export const db = new PayLingoDatabase()

export async function claimLegacyLocalData(ownerId: string, username: string) {
  await db.transaction('rw', db.sessions, db.folders, async () => {
    const cleanUsername = username.trim().toLowerCase()
    const allSessions = await db.sessions.toArray()
    const allFolders = await db.folders.toArray()

    const legacySessions = allSessions.filter(
      (session) => !session.owner_id || session.username.trim().toLowerCase() === cleanUsername
    )
    const legacyFolders = allFolders.filter(
      (folder) => !folder.owner_id || folder.username.trim().toLowerCase() === cleanUsername
    )

    await Promise.all(
      legacySessions
        .filter((session) => !session.owner_id)
        .map((session) => db.sessions.update(session.id, { owner_id: ownerId }))
    )
    await Promise.all(
      legacyFolders
        .filter((folder) => !folder.owner_id)
        .map((folder) => db.folders.update(folder.id, { owner_id: ownerId }))
    )
  })
}
