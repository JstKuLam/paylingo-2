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

    // 1. Sync Folders
    if (Array.isArray(folders) && folders.length > 0) {
      for (const folder of folders) {
        if (!folder.id || !folder.name) continue
        const existingFolder = await db.prepare('SELECT id, owner_id FROM folders WHERE id = ?').bind(folder.id).first<{ id: string; owner_id: string }>()
        if (existingFolder && existingFolder.owner_id !== user.id) {
          continue
        }
        const nowIso = new Date().toISOString()
        const createdAt = folder.created_at || nowIso
        const updatedAt = folder.updated_at || nowIso
        const username = folder.username || user.email.split('@')[0]

        await db.prepare(`
          INSERT INTO folders (id, name, owner_id, username, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            username = excluded.username,
            updated_at = excluded.updated_at
        `)
          .bind(folder.id, folder.name, user.id, username, createdAt, updatedAt)
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
        const startedAt = sess.started_at || nowIso
        const endedAt = sess.ended_at || null
        const updatedAt = sess.updated_at || nowIso
        const username = sess.username || user.email.split('@')[0]
        const durationSeconds = typeof sess.duration_seconds === 'number' ? sess.duration_seconds : 0
        const partnerLang = sess.partner_language || 'en'
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
        `)
          .bind(
            sess.id,
            user.id,
            username,
            validFolderId,
            sess.name,
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
        const createdAt = entry.created_at || nowIso
        const startMs = typeof entry.start_ms === 'number' ? entry.start_ms : 0
        const endMs = typeof entry.end_ms === 'number' ? entry.end_ms : 0
        const speaker = entry.speaker === 'partner' ? 'partner' : 'host'
        const origText = entry.original_text || ''
        const transText = entry.translated_text || ''

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
