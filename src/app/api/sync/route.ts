import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { getD1 } from '@/lib/d1-client'

export const runtime = 'edge'

const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
}

function clampIsoTimestamp(input?: string | null, fallback?: string): string {
  const fallbackVal = fallback || new Date().toISOString()
  if (!input || typeof input !== 'string') return fallbackVal
  const time = Date.parse(input)
  if (isNaN(time)) return fallbackVal
  const now = Date.now()
  if (time > now + 60_000) return new Date(now).toISOString()
  return new Date(time).toISOString()
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Chưa đăng nhập' },
        { status: 401, headers: noStoreHeader }
      )
    }

    let payload: { folders?: unknown; sessions?: unknown; entries?: unknown }
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Dữ liệu payload JSON không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const { folders = [], sessions = [], entries = [] } = payload
    if (!Array.isArray(folders) || !Array.isArray(sessions) || !Array.isArray(entries)) {
      return NextResponse.json(
        { error: 'Định dạng dữ liệu không hợp lệ.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    if (folders.length > 500 || sessions.length > 500 || entries.length > 2000) {
      return NextResponse.json(
        { error: 'Kích thước dữ liệu vượt quá giới hạn cho phép.' },
        { status: 400, headers: noStoreHeader }
      )
    }

    const db = getD1()
    const CHUNK_SIZE = 50

    let syncedFolders = 0
    let syncedSessions = 0
    let syncedEntries = 0
    const failedFolderIds: string[] = []
    const failedSessionIds: string[] = []
    const failedEntryIds: string[] = []

    const syncedFolderIds = new Set<string>()
    const syncedSessionIds = new Set<string>()

    // 1. Sync Folders (Batched ownership lookup + db.batch upserts)
    if (folders.length > 0) {
      const candidateFolderIds = Array.from(
        new Set(
          folders
            .filter((f) => f && typeof f.id === 'string' && f.id.length <= 64 && f.name)
            .map((f) => f.id as string)
        )
      )

      const existingFoldersMap = new Map<string, { id: string; owner_id: string }>()
      for (let i = 0; i < candidateFolderIds.length; i += CHUNK_SIZE) {
        const idChunk = candidateFolderIds.slice(i, i + CHUNK_SIZE)
        const placeholders = idChunk.map(() => '?').join(', ')
        const rows = await db
          .prepare(`SELECT id, owner_id FROM folders WHERE id IN (${placeholders})`)
          .bind(...idChunk)
          .all<{ id: string; owner_id: string }>()
        for (const r of rows.results || []) {
          existingFoldersMap.set(r.id, r)
        }
      }

      const validFolders: Array<{
        id: string
        name: string
        username: string
        createdAt: string
        updatedAt: string
      }> = []

      for (const folder of folders) {
        if (!folder.id || typeof folder.id !== 'string' || folder.id.length > 64 || !folder.name) continue
        const existingFolder = existingFoldersMap.get(folder.id)
        if (existingFolder && existingFolder.owner_id !== user.id) {
          failedFolderIds.push(folder.id)
          continue
        }
        const nowIso = new Date().toISOString()
        const createdAt = clampIsoTimestamp(folder.created_at, nowIso)
        const updatedAt = clampIsoTimestamp(folder.updated_at, nowIso)
        const username =
          typeof folder.username === 'string' && folder.username.trim()
            ? folder.username.trim().slice(0, 100)
            : user.email.split('@')[0]

        validFolders.push({
          id: folder.id,
          name: String(folder.name).slice(0, 200),
          username,
          createdAt,
          updatedAt,
        })
      }

      for (let i = 0; i < validFolders.length; i += CHUNK_SIZE) {
        const chunk = validFolders.slice(i, i + CHUNK_SIZE)
        const statements = chunk.map((f) =>
          db
            .prepare(`
              INSERT INTO folders (id, name, owner_id, username, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                username = excluded.username,
                updated_at = excluded.updated_at
              WHERE excluded.updated_at >= folders.updated_at OR folders.updated_at IS NULL
            `)
            .bind(f.id, f.name, user.id, f.username, f.createdAt, f.updatedAt)
        )
        try {
          await db.batch(statements)
          for (const f of chunk) {
            syncedFolderIds.add(f.id)
          }
          syncedFolders += chunk.length
        } catch (chunkErr) {
          console.warn('[Sync] Failed to batch sync folder chunk:', chunkErr)
          for (const failedItem of chunk) {
            failedFolderIds.push(failedItem.id)
          }
        }
      }
    }

    // 2. Sync Sessions (Batched ownership lookup + db.batch upserts)
    if (sessions.length > 0) {
      const candidateSessionIds = Array.from(
        new Set(
          sessions
            .filter((s) => s && typeof s.id === 'string' && s.id.length <= 64 && s.name)
            .map((s) => s.id as string)
        )
      )
      const existingSessionsMap = new Map<string, { id: string; owner_id: string }>()
      for (let i = 0; i < candidateSessionIds.length; i += CHUNK_SIZE) {
        const idChunk = candidateSessionIds.slice(i, i + CHUNK_SIZE)
        const placeholders = idChunk.map(() => '?').join(', ')
        const rows = await db
          .prepare(`SELECT id, owner_id FROM sessions WHERE id IN (${placeholders})`)
          .bind(...idChunk)
          .all<{ id: string; owner_id: string }>()
        for (const r of rows.results || []) {
          existingSessionsMap.set(r.id, r)
        }
      }

      const unsyncedFolderRefs = Array.from(
        new Set(
          sessions
            .map((s) => (typeof s?.folder_id === 'string' && s.folder_id.length <= 64 ? s.folder_id : null))
            .filter((fid): fid is string => Boolean(fid) && !syncedFolderIds.has(fid!))
        )
      )
      const ownedFolderIds = new Set<string>(syncedFolderIds)
      for (let i = 0; i < unsyncedFolderRefs.length; i += CHUNK_SIZE) {
        const idChunk = unsyncedFolderRefs.slice(i, i + CHUNK_SIZE)
        const placeholders = idChunk.map(() => '?').join(', ')
        const rows = await db
          .prepare(`SELECT id FROM folders WHERE owner_id = ? AND id IN (${placeholders})`)
          .bind(user.id, ...idChunk)
          .all<{ id: string }>()
        for (const r of rows.results || []) {
          ownedFolderIds.add(r.id)
        }
      }

      const validSessions: Array<{
        id: string
        username: string
        validFolderId: string | null
        name: string
        partnerLang: string
        startedAt: string
        endedAt: string | null
        durationSeconds: number
        accessCodeId: string | null
        updatedAt: string
      }> = []

      for (const sess of sessions) {
        if (!sess.id || typeof sess.id !== 'string' || sess.id.length > 64 || !sess.name) continue
        const existingSession = existingSessionsMap.get(sess.id)
        if (existingSession && existingSession.owner_id !== user.id) {
          failedSessionIds.push(sess.id)
          continue
        }
        const nowIso = new Date().toISOString()
        const startedAt = clampIsoTimestamp(sess.started_at, nowIso)
        const endedAt = sess.ended_at ? clampIsoTimestamp(sess.ended_at, nowIso) : null
        const updatedAt = clampIsoTimestamp(sess.updated_at, nowIso)
        const username =
          typeof sess.username === 'string' && sess.username.trim()
            ? sess.username.trim().slice(0, 100)
            : user.email.split('@')[0]
        const durationSeconds = Math.max(
          0,
          Math.floor(
            typeof sess.duration_seconds === 'number' && Number.isFinite(sess.duration_seconds)
              ? sess.duration_seconds
              : 0
          )
        )
        const partnerLang =
          typeof sess.partner_language === 'string' && sess.partner_language.trim()
            ? sess.partner_language.trim().slice(0, 10)
            : 'en'
        const rawFolderId = typeof sess.folder_id === 'string' && sess.folder_id ? sess.folder_id : null
        const validFolderId = rawFolderId && ownedFolderIds.has(rawFolderId) ? rawFolderId : null

        validSessions.push({
          id: sess.id,
          username,
          validFolderId,
          name: String(sess.name).slice(0, 200),
          partnerLang,
          startedAt,
          endedAt,
          durationSeconds,
          accessCodeId: sess.access_code_id || null,
          updatedAt,
        })
      }

      for (let i = 0; i < validSessions.length; i += CHUNK_SIZE) {
        const chunk = validSessions.slice(i, i + CHUNK_SIZE)
        const statements = chunk.map((s) =>
          db
            .prepare(`
              INSERT INTO sessions (id, owner_id, username, folder_id, name, partner_language, started_at, ended_at, duration_seconds, access_code_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                folder_id = excluded.folder_id,
                partner_language = excluded.partner_language,
                ended_at = excluded.ended_at,
                duration_seconds = excluded.duration_seconds,
                updated_at = excluded.updated_at
              WHERE excluded.updated_at >= sessions.updated_at OR sessions.updated_at IS NULL
            `)
            .bind(
              s.id,
              user.id,
              s.username,
              s.validFolderId,
              s.name,
              s.partnerLang,
              s.startedAt,
              s.endedAt,
              s.durationSeconds,
              s.accessCodeId,
              s.startedAt,
              s.updatedAt
            )
        )
        try {
          await db.batch(statements)
          for (const s of chunk) {
            syncedSessionIds.add(s.id)
          }
          syncedSessions += chunk.length
        } catch (chunkErr) {
          console.warn('[Sync] Failed to batch sync session chunk:', chunkErr)
          for (const failedItem of chunk) {
            failedSessionIds.push(failedItem.id)
          }
        }
      }
    }

    // 3. Sync Transcript Entries
    if (entries.length > 0) {
      const uniqueSessionIds = Array.from(
        new Set(entries.map((e: { session_id?: string }) => e.session_id).filter(Boolean))
      ) as string[]
      const authorizedSessionIds = new Set<string>(syncedSessionIds)
      const uncheckedSessionIds = uniqueSessionIds.filter(
        (sId) => typeof sId === 'string' && sId.length <= 64 && !authorizedSessionIds.has(sId)
      )

      for (let i = 0; i < uncheckedSessionIds.length; i += CHUNK_SIZE) {
        const idChunk = uncheckedSessionIds.slice(i, i + CHUNK_SIZE)
        const placeholders = idChunk.map(() => '?').join(', ')
        const rows = await db
          .prepare(`SELECT id FROM sessions WHERE owner_id = ? AND id IN (${placeholders})`)
          .bind(user.id, ...idChunk)
          .all<{ id: string }>()
        for (const r of rows.results || []) {
          authorizedSessionIds.add(r.id)
        }
      }

      const validEntries: Array<{
        id: string
        session_id: string
        speaker: 'partner' | 'host'
        speakerLabel: string | null
        origText: string
        transText: string
        startMs: number
        endMs: number
        createdAt: string
      }> = []

      for (const entry of entries) {
        if (!entry.id || typeof entry.id !== 'string' || entry.id.length > 64) continue
        if (!entry.session_id || typeof entry.session_id !== 'string' || entry.session_id.length > 64) continue
        if (!authorizedSessionIds.has(entry.session_id)) {
          failedEntryIds.push(entry.id)
          continue
        }

        const nowIso = new Date().toISOString()
        const createdAt = clampIsoTimestamp(entry.created_at, nowIso)
        const startMs = Math.max(0, Math.floor(typeof entry.start_ms === 'number' && Number.isFinite(entry.start_ms) ? entry.start_ms : 0))
        const endMs = Math.max(startMs, Math.floor(typeof entry.end_ms === 'number' && Number.isFinite(entry.end_ms) ? entry.end_ms : startMs))
        const speaker = entry.speaker === 'partner' ? 'partner' : 'host'
        const speakerLabel = typeof entry.speaker_label === 'string' && entry.speaker_label.trim() ? entry.speaker_label.trim().slice(0, 32) : null
        const origText = typeof entry.original_text === 'string' ? entry.original_text.slice(0, 10_000) : ''
        const transText = typeof entry.translated_text === 'string' ? entry.translated_text.slice(0, 10_000) : ''

        validEntries.push({
          id: entry.id,
          session_id: entry.session_id,
          speaker,
          speakerLabel,
          origText,
          transText,
          startMs,
          endMs,
          createdAt,
        })
      }

      // Batch entry writes in chunks of 50 for optimal D1 throughput and transaction safety
      for (let i = 0; i < validEntries.length; i += CHUNK_SIZE) {
        const chunk = validEntries.slice(i, i + CHUNK_SIZE)
        const statements = chunk.map((entry) => {
          return db.prepare(`
            INSERT INTO transcript_entries (id, session_id, speaker, speaker_label, original_text, translated_text, start_ms, end_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              speaker = excluded.speaker,
              speaker_label = COALESCE(excluded.speaker_label, transcript_entries.speaker_label),
              original_text = excluded.original_text,
              translated_text = excluded.translated_text,
              start_ms = excluded.start_ms,
              end_ms = excluded.end_ms
            WHERE transcript_entries.session_id = excluded.session_id
          `).bind(entry.id, entry.session_id, entry.speaker, entry.speakerLabel, entry.origText, entry.transText, entry.startMs, entry.endMs, entry.createdAt)
        })
        try {
          await db.batch(statements)
          syncedEntries += chunk.length
        } catch (chunkErr) {
          console.warn('[Sync] Failed to batch sync chunk:', chunkErr)
          for (const failedItem of chunk) {
            failedEntryIds.push(failedItem.id)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      syncedFolders,
      syncedSessions,
      syncedEntries,
      failedFolderIds,
      failedSessionIds,
      failedEntryIds,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    console.error('Error in sync API:', err)
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi đồng bộ dữ liệu.' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
