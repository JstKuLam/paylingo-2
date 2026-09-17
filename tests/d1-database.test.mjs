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
