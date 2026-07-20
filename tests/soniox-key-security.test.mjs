import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Soniox endpoint requires corporate Azure auth and only mints scoped keys', async () => {
  const source = await readFile(
    new URL('../src/app/api/auth/soniox-key/route.ts', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(source, /PAYLINGO_MOBILE_SECRET|x-mobile-secret/)
  assert.match(source, /!isAzure/)
  assert.match(source, /endsWith\('@pay2pay\.vn'\)/)
  assert.match(source, /expires_in_seconds:\s*60/)
  assert.match(source, /single_use:\s*true/)
  assert.match(source, /max_session_duration_seconds:\s*7200/)
  assert.match(source, /client_reference_id:/)
  assert.match(source, /Cache-Control['"]:\s*['"]no-store/)
})

test('account deletion is authenticated and removes owned data before auth user', async () => {
  const source = await readFile(
    new URL('../src/app/api/auth/soniox-key/route.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /export async function DELETE/)
  assert.match(source, /getAuthenticatedUser\(request\)/)
  assert.match(source, /!isAzure/)
  assert.match(source, /endsWith\('@pay2pay\.vn'\)/)
  assert.match(source, /\.from\('sessions'\)/)
  assert.match(source, /\.from\('folders'\)/)
  assert.match(source, /\.eq\('owner_id', user\.id\)/)
  assert.ok(
    source.indexOf(".from('sessions')") < source.indexOf('deleteUser(user.id)'),
  )
  assert.match(source, /Cache-Control['"]:\s*['"]no-store/)
})
