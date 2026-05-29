import Dexie, { Table } from 'dexie'

export interface LocalFolder {
  id: string
  username: string
  name: string
  created_at: string
  updated_at: string
  sync_status: 'synced' | 'pending' | 'failed'
}

export interface LocalSession {
  id: string
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
  }
}

export const db = new PayLingoDatabase()
