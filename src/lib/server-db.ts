import { getD1 } from './d1-client'

export interface UserEntity {
  id: string
  email: string
  email_confirmed_at?: string
  created_at: string
}

export interface SessionEntity {
  id: string
  owner_id: string
  username: string
  name: string
  partner_language: string
  started_at: string
  ended_at?: string
  duration_seconds: number
  access_code_id?: string
  created_at: string
}

export interface TranscriptEntryEntity {
  id: string
  session_id: string
  speaker: 'host' | 'partner'
  original_text: string
  translated_text: string
  start_ms: number
  end_ms: number
  created_at: string
}

export async function getUserByEmail(email: string): Promise<UserEntity | null> {
  const db = getD1()
  const user = await db.prepare('SELECT id, email, email_confirmed_at, created_at FROM auth_users WHERE lower(email) = lower(?)')
    .bind(email.trim())
    .first<UserEntity>()
  return user || null
}

export async function getSessionsByOwner(ownerId: string): Promise<SessionEntity[]> {
  const db = getD1()
  const res = await db.prepare('SELECT * FROM sessions WHERE owner_id = ? ORDER BY started_at DESC')
    .bind(ownerId)
    .all<SessionEntity>()
  return res.results || []
}
