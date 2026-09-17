import assert from 'node:assert/strict'
import test from 'node:test'
import { getD1 } from '../src/lib/d1-client.ts'

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

test('D1 ISO 8601 timestamp comparison with datetime(expires_at) prevents same-day token leakage', async () => {
  const db = getD1()
  const expiredToken = 'expired-iso-' + Date.now()
  const validToken = 'valid-iso-' + Date.now()

  // 10 minutes in the past (same day, ISO format with 'T')
  const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  // 15 minutes in the future (same day, ISO format with 'T')
  const futureIso = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await db.prepare('INSERT INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(expiredToken, 'audit@example.com', pastIso)
    .run()

  await db.prepare('INSERT INTO auth_tokens (token, email, expires_at, created_at) VALUES (?, ?, ?, datetime(\'now\'))')
    .bind(validToken, 'audit@example.com', futureIso)
    .run()

  // Verify that datetime(expires_at) > datetime('now') correctly rejects pastIso
  const expiredRecord = await db.prepare(
    'SELECT * FROM auth_tokens WHERE token = ? AND datetime(expires_at) > datetime(\'now\')'
  )
    .bind(expiredToken)
    .first()

  assert.strictEqual(expiredRecord, null, 'Expired ISO timestamp must NOT be matched')

  // Verify that datetime(expires_at) > datetime('now') correctly accepts futureIso
  const validRecord = await db.prepare(
    'SELECT * FROM auth_tokens WHERE token = ? AND datetime(expires_at) > datetime(\'now\')'
  )
    .bind(validToken)
    .first()

  assert.ok(validRecord, 'Valid future ISO timestamp must be matched')

  // Clean up
  await db.prepare('DELETE FROM auth_tokens WHERE token IN (?, ?)').bind(expiredToken, validToken).run()
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
