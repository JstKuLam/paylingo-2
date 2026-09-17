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
  assert.match(auth, /normalizeOrigin/)
  assert.match(route, /timingSafeEqualStr\(credentialId, creds\.passkeyCredId\)/)
  assert.match(route, /cookieStore\.delete\(CHALLENGE_COOKIE_NAME\)/)
  assert.match(route, /admin-passkey-verify:/)
  assert.match(route, /timingSafeEqualStr\(clientData\.challenge, expectedChallenge\)/)
  assert.match(route, /crypto\.subtle\.importKey\(/)
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
  assert.match(db, /\.upgrade\(async/)
  assert.match(db, /typeof window === 'undefined' \|\| typeof indexedDB === 'undefined'/)
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
  assert.match(sw, /response\.status === 200 && !response\.redirected/)
  assert.match(sw, /res\.status === 200 && !res\.redirected/)
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

  // Universal noStoreHeader on all responses
  assert.match(summarizeRoute, /const noStoreHeader = \{\s*['"]Cache-Control['"]:\s*['"]no-store,\s*max-age=0['"],?\s*\}/)

  // Strips null bytes from transcript text
  assert.match(summarizeRoute, /\.replace\(\/\\0\/g,\s*['"]['"]\)/)

  // Checks model blockReason and finishReason
  assert.match(summarizeRoute, /blockReason/)
  assert.match(summarizeRoute, /finishReason/)

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

  // DELETE revocation handler enforces authentication and ownership
  assert.match(sharedRoute, /export async function DELETE/)
  assert.match(sharedRoute, /DELETE FROM shared_summaries WHERE id = \?/)
  assert.match(sharedRoute, /owner_id = \?/)

  // Both error boundaries clear recovery throttling keys
  assert.match(globalError, /sessionStorage\.removeItem\('pwa_chunk_last_recovery'\)/)
  assert.match(globalError, /sessionStorage\.removeItem\('pwa_last_reload'\)/)
  assert.match(appError, /sessionStorage\.removeItem\('pwa_chunk_last_recovery'\)/)
  assert.match(appError, /sessionStorage\.removeItem\('pwa_last_reload'\)/)
})

test('admin routes enforce no-store headers, validate session IDs, and prevent masked key fallback bugs', async () => {
  const adminSettings = await source('src/app/api/admin/settings/route.ts')
  const adminSessions = await source('src/app/api/admin/sessions/route.ts')
  const adminUsage = await source('src/app/api/admin/usage-logs/route.ts')
  const adminAuth = await source('src/app/api/auth/admin/route.ts')

  // Masked key fallback bug fix: must check if existing key exists before reusing
  assert.match(adminSettings, /if \(api_key === MASKED_API_KEY\)\s*\{\s*if \(!existing \|\| !existing\.api_key\)/)

  // Model identifier regex validation and bounds
  assert.match(adminSettings, /regex\(\/\^\[a-zA-Z0-9\._-\]\+\$\//)

  // noStoreHeader coverage on all admin endpoints
  assert.match(adminSettings, /const noStoreHeader = \{\s*'Cache-Control':\s*'no-store,\s*max-age=0'\s*\}/)
  assert.match(adminSessions, /const noStoreHeader = \{\s*'Cache-Control':\s*'no-store,\s*max-age=0'\s*\}/)
  assert.match(adminUsage, /const noStoreHeader = \{\s*'Cache-Control':\s*'no-store,\s*max-age=0'\s*\}/)
  assert.match(adminAuth, /const noStoreHeader = \{\s*'Cache-Control':\s*'no-store,\s*max-age=0'\s*\}/)

  // Admin sessions validates ID parameter and handles malformed JSON
  assert.match(adminSessions, /!id \|\| typeof id !== 'string' \|\| id\.length > 64/)
  assert.match(adminSessions, /sessionId\.length > 64/)

  // Admin usage logs bounds limit
  assert.match(adminUsage, /safeLimit = Math\.min\(Math\.max\(1,/)
})

test('auth endpoints enforce CSPRNG OTP, input length bounds, and universal no-store headers', async () => {
  const sessionModule = await source('src/lib/auth/session.ts')
  const sendMagicLink = await source('src/app/api/auth/send-magic-link/route.ts')
  const verifyRoute = await source('src/app/api/auth/verify/route.ts')
  const signoutRoute = await source('src/app/api/auth/signout/route.ts')
  const callbackRoute = await source('src/app/auth/callback/route.ts')
  const rateLimitModule = await source('src/lib/rate-limit.ts')

  // CSPRNG OTP generation
  assert.match(sessionModule, /crypto\.getRandomValues/)
  assert.match(sessionModule, /generateSecureOtp/)
  assert.doesNotMatch(sessionModule, /Math\.random\(\)/)

  // Token bounds checking
  assert.match(sessionModule, /cleanInput\.length < 6 \|\| cleanInput\.length > 128/)
  assert.match(verifyRoute, /cleanToken\.length < 6 \|\| cleanToken\.length > 128/)
  assert.match(callbackRoute, /cleanToken\.length < 6 \|\| cleanToken\.length > 128/)

  // no-store on rate limiting
  assert.match(rateLimitModule, /'Cache-Control':\s*'no-store,\s*max-age=0'/)

  // universal no-store headers
  assert.match(sendMagicLink, /const noStoreHeader = \{\s*['"]Cache-Control['"]:\s*['"]no-store,\s*max-age=0['"],?\s*\}/)
  assert.match(verifyRoute, /const noStoreHeader = \{\s*['"]Cache-Control['"]:\s*['"]no-store,\s*max-age=0['"],?\s*\}/)
  assert.match(signoutRoute, /const noStoreHeader = \{\s*['"]Cache-Control['"]:\s*['"]no-store,\s*max-age=0['"],?\s*\}/)

  // Signout supports Bearer token as well as cookie
  assert.match(signoutRoute, /authHeader\?\.startsWith\('Bearer '\)/)
})

test('client-side sync reconciliation preserves pending entries and checks server status before local mutations', async () => {
  const sessionDetail = await source('src/app/history/sessions/[id]/SessionDetailClient.tsx')
  const folderDetail = await source('src/app/history/folders/[id]/FolderDetailClient.tsx')

  // Transcript entries reconciliation protects pending edits
  assert.match(sessionDetail, /localPendingEntryIds\s*=\s*new Set/)
  assert.match(sessionDetail, /safeEntries\s*=\s*formattedEntries\.filter/)
  assert.match(sessionDetail, /db\.transcriptEntries\.bulkPut\(safeEntries\)/)

  // Server response status verified before local session deletion
  assert.match(sessionDetail, /const res = await fetch\('\/api\/history'/)
  assert.match(sessionDetail, /if \(!res\.ok\)\s*\{\s*throw new Error/)

  // Server response status verified before local folder operations
  assert.match(folderDetail, /const res = await fetch\('\/api\/history'/)
  assert.match(folderDetail, /if \(!res\.ok\)\s*\{\s*throw new Error/)
})

test('rate limiter bounds IP length, preserves LRU ordering, and edge middleware secures redirects', async () => {
  const rateLimit = await source('src/lib/rate-limit.ts')
  const middleware = await source('src/middleware.ts')
  const headers = await source('public/_headers')

  // IP bounding and headers
  assert.match(rateLimit, /rawIp\.slice\(0,\s*45\)/)
  assert.match(rateLimit, /x-real-ip/)

  // LRU positioning on increment
  assert.match(rateLimit, /buckets\.delete\(options\.key\)/)
  assert.match(rateLimit, /buckets\.set\(options\.key,\s*current\)/)

  // Edge middleware no-store header on root auth redirect
  assert.match(middleware, /NextResponse\.redirect\(new URL\('\/session',\s*request\.url\),\s*\{\s*headers:[\s\S]*?['"]Cache-Control['"]:\s*['"]no-store,\s*max-age=0['"]/)

  // Deprecated Supabase removed from CSP
  assert.doesNotMatch(headers, /supabase\.co/)
})

test('sync manager retries failed entries, batches payloads, and sync API validates bounds', async () => {
  const syncManager = await source('src/lib/sync-manager.ts')
  const syncRoute = await source('src/app/api/sync/route.ts')

  // Retries failed transcript entries
  assert.match(syncManager, /db\.transcriptEntries\.where\('sync_status'\)\.equals\('failed'\)\.modify\(\{\s*sync_status:\s*'pending'\s*\}\)/)

  // Batches entries and marks failed on network rejection
  assert.match(syncManager, /BATCH_ENTRIES_LIMIT/)
  assert.match(syncManager, /sync_status:\s*'failed'/)

  // Sync route checks array limits and error response no-store headers
  assert.match(syncRoute, /folders\.length > 500 \|\| sessions\.length > 500 \|\| entries\.length > 2000/)
  assert.match(syncRoute, /status:\s*401,\s*headers:\s*noStoreHeader/)
  assert.match(syncRoute, /status:\s*500,\s*headers:\s*noStoreHeader/)
})

test('session lifecycle hook manages dual silence timers, sanitizes duration, and prevents leaks', async () => {
  const lifecycle = await source('src/hooks/useSessionLifecycle.ts')
  const sessionPage = await source('src/app/session/page.tsx')

  // Force-stop timer separation and universal cleanup
  assert.match(lifecycle, /forceStopTimerRef/)
  assert.match(lifecycle, /clearSilenceTimers/)
  assert.match(lifecycle, /visibilityState === 'visible'/)

  // Duration computation protects against NaN values
  assert.match(lifecycle, /Number\.isFinite\(rawStartTime\)/)
  assert.match(lifecycle, /Number\.isFinite\(activeSession\.duration_seconds\)/)

  // Session page unmount cleanup uses stable refs
  assert.match(sessionPage, /isActiveRef\.current/)
  assert.match(sessionPage, /stopRef\.current/)
})

test('history pages guard fallback IDs, prevent non-JSON crashes, and sanitize total duration', async () => {
  const historyPage = await source('src/app/history/page.tsx')
  const sessionDetail = await source('src/app/history/sessions/[id]/SessionDetailClient.tsx')
  const folderDetail = await source('src/app/history/folders/[id]/FolderDetailClient.tsx')

  // Total duration guards against NaN values
  assert.match(historyPage, /Number\.isFinite\(session\.duration_seconds\)/)
  assert.match(historyPage, /r\.headers\.get\('content-type'\)/)

  // Session and Folder detail bail early on fallback id
  assert.match(sessionDetail, /if \(!id \|\| id === 'fallback'\) return/)
  assert.match(sessionDetail, /r\.headers\.get\('content-type'\)/)
  assert.match(folderDetail, /if \(!id \|\| id === 'fallback'\) return/)
  assert.match(folderDetail, /r\.headers\.get\('content-type'\)/)
})

test('app-version checks client semver, rate limits requests, and sw protects against cache quota errors', async () => {
  const appVersion = await source('src/app/api/app-version/route.ts')
  const sw = await source('public/sw.js')

  // App version semver & rate limiting
  assert.match(appVersion, /checkRateLimit\(\{[\s\S]*?key:\s*`app-version:\$\{getRequestIp\(request\)\}`/)
  assert.match(appVersion, /compareSemver/)
  assert.match(appVersion, /forceUpdate/)
  assert.match(appVersion, /needsUpdate/)
  assert.match(appVersion, /'Cache-Control': 'no-store, max-age=0'/)

  // Service worker handles cache.put errors gracefully
  assert.match(sw, /try\s*\{[\s\S]*?cache\.put\(request,\s*response\.clone\(\)\);[\s\S]*?\}\s*catch\s*\(cacheErr\)/)
  assert.match(sw, /try\s*\{[\s\S]*?cache\.put\('\/',\s*response\.clone\(\)\);[\s\S]*?\}\s*catch\s*\(cacheErr\)/)
})

test('sync route prevents clock skew exploits, enforces LWW, and sync manager prunes orphaned entries', async () => {
  const syncRoute = await source('src/app/api/sync/route.ts')
  const syncManager = await source('src/lib/sync-manager.ts')

  // Clock skew clamping & LWW conflict resolution in sync route
  assert.match(syncRoute, /clampIsoTimestamp/)
  assert.match(syncRoute, /now \+ 60_000/)
  assert.match(syncRoute, /WHERE excluded\.updated_at >= folders\.updated_at OR folders\.updated_at IS NULL/)
  assert.match(syncRoute, /WHERE excluded\.updated_at >= sessions\.updated_at OR sessions\.updated_at IS NULL/)
  assert.match(syncRoute, /Math\.max\(0,\s*Math\.floor/)

  // Orphaned entries pruning & concurrency check in sync manager
  assert.match(syncManager, /!localSess[\s\S]*?db\.transcriptEntries\.where\('session_id'\)\.equals\(sessId\)\.delete\(\)/)
  assert.match(syncManager, /current\.updated_at === folder\.updated_at/)
  assert.match(syncManager, /current\.updated_at === session\.updated_at/)
})

test('magic link auth enforces per-email rate limits, CRLF sanitization, dot-stuffing, and callback throttling', async () => {
  const sendRoute = await source('src/app/api/auth/send-magic-link/route.ts')
  const smtp = await source('src/lib/auth/smtp.ts')
  const authUtils = await source('src/lib/auth-utils.ts')
  const sessionAuth = await source('src/lib/auth/session.ts')
  const callbackRoute = await source('src/app/auth/callback/route.ts')

  // Per-email rate limiting & CRLF stripping
  assert.match(sendRoute, /magic-link-email:\$\{sanitizedEmail\}/)
  assert.match(sendRoute, /replace\(\/\[\\r\\n\\x00-\\x1f\]\/g,\s*''\)/)

  // Auth utils CRLF defense & length bound
  assert.match(authUtils, /sanitized\.length > 254/)
  assert.match(authUtils, /sanitized\.includes\('\\r'\) \|\| sanitized\.includes\('\\n'\)/)

  // SMTP transport CRLF injection defense & RFC 5321 dot-stuffing
  assert.match(smtp, /cleanTo = \(options\.to \|\| ''\)\.replace\(\/\[\\r\\n\\x00-\\x1f\]\/g,\s*''\)\.trim\(\)/)
  assert.match(smtp, /cleanSubject = \(options\.subject \|\| ''\)\.replace\(\/\[\\r\\n\\x00-\\x1f\]\/g,\s*''\)\.trim\(\)/)
  assert.match(smtp, /cleanHtml = \(options\.html \|\| ''\)\.replace\(\/\^\\\.\/gm,\s*'\.\.'\)/)

  // Session token verification checks allowed email
  assert.match(sessionAuth, /!record \|\| !isAllowedEmail\(record\.email\)/)

  // Callback route rate limits attempts
  assert.match(callbackRoute, /auth-callback:\$\{getRequestIp\(request\)\}/)
})

test('Dexie database version 4 adds compound indexes, sanitizes legacy entries, and sets sync_status pending on claimed records', async () => {
  const dbSource = await source('src/lib/db.ts')

  // Version 4 compound index and stores
  assert.match(dbSource, /version\(4\)\.stores\(\{[\s\S]*?\[owner_id\+started_at\]/)
  assert.match(dbSource, /version\(4\)[\s\S]*?\.upgrade\(async/)

  // Upgrade data validation
  assert.match(dbSource, /typeof session\.duration_seconds !== 'number' \|\| isNaN\(session\.duration_seconds\)/)
  assert.match(dbSource, /entry\.end_ms < entry\.start_ms/)

  // Claimed legacy records set to pending
  assert.match(dbSource, /await db\.sessions\.update\(session\.id,\s*\{\s*owner_id:\s*ownerId,\s*sync_status:\s*'pending'\s*\}\)/)
  assert.match(dbSource, /await db\.folders\.update\(folder\.id,\s*\{\s*owner_id:\s*ownerId,\s*sync_status:\s*'pending'\s*\}\)/)
})

test('Soniox key route enforces dual per-user and per-IP rate limits and throttles account deletion', async () => {
  const sonioxRoute = await source('src/app/api/auth/soniox-key/route.ts')

  // Dual rate limits on key minting
  assert.match(sonioxRoute, /soniox-key-user:\$\{user\.id\}/)
  assert.match(sonioxRoute, /soniox-key-ip:\$\{getRequestIp\(request\)\}/)

  // Account deletion rate limit
  assert.match(sonioxRoute, /account-delete:\$\{user\.id\}:\$\{getRequestIp\(request\)\}/)
})

test('useSessionLifecycle ensures monotonic session duration and rejects zombie entries on abort', async () => {
  const lifecycle = await source('src/hooks/useSessionLifecycle.ts')

  // Monotonic duration preservation across unmount and unexpected stop
  assert.match(lifecycle, /duration = Math\.max\(\s*Number\.isFinite\(session\.duration_seconds\)/)
  assert.match(lifecycle, /latestEntryMs = messagesRef\.current\.reduce/)
  assert.match(lifecycle, /durationFromEntries = Math\.ceil\(latestEntryMs \/ 1000\)/)

  // Prevents zombie entry write if session was aborted or switched
  assert.match(lifecycle, /if \(activeSessionRef\.current !== sessionId\) return[\s\S]*?db\.transcriptEntries\.bulkPut/)
})

test('PDF and HTML report generators sanitize empty session titles and provide crash-proof escapeHtml', async () => {
  const pdfGen = await source('src/lib/pdf-generator.ts')
  const htmlGen = await source('src/lib/html-generator.ts')

  // PDF generator uses safe variables in header and table header
  assert.match(pdfGen, /<h1>\$\{escapeHtml\(safeSessionName\)\}<\/h1>/)
  assert.match(pdfGen, /Ngôn ngữ đối tác:\s*\$\{escapeHtml\(safePartnerLangName\)\}/)
  assert.match(pdfGen, /<th>Bạn · Tiếng Việt<\/th><th lang="\$\{safeLanguage\}">Đối tác · \$\{escapeHtml\(safePartnerLangName\)\}<\/th>/)

  // HTML generator crash-proof escapeHtml and safe session title
  assert.match(htmlGen, /if \(typeof value !== 'string'\) return ''/)
  assert.match(htmlGen, /safeSessionName = typeof sessionName === 'string' && sessionName\.trim\(\) \? sessionName\.trim\(\) : 'Tóm tắt Hội thoại PayLingo'/)
})

