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

test('auth callback never guesses a recently signed-in user and hardens against open redirect', async () => {
  const callback = await source('src/app/auth/callback/route.ts')
  assert.doesNotMatch(callback, /listUsers|generateLink|last_sign_in_at|createAdminClient/)
  assert.match(callback, /exchangeCodeForSession/)
  assert.match(callback, /verifyOtp/)
  assert.match(callback, /safeNextPath/)
  assert.match(callback, /nextParam\.includes\('\\\\'\)/)
  assert.match(callback, /parsed\.origin !== origin/)
  assert.match(callback, /'Cache-Control': 'no-store, max-age=0'/)
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
  const history = await source('src/app/history/page.tsx')
  assert.doesNotMatch(sync, /!s\.owner_id \|\| s\.owner_id !== ownerId/)
  assert.match(sync, /where\('owner_id'\)\.equals\(ownerId\)/)
  assert.match(db, /!session\.owner_id && session\.username/)
  assert.match(db, /!folder\.owner_id && folder\.username/)
  assert.match(history, /safeCloudSessions/)
  assert.match(history, /safeCloudFolders/)
})

test('sync route enforces multi-tenant ownership on folders, sessions, and entries', async () => {
  const syncRoute = await source('src/app/api/sync/route.ts')
  assert.match(syncRoute, /existingFolder\.owner_id !== user\.id/)
  assert.match(syncRoute, /existingSession\.owner_id !== user\.id/)
  assert.match(syncRoute, /authorizedSessionIds/)
  assert.match(syncRoute, /syncedFolderIds/)
  assert.match(syncRoute, /'Cache-Control': 'no-store, max-age=0'/)
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
  const magicLink = await source('src/app/api/auth/send-magic-link/route.ts')
  const rateLimit = await source('src/lib/rate-limit.ts')
  assert.match(summarize, /email_confirmed_at/)
  assert.match(summarize, /ai-summary:/)
  assert.match(summarize, /AbortSignal\.timeout/)
  assert.match(summarize, /max\(500\)/)
  assert.match(summarize, /owner_id !== user\.id/)
  assert.match(summarize, /getSafeAiEndpoint/)
  assert.match(summarize, /MAX_ENTRIES_FOR_SUMMARY/)
  assert.match(summarize, /TimeoutError/)
  assert.doesNotMatch(shared, /searchParams\.get\('password'\)/)
  assert.match(shared, /shared-summary:/)
  assert.match(shared, /shared-summary-get:/)
  assert.match(magicLink, /magic-link-ip:/)
  assert.match(rateLimit, /buckets\.size > 500/)
  assert.match(rateLimit, /buckets\.size > 1000/)
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

test('deleting sessions and folders cascades to session_summaries and shared_summaries', async () => {
  const historyRoute = await source('src/app/api/history/route.ts')
  const adminSessionsRoute = await source('src/app/api/admin/sessions/route.ts')
  const sharedSummaryRoute = await source('src/app/api/shared/summary/route.ts')
  const adminSettingsRoute = await source('src/app/api/admin/settings/route.ts')

  assert.match(historyRoute, /DELETE FROM session_summaries WHERE session_id = \?/)
  assert.match(historyRoute, /DELETE FROM shared_summaries WHERE session_id = \?/)
  assert.match(historyRoute, /DELETE FROM session_summaries WHERE folder_id = \?/)
  assert.match(historyRoute, /DELETE FROM shared_summaries WHERE folder_id = \?/)

  assert.match(adminSessionsRoute, /DELETE FROM session_summaries WHERE session_id = \?/)
  assert.match(adminSessionsRoute, /DELETE FROM shared_summaries WHERE session_id = \?/)

  assert.match(sharedSummaryRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(adminSettingsRoute, /'Cache-Control': 'no-store, max-age=0'/)
})

test('history route enforces multi-tenant ownership on read, update, and delete', async () => {
  const historyRoute = await source('src/app/api/history/route.ts')
  const verifyRoute = await source('src/app/api/auth/verify/route.ts')
  const signoutRoute = await source('src/app/api/auth/signout/route.ts')
  const magicLinkRoute = await source('src/app/api/auth/send-magic-link/route.ts')

  // History GET protects transcripts from cross-user reads
  assert.match(historyRoute, /if \(!session\) \{\s*return NextResponse\.json\(\{ item: null, entries: \[\] \}, \{ status: 404/)
  assert.match(historyRoute, /if \(!folder\) \{\s*return NextResponse\.json\(\{ item: null, sessions: \[\] \}, \{ status: 404/)

  // History DELETE verifies ownership before cascading deletes
  assert.match(historyRoute, /SELECT id FROM sessions WHERE id = \? AND owner_id = \?/)
  assert.match(historyRoute, /SELECT id FROM folders WHERE id = \? AND owner_id = \?/)

  // History PATCH verifies destination folder belongs to the user
  assert.match(historyRoute, /SELECT id FROM folders WHERE id = \? AND owner_id = \?/)

  // Cache-Control headers on sensitive auth and user data endpoints
  const summarizeRoute = await source('src/app/api/ai/summarize/route.ts')
  const sharedSummaryRoute = await source('src/app/api/shared/summary/route.ts')
  const adminSessionsRoute = await source('src/app/api/admin/sessions/route.ts')
  const adminAuthRoute = await source('src/app/api/auth/admin/route.ts')
  const historyPage = await source('src/app/history/page.tsx')

  assert.match(historyRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(verifyRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(signoutRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(magicLinkRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(summarizeRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(sharedSummaryRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(adminSessionsRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(adminAuthRoute, /'Cache-Control': 'no-store, max-age=0'/)
  assert.match(historyPage, /f\.owner_id === currentOwnerId/)
  assert.match(historyPage, /s\.owner_id === currentOwnerId/)
})

test('safeNextPath logic strictly prevents protocol-relative and backslash open redirect vectors', () => {
  function safeNextPath(nextParam, origin) {
    if (!nextParam || typeof nextParam !== 'string') return '/session'
    if (!nextParam.startsWith('/') || nextParam.startsWith('//') || nextParam.includes('\\')) {
      return '/session'
    }
    try {
      const parsed = new URL(nextParam, origin)
      if (parsed.origin !== origin) return '/session'
      return parsed.pathname + parsed.search + parsed.hash
    } catch {
      return '/session'
    }
  }

  const origin = 'https://noidi.9phut.org'
  assert.strictEqual(safeNextPath(null, origin), '/session')
  assert.strictEqual(safeNextPath('', origin), '/session')
  assert.strictEqual(safeNextPath('https://attacker.com', origin), '/session')
  assert.strictEqual(safeNextPath('//attacker.com', origin), '/session')
  assert.strictEqual(safeNextPath('/\\attacker.com', origin), '/session')
  assert.strictEqual(safeNextPath('/\\\\attacker.com', origin), '/session')
  assert.strictEqual(safeNextPath('/\\/attacker.com', origin), '/session')
  assert.strictEqual(safeNextPath('javascript:alert(1)', origin), '/session')
  assert.strictEqual(safeNextPath('/history?tab=1', origin), '/history?tab=1')
  assert.strictEqual(safeNextPath('/session', origin), '/session')
})

test('session lifecycle cleans up aborted sessions and finalizes unexpected stops', async () => {
  const lifecycle = await source('src/hooks/useSessionLifecycle.ts')
  const sessionPage = await source('src/app/session/page.tsx')

  // abortSession prevents ghost/unstarted records
  assert.match(lifecycle, /abortSession/)
  assert.match(lifecycle, /await db\.sessions\.delete\(currentSessionId\)/)
  assert.match(sessionPage, /await abortSession\(\)/)

  // Wake lock is cleaned up safely in finally block
  assert.match(lifecycle, /finally\s*\{\s*wakeLockRef\.current = null/)

  // Unexpected stop listener finalizes dangling session
  assert.match(lifecycle, /wasActiveRef\.current && !isActive && activeSessionRef\.current/)

  // Starting state disables partner selector to prevent mid-handshake unmount
  assert.match(sessionPage, /disabled=\{isActive \|\| isStarting \|\| recordingMode === 'one_way'\}/)

  // Recording errors are captured and rendered in the alert stack
  assert.match(sessionPage, /error:\s*recordingError/)
  assert.match(sessionPage, /recordingError\?\.message/)
})

test('service worker and PWA updater prevent stale cache lock-in and handle errors safely', async () => {
  const sw = await source('public/sw.js')
  const headers = await source('public/_headers')
  const nextConfig = await source('next.config.ts')
  const pwaUpdater = await source('src/components/PwaUpdater.tsx')

  // sw.js installation is resilient with Promise.allSettled and skips cache on install
  assert.match(sw, /Promise\.allSettled/)
  assert.match(sw, /cache:\s*'no-cache'/)
  assert.match(sw, /response\.status === 200/)
  assert.match(sw, /SKIP_WAITING/)

  // Headers prevent caching of sw.js across Cloudflare Pages and Next.js
  assert.match(headers, /\/sw\.js[\s\S]*?Cache-Control:\s*no-cache,\s*no-store,\s*must-revalidate/)
  assert.match(nextConfig, /source:\s*'\/sw\.js'[\s\S]*?Cache-Control[\s\S]*?no-store/)

  // PwaUpdater cleans up clear_cache parameter from browser address bar
  assert.match(pwaUpdater, /searchParams\.has\('clear_cache'\)/)
  assert.match(pwaUpdater, /window\.history\.replaceState/)
})

test('AI summarize API bounds payload size, entry length, and inserts summaries safely', async () => {
  const summarizeRoute = await source('src/app/api/ai/summarize/route.ts')

  // Bounded entry lengths to prevent buffer bloat
  assert.match(summarizeRoute, /original_text:\s*z\.string\(\)\.max\(5000\)/)
  assert.match(summarizeRoute, /translated_text:\s*z\.string\(\)\.max\(5000\)/)

  // Explicit raw body size check protects against chunked transfer bloat
  assert.match(summarizeRoute, /rawBody\.length > 300_000/)

  // Foreign key safe bindings avoid SQLite FK constraint crashes on unsynced sessions
  assert.match(summarizeRoute, /isSessionOwned\s*\?\s*sessionId\s*:\s*null/)
  assert.match(summarizeRoute, /isFolderOwned\s*\?\s*folderId\s*:\s*null/)
})

test('shared summary route enforces no-store on all responses and error boundaries clear PWA recovery keys', async () => {
  const sharedRoute = await source('src/app/api/shared/summary/route.ts')
  const globalError = await source('src/app/global-error.tsx')
  const appError = await source('src/app/error.tsx')

  // All shared summary responses use noStoreHeader
  assert.match(sharedRoute, /const noStoreHeader = \{\s*'Cache-Control':\s*'no-store,\s*max-age=0'\s*\}/)
  assert.match(sharedRoute, /status:\s*401,\s*headers:\s*noStoreHeader/)
  assert.match(sharedRoute, /status:\s*404,\s*headers:\s*noStoreHeader/)
  assert.match(sharedRoute, /status:\s*500,\s*headers:\s*noStoreHeader/)

  // Both error boundaries clear recovery throttling keys
  assert.match(globalError, /sessionStorage\.removeItem\('pwa_chunk_last_recovery'\)/)
  assert.match(globalError, /sessionStorage\.removeItem\('pwa_last_reload'\)/)
  assert.match(appError, /sessionStorage\.removeItem\('pwa_chunk_last_recovery'\)/)
  assert.match(appError, /sessionStorage\.removeItem\('pwa_last_reload'\)/)
})
