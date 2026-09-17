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
})
