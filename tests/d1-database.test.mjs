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
