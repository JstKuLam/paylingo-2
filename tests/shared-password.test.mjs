import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hashSharedPassword,
  isLegacySharedPasswordHash,
  verifySharedPassword,
} from '../src/lib/shared-password.ts'

test('shared password hashes are salted and verify without exposing the password', async () => {
  const first = await hashSharedPassword('hop-dong-2026')
  const second = await hashSharedPassword('hop-dong-2026')

  assert.ok(first)
  assert.ok(second)
  assert.notEqual(first, second)
  assert.equal(isLegacySharedPasswordHash(first), false)
  assert.equal(await verifySharedPassword('hop-dong-2026', first), true)
  assert.equal(await verifySharedPassword('sai-mat-khau', first), false)
})

test('legacy SHA-256 links remain verifiable during migration', async () => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('legacy'))
  const legacyHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')

  assert.equal(isLegacySharedPasswordHash(legacyHash), true)
  assert.equal(await verifySharedPassword('legacy', legacyHash), true)
})
