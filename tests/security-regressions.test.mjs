import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const source = (file) => readFile(path.join(root, file), 'utf8')

async function sourceFiles(directory) {
  const results = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) results.push(...await sourceFiles(entryPath))
    else results.push(entryPath)
  }
  return results
}

test('privileged Supabase secrets are not embedded in application source', async () => {
  const files = await sourceFiles(path.join(root, 'src'))
  const combined = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n')
  assert.doesNotMatch(combined, /sb_secret_[A-Za-z0-9_-]+/)
})

test('auth callback never guesses a recently signed-in user', async () => {
  const callback = await source('src/app/auth/callback/route.ts')
  assert.doesNotMatch(callback, /listUsers|generateLink|last_sign_in_at|createAdminClient/)
  assert.match(callback, /exchangeCodeForSession/)
  assert.match(callback, /verifyOtp/)
  assert.match(callback, /safeNextPath/)
})

test('admin authentication fails closed and uses hardened password/session primitives', async () => {
  const auth = await source('src/lib/admin-auth.ts')
  const route = await source('src/app/api/auth/admin/route.ts')
  assert.doesNotMatch(auth, /DEFAULT_PASSWORD|paylingo_admin_salt/)
  assert.match(auth, /PBKDF2/)
  assert.match(auth, /ADMIN_SESSION_SECRET/)
  assert.match(auth, /configured:\s*false/)
  assert.match(auth, /timingSafeEqual/)
  assert.match(route, /newPassword\.length < 12/)
  assert.match(route, /admin-login:/)
})

test('passkey verification binds origin, RP ID, credential and one-time challenge', async () => {
  const auth = await source('src/lib/admin-auth.ts')
  const route = await source('src/app/api/auth/admin/route.ts')
  assert.match(auth, /clientData\.type !== 'webauthn\.get'/)
  assert.match(auth, /expectedRpIdHash/)
  assert.match(auth, /webAuthnDerSignatureToRaw/)
  assert.match(auth, /userPresent/)
  assert.match(auth, /userVerified/)
  assert.match(route, /timingSafeEqualStr\(credentialId, creds\.passkeyCredId\)/)
  assert.match(route, /cookieStore\.delete\(CHALLENGE_COOKIE_NAME\)/)
  assert.match(route, /PASSKEY_ORIGIN/)
})

test('protected routes enforce confirmed allowed users at the server boundary', async () => {
  const sonioxKey = await source('src/app/api/auth/soniox-key/route.ts')
  const home = await source('src/app/page.tsx')
  assert.match(sonioxKey, /email_confirmed_at/)
  assert.match(sonioxKey, /isAllowedEmail\(email\)/)
  assert.doesNotMatch(home, /Fallback to client-side signInWithOtp/)
  assert.doesNotMatch(home, /redirectTo:/)
})

test('local synchronization never reassigns records with an existing owner', async () => {
  const sync = await source('src/lib/sync-manager.ts')
  const db = await source('src/lib/db.ts')
  assert.doesNotMatch(sync, /!s\.owner_id \|\| s\.owner_id !== ownerId/)
  assert.match(sync, /where\('owner_id'\)\.equals\(ownerId\)/)
  assert.match(db, /!session\.owner_id && session\.username/)
  assert.match(db, /!folder\.owner_id && folder\.username/)
})

test('latest RLS migration authorizes by immutable owner id only', async () => {
  const migration = await source('supabase/migrations/20260803000000_enforce_strict_ownership_rls.sql')
  assert.doesNotMatch(migration, /user_metadata/)
  assert.match(migration, /owner_id = auth\.uid\(\)/)
  assert.match(migration, /Users can read their own active access code/)
  assert.match(migration, /owner_required/)
})

test('expensive and password-protected APIs have abuse controls', async () => {
  const summarize = await source('src/app/api/ai/summarize/route.ts')
  const shared = await source('src/app/api/shared/summary/route.ts')
  assert.match(summarize, /email_confirmed_at/)
  assert.match(summarize, /ai-summary:/)
  assert.match(summarize, /AbortSignal\.timeout/)
  assert.match(summarize, /max\(500\)/)
  assert.doesNotMatch(shared, /searchParams\.get\('password'\)/)
  assert.match(shared, /shared-summary:/)
})

test('web and mobile ship with baseline data-exposure defenses', async () => {
  const config = await source('next.config.ts')
  const pagesHeaders = await source('public/_headers')
  const manifest = await source('paylingo-mobile/androidApp/src/main/AndroidManifest.xml')
  const viewModel = await source('paylingo-mobile/shared/src/commonMain/kotlin/com/paylingo/viewmodel/SessionViewModel.kt')
  const socket = await source('paylingo-mobile/shared/src/commonMain/kotlin/com/paylingo/network/SonioxWebSocketClient.kt')
  assert.match(config, /Content-Security-Policy/)
  assert.match(config, /frame-ancestors 'none'/)
  assert.match(pagesHeaders, /X-Frame-Options: DENY/)
  assert.match(manifest, /android:allowBackup="false"/)
  assert.doesNotMatch(viewModel, /auth response:|API key fetch response:|live transcript JSON/)
  assert.doesNotMatch(socket, /Setup payload:|Raw transcript frame:/)
})
