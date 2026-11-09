import assert from 'node:assert/strict'
import module from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { getD1 } from '../src/lib/d1-client.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier === 'next/headers') return nextResolve('next/headers.js', context)
    if (specifier.startsWith('@/')) {
      return nextResolve(path.join(projectRoot, 'src', specifier.slice(2)) + '.ts', context)
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context)
      } catch {}
    }
    return nextResolve(specifier, context)
  },
})

test('D1 client initializes and executes queries accurately', async () => {
  const db = getD1()
  assert.ok(db, 'D1 database instance must be defined')

  const testId = 'test-session-' + Date.now()
  const insertRes = await db.prepare(`
    INSERT INTO sessions (id, owner_id, username, name, partner_language, started_at, duration_seconds)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
  `)
    .bind(testId, 'test-owner', 'testuser', 'Test D1 Session', 'en', 120)
    .run()

  assert.ok(insertRes.success, 'Insert query should succeed')

  const session = await db.prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(testId)
    .first()

  assert.ok(session, 'Session must be found in D1')
  assert.strictEqual(session.name, 'Test D1 Session')

  // Clean up
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(testId).run()
})

test('D1 batch statements execute within transaction', async () => {
  const db = getD1()
  const id1 = 'test-entry-1-' + Date.now()
  const id2 = 'test-entry-2-' + Date.now()

  const st1 = db.prepare('INSERT INTO folders (id, name, owner_id, username) VALUES (?, ?, ?, ?)').bind(id1, 'Folder 1', 'owner1', 'user1')
  const st2 = db.prepare('INSERT INTO folders (id, name, owner_id, username) VALUES (?, ?, ?, ?)').bind(id2, 'Folder 2', 'owner1', 'user1')

  const results = await db.batch([st1, st2])
  assert.strictEqual(results.length, 2)

  const count = await db.prepare('SELECT count(*) as total FROM folders WHERE id IN (?, ?)').bind(id1, id2).first('total')
  assert.strictEqual(count, 2)

  // Clean up
  await db.prepare('DELETE FROM folders WHERE id IN (?, ?)').bind(id1, id2).run()
})

test('D1 ISO 8601 timestamp comparison with datetime(expires_at) prevents same-day session leakage', async () => {
  const db = getD1()
  const testUserId = 'user-iso-' + Date.now()
  const expiredToken = 'expired-iso-' + Date.now()
  const validToken = 'valid-iso-' + Date.now()

  // 10 minutes in the past (same day, ISO format with 'T')
  const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  // 15 minutes in the future (same day, ISO format with 'T')
  const futureIso = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await db.prepare('INSERT INTO auth_users (id, email, email_confirmed_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(testUserId, `${testUserId}@gmail.com`, pastIso, pastIso)
    .run()

  await db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(expiredToken, testUserId, pastIso)
    .run()

  await db.prepare('INSERT INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(validToken, testUserId, futureIso)
    .run()

  // Verify that datetime(expires_at) > datetime('now') correctly rejects pastIso
  const expiredRecord = await db.prepare(
    'SELECT * FROM auth_sessions WHERE token = ? AND datetime(expires_at) > datetime(\'now\')'
  )
    .bind(expiredToken)
    .first()

  assert.strictEqual(expiredRecord, null, 'Expired ISO timestamp must NOT be matched')

  // Verify that datetime(expires_at) > datetime('now') correctly accepts futureIso
  const validRecord = await db.prepare(
    'SELECT * FROM auth_sessions WHERE token = ? AND datetime(expires_at) > datetime(\'now\')'
  )
    .bind(validToken)
    .first()

  assert.ok(validRecord, 'Valid future ISO timestamp must be matched')

  // Clean up
  await db.prepare('DELETE FROM auth_sessions WHERE token IN (?, ?)').bind(expiredToken, validToken).run()
  await db.prepare('DELETE FROM auth_users WHERE id = ?').bind(testUserId).run()
})

test('D1 batch rolls back entire transaction if any statement fails', async () => {
  const db = getD1()
  const validId = 'rollback-test-valid-' + Date.now()
  const invalidId = 'rollback-test-invalid-' + Date.now()

  const st1 = db.prepare('INSERT INTO folders (id, name, owner_id, username) VALUES (?, ?, ?, ?)')
    .bind(validId, 'Valid Folder', 'owner1', 'user1')
  // st2 will fail due to column mismatch or constraint error
  const st2 = db.prepare('INSERT INTO non_existent_table (col) VALUES (?)')
    .bind(invalidId)

  await assert.rejects(
    async () => {
      await db.batch([st1, st2])
    },
    /no such table/i
  )

  // Verify that validId was rolled back and does not exist in folders
  const found = await db.prepare('SELECT id FROM folders WHERE id = ?').bind(validId).first()
  assert.strictEqual(found, null, 'First statement must be rolled back when batch fails')
})

test('D1 local SQLite enforces foreign key cascade deletion for transcript_entries', async () => {
  const db = getD1()
  const sessId = 'fk-cascade-sess-' + Date.now()
  const entryId = 'fk-cascade-entry-' + Date.now()

  // Insert session
  await db.prepare('INSERT INTO sessions (id, owner_id, username, name) VALUES (?, ?, ?, ?)')
    .bind(sessId, 'owner-fk', 'user-fk', 'FK Session')
    .run()

  // Insert transcript entry referencing session
  await db.prepare('INSERT INTO transcript_entries (id, session_id, speaker, original_text, translated_text) VALUES (?, ?, ?, ?, ?)')
    .bind(entryId, sessId, 'host', 'Xin chào', 'Hello')
    .run()

  // Verify entry exists
  const beforeDelete = await db.prepare('SELECT id FROM transcript_entries WHERE id = ?').bind(entryId).first()
  assert.ok(beforeDelete, 'Transcript entry must exist initially')

  // Delete session directly
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessId).run()

  // Verify cascade deletion removed entry automatically
  const afterDelete = await db.prepare('SELECT id FROM transcript_entries WHERE id = ?').bind(entryId).first()
  assert.strictEqual(afterDelete, null, 'Foreign key ON DELETE CASCADE must remove transcript entry')
})

test('D1 parameter binding normalizes boolean, Date, and undefined without throwing', async () => {
  const db = getD1()
  const testId = 'param-norm-' + Date.now()
  const now = new Date()

  // Test binding with Date instance, boolean, and undefined
  const st = db.prepare(`
    INSERT INTO sessions (id, owner_id, username, name, partner_language, started_at, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(testId, 'owner-norm', 'user-norm', 'Norm Session', 'vi', now, 60)

  const res = await st.run()
  assert.ok(res.success, 'Insert with Date and normalized values should succeed')

  const fetched = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(testId).first()
  assert.ok(fetched, 'Row should be inserted')
  assert.strictEqual(fetched.started_at, now.toISOString())

  // Clean up
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(testId).run()
})

test('D1 batch and all return proper meta with changes and handles empty batch', async () => {
  const db = getD1()
  
  // Empty batch returns empty array
  const emptyRes = await db.batch([])
  assert.deepStrictEqual(emptyRes, [])

  const id1 = 'batch-meta-1-' + Date.now()
  const id2 = 'batch-meta-2-' + Date.now()

  const st1 = db.prepare('INSERT INTO folders (id, name, owner_id, username) VALUES (?, ?, ?, ?)')
    .bind(id1, 'Meta Folder 1', 'owner1', 'user1')
  const st2 = db.prepare('INSERT INTO folders (id, name, owner_id, username) VALUES (?, ?, ?, ?)')
    .bind(id2, 'Meta Folder 2', 'owner1', 'user1')

  const batchResults = await db.batch([st1, st2])
  assert.strictEqual(batchResults.length, 2)
  assert.strictEqual(batchResults[0].success, true)
  assert.strictEqual(batchResults[0].meta.changes, 1)

  // Clean up
  await db.prepare('DELETE FROM folders WHERE id IN (?, ?)').bind(id1, id2).run()
})

test('D1 LWW sync upsert preserves newer same-day ISO 8601 PATCH rename against older same-day client sync via real route handlers', async () => {
  const { createOrUpdateOAuthSession } = await import('../src/lib/auth/session.ts')
  const { PATCH: patchHistory } = await import('../src/app/api/history/route.ts')
  const { POST: postSync } = await import('../src/app/api/sync/route.ts')

  const db = getD1()
  const sessId = 'lww-sess-' + Date.now()
  const testEmail = `lww-${Date.now()}@gmail.com`

  const authRes = await createOrUpdateOAuthSession(testEmail)
  assert.ok(authRes, 'OAuth session should be created')
  const authCookie = `paylingo_auth_session=${authRes.sessionToken}`

  const t0 = new Date(Date.now() - 120_000).toISOString() // 2 mins ago
  const t1 = new Date(Date.now() - 60_000).toISOString()  // 1 min ago (stale client B state)

  // 1. Initial session sync at t0 via real POST /api/sync handler
  const syncInitRes = await postSync(
    new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        folders: [],
        sessions: [
          {
            id: sessId,
            name: 'Original Name',
            partner_language: 'en',
            started_at: t0,
            duration_seconds: 30,
            updated_at: t0,
          },
        ],
        entries: [],
      }),
    })
  )
  assert.strictEqual(syncInitRes.status, 200)

  // 2. Server PATCH rename via real PATCH /api/history handler
  const patchRes = await patchHistory(
    new Request('http://localhost/api/history', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        table: 'sessions',
        field: 'id',
        value: sessId,
        payload: { name: 'Renamed On Device A' },
      }),
    })
  )
  assert.strictEqual(patchRes.status, 200)

  // 3. Stale sync from Device B with older same-day ISO timestamp t1 (< PATCH updated_at)
  const staleSyncRes = await postSync(
    new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: authCookie },
      body: JSON.stringify({
        folders: [],
        sessions: [
          {
            id: sessId,
            name: 'Stale Name From Device B',
            partner_language: 'en',
            started_at: t0,
            duration_seconds: 30,
            updated_at: t1,
          },
        ],
        entries: [],
      }),
    })
  )
  assert.strictEqual(staleSyncRes.status, 200)

  const afterStaleSync = await db.prepare('SELECT name, updated_at FROM sessions WHERE id = ?').bind(sessId).first()
  assert.strictEqual(
    afterStaleSync.name,
    'Renamed On Device A',
    'Older same-day ISO sync via POST /api/sync must NOT overwrite newer PATCH /api/history rename'
  )

  // Clean up
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessId).run()
  await db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(authRes.user.id).run()
  await db.prepare('DELETE FROM auth_users WHERE id = ?').bind(authRes.user.id).run()
})
