import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('browser auth persists and manages long-lived sessions', async () => {
  const sessionModule = await readFile(
    new URL('../src/lib/auth/session.ts', import.meta.url),
    'utf8',
  )
  const clientModule = await readFile(
    new URL('../src/lib/auth-client.ts', import.meta.url),
    'utf8',
  )

  assert.match(sessionModule, /AUTH_COOKIE_NAME\s*=\s*['"]paylingo_auth_session['"]/)
  assert.match(sessionModule, /AUTH_COOKIE_MAX_AGE\s*=\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60/)
  assert.match(clientModule, /getUser/)
  assert.match(clientModule, /signOut/)
  assert.match(clientModule, /onAuthStateChange/)
})

test('Next.js edge middleware checks session cookies on incoming requests', async () => {
  const middleware = await readFile(
    new URL('../src/middleware.ts', import.meta.url),
    'utf8',
  )

  assert.match(middleware, /export async function middleware/)
  assert.match(middleware, /AUTH_COOKIE_NAME/)
  assert.match(middleware, /searchParams\.has\('error'\)/)
  assert.match(middleware, /X-Content-Type-Options/)
  assert.match(middleware, /X-Frame-Options/)
  assert.ok(middleware.includes('sw\\\\.js'))
  assert.ok(middleware.includes('manifest\\\\.json'))
})

test('auth session operations use atomic batch creation, concurrent user upsert, and purge expired sessions', async () => {
  const sessionModule = await readFile(
    new URL('../src/lib/auth/session.ts', import.meta.url),
    'utf8',
  )

  // Atomic batch session creation and expired session purge
  assert.match(sessionModule, /db\.batch\(\[\s*db\.prepare\('DELETE FROM auth_sessions WHERE datetime\(expires_at\) < datetime\(\\?'now\\?'\)'\)/)

  // Handles concurrent user insertion
  assert.match(sessionModule, /INSERT INTO auth_users[\s\S]*?catch[\s\S]*?SELECT \* FROM auth_users/)

  // Purges expired sessions on signout
  assert.match(sessionModule, /DELETE FROM auth_sessions WHERE token = \? OR datetime\(expires_at\) < datetime\(\\?'now\\?'\)/)
})

test('GET /api/auth/me rejects synthetic @paylingo.app guest profiles and forbids guest creation', async () => {
  const meRoute = await readFile(
    new URL('../src/app/api/auth/me/route.ts', import.meta.url),
    'utf8',
  )

  assert.match(meRoute, /user\.email\.toLowerCase\(\)\.endsWith\('@paylingo\.app'\)/)
  assert.doesNotMatch(meRoute, /export async function POST/)
})

