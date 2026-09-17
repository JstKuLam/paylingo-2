import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/session'
import { getD1 } from '@/lib/d1-client'

export const runtime = 'edge'


const noStoreHeader = {
  'Cache-Control': 'no-store, max-age=0',
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

    let syncedFolders = 0
    let syncedSessions = 0
    let syncedEntries = 0

    const syncedFolderIds = new Set<string>()
    const syncedSessionIds = new Set<string>()

function clampIsoTimestamp(input?: string | null, fallback?: string): string {
  const fallbackVal = fallback || new Date().toISOString()
  if (!input || typeof input !== 'string') return fallbackVal
  const time = Date.parse(input)
  if (isNaN(time)) return fallbackVal
  const now = Date.now()
  if (time > now + 60_000) return new Date(now).toISOString()
  return new Date(time).toISOString()
}

    // 1. Sync Folders
    if (Array.isArray(folders) && folders.length > 0) {
      for (const folder of folders) {
        if (!folder.id || !folder.name) continue
        const existingFolder = await db.prepare('SELECT id, owner_id FROM folders WHERE id = ?').bind(folder.id).first<{ id: string; owner_id: string }>()
        if (existingFolder && existingFolder.owner_id !== user.id) {
          continue
        }
        const nowIso = new Date().toISOString()
        const createdAt = clampIsoTimestamp(folder.created_at, nowIso)
        const updatedAt = clampIsoTimestamp(folder.updated_at, nowIso)
        const username = typeof folder.username === 'string' && folder.username.trim()
          ? folder.username.trim().slice(0, 100)
          : user.email.split('@')[0]

        await db.prepare(`
          INSERT INTO folders (id, name, owner_id, username, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            username = excluded.username,
            updated_at = excluded.updated_at
          WHERE excluded.updated_at >= folders.updated_at OR folders.updated_at IS NULL
        `)
          .bind(folder.id, String(folder.name).slice(0, 200), user.id, username, createdAt, updatedAt)
          .run()
        syncedFolderIds.add(folder.id)
        syncedFolders++
      }
    }

    // 2. Sync Sessions
    if (Array.isArray(sessions) && sessions.length > 0) {
      for (const sess of sessions) {
        if (!sess.id || !sess.name) continue
        const existingSession = await db.prepare('SELECT id, owner_id FROM sessions WHERE id = ?').bind(sess.id).first<{ id: string; owner_id: string }>()
        if (existingSession && existingSession.owner_id !== user.id) {
          continue
        }
        const nowIso = new Date().toISOString()
        const startedAt = clampIsoTimestamp(sess.started_at, nowIso)
        const endedAt = sess.ended_at ? clampIsoTimestamp(sess.ended_at, nowIso) : null
        const updatedAt = clampIsoTimestamp(sess.updated_at, nowIso)
        const username = typeof sess.username === 'string' && sess.username.trim()
          ? sess.username.trim().slice(0, 100)
          : user.email.split('@')[0]
        const durationSeconds = Math.max(0, Math.floor(typeof sess.duration_seconds === 'number' && Number.isFinite(sess.duration_seconds) ? sess.duration_seconds : 0))
        const partnerLang = typeof sess.partner_language === 'string' && sess.partner_language.trim()
          ? sess.partner_language.trim().slice(0, 10)
          : 'en'
        const rawFolderId = sess.folder_id || null

        // Verify folder ownership if folder_id is provided
        let validFolderId: string | null = null
        if (rawFolderId) {
          if (syncedFolderIds.has(rawFolderId)) {
            validFolderId = rawFolderId
          } else {
            const ownedFolder = await db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ?')
              .bind(rawFolderId, user.id)
              .first()
            if (ownedFolder) {
              validFolderId = rawFolderId
            }
          }
        }

        await db.prepare(`
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
            sess.id,
            user.id,
            username,
            validFolderId,
            String(sess.name).slice(0, 200),
            partnerLang,
            startedAt,
            endedAt,
            durationSeconds,
            sess.access_code_id || null,
            startedAt,
            updatedAt
          )
          .run()
        syncedSessionIds.add(sess.id)
        syncedSessions++
      }
    }

    // 3. Sync Transcript Entries
    if (Array.isArray(entries) && entries.length > 0) {
      const uniqueSessionIds = Array.from(new Set(entries.map((e: { session_id?: string }) => e.session_id).filter(Boolean))) as string[]
      const authorizedSessionIds = new Set<string>()

      for (const sId of uniqueSessionIds) {
        if (syncedSessionIds.has(sId)) {
          authorizedSessionIds.add(sId)
        } else {
          const sess = await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner_id = ?')
            .bind(sId, user.id)
            .first()
          if (sess) {
            authorizedSessionIds.add(sId)
          }
        }
      }

      for (const entry of entries) {
        if (!entry.id || !entry.session_id || !authorizedSessionIds.has(entry.session_id)) continue
        const nowIso = new Date().toISOString()
        const createdAt = clampIsoTimestamp(entry.created_at, nowIso)
        const startMs = Math.max(0, Math.floor(typeof entry.start_ms === 'number' && Number.isFinite(entry.start_ms) ? entry.start_ms : 0))
        const endMs = Math.max(startMs, Math.floor(typeof entry.end_ms === 'number' && Number.isFinite(entry.end_ms) ? entry.end_ms : startMs))
        const speaker = entry.speaker === 'partner' ? 'partner' : 'host'
        const origText = typeof entry.original_text === 'string' ? entry.original_text : ''
        const transText = typeof entry.translated_text === 'string' ? entry.translated_text : ''

        try {
          await db.prepare(`
            INSERT INTO transcript_entries (id, session_id, speaker, original_text, translated_text, start_ms, end_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              speaker = excluded.speaker,
              original_text = excluded.original_text,
              translated_text = excluded.translated_text,
              start_ms = excluded.start_ms,
              end_ms = excluded.end_ms
          `)
            .bind(entry.id, entry.session_id, speaker, origText, transText, startMs, endMs, createdAt)
            .run()
          syncedEntries++
        } catch (entryErr) {
          console.warn(`[Sync] Skipping entry ${entry.id}:`, entryErr)
        }
      }
    }

    return NextResponse.json({
      success: true,
      syncedFolders,
      syncedSessions,
      syncedEntries,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    console.error('Error in sync API:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi hệ thống khi đồng bộ dữ liệu.' },
      { status: 500, headers: noStoreHeader }
    )
  }
}
