import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('browser auth persists and refreshes long-lived sessions', async () => {
  const source = await readFile(
    new URL('../src/lib/supabase/client.ts', import.meta.url),
    'utf8',
  )
  const config = await readFile(
    new URL('../src/lib/supabase/auth-config.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /autoRefreshToken:\s*true/)
  assert.match(source, /persistSession:\s*true/)
  assert.match(source, /cookieOptions:\s*AUTH_COOKIE_OPTIONS/)
  assert.match(config, /400\s*\*\s*24\s*\*\s*60\s*\*\s*60/)
  assert.match(config, /sameSite:\s*['"]lax['"]/)
})

test('Next.js proxy refreshes Supabase cookies on incoming requests', async () => {
  const proxy = await readFile(
    new URL('../src/proxy.ts', import.meta.url),
    'utf8',
  )
  const sessionRefresh = await readFile(
    new URL('../src/lib/supabase/middleware.ts', import.meta.url),
    'utf8',
  )

  assert.match(proxy, /export async function proxy/)
  assert.match(proxy, /updateSession\(request\)/)
  assert.match(sessionRefresh, /supabase\.auth\.getUser\(\)/)
  assert.match(sessionRefresh, /cookieOptions:\s*AUTH_COOKIE_OPTIONS/)
  assert.match(sessionRefresh, /supabaseResponse\.cookies\.set/)
})
