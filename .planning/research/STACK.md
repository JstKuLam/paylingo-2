# Technology Stack — PayLingo

**Project:** PayLingo (real-time bilingual speech translation PWA)
**Researched:** 2026-05-27
**Overall confidence:** HIGH for core libs (verified via npm registry + official SDK source); MEDIUM for access-code auth pattern (synthesized from official primitives, no off-the-shelf solution)

> **Mode:** Validate-and-refine. PROJECT.md fixed the broad shape (Next.js + Supabase + Vercel + Soniox). This file confirms each choice, pins concrete versions, and flags two corrections to PROJECT.md.

---

## TL;DR — Recommended Stack

| Layer | Pick | Confidence |
|-------|------|-----------|
| Framework | Next.js **16.2.6** (App Router) | HIGH |
| Runtime | React **19.2.6** | HIGH |
| Language | TypeScript **5.6.0** | HIGH |
| Styling | Tailwind CSS **4.3.0** + shadcn/ui (CLI **4.8.1**) | HIGH |
| STT + translation | **`@soniox/react` 2.1.0** + **`@soniox/node` 2.1.0** (model `stt-rt-v4`) | HIGH |
| Audio capture | `@soniox/react`'s built-in `MicrophoneSource` (wraps `getUserMedia` + `AudioWorkletNode`) | HIGH |
| Database / Auth / Storage | Supabase: `@supabase/supabase-js` **2.106.2** + `@supabase/ssr` **0.10.3** | HIGH |
| Access-code auth | `supabase.auth.signInAnonymously()` + custom `access_codes` table + RLS keyed on `access_code_id` in `raw_app_meta_data` (see §4) | MEDIUM |
| Local-first store | **Dexie 4.4.2** (IndexedDB wrapper) | HIGH |
| Sync engine | Custom `outbox` table in IndexedDB → Supabase REST via `useEffect` + `navigator.onLine` (no library) | HIGH |
| Wake Lock | Native `navigator.wakeLock.request('screen')` (no wrapper) | HIGH |
| PDF export | **`@react-pdf/renderer` 4.5.1** with bundled Noto fonts for CJK + Vietnamese diacritics | HIGH |
| PWA / service worker | **`@serwist/next` 9.5.11** (Serwist — successor to abandoned `next-pwa`) | HIGH |
| Form / validation | **Zod 4.4.3** + React Hook Form 7.x | HIGH |
| Icons | `lucide-react` **1.16.0** | HIGH |
| Deploy | **Vercel** (Hobby tier OK for MVP; client→Soniox WebSocket bypasses Vercel) | HIGH |
| Optional state | `zustand` **5.0.13** for cross-component recording state (the @soniox/react hook covers most cases) | MEDIUM |

**Two corrections to PROJECT.md identified:**
1. **Soniox pricing is $0.12/hour (real-time STT), not $0.10/minute.** PROJECT.md is 60× over budget. See §3.
2. **Next.js 15 → 16 upgrade is safe.** Next.js 16.2.6 (May 2026) is stable, ships Turbopack as default, App Router unchanged. PROJECT.md said "Next.js 15"; recommend Next.js 16 unless a specific 15 LTS pin is desired.

---

## 1. Framework: Next.js 16 (App Router) + React 19

| Item | Value |
|------|-------|
| **Package** | `next@16.2.6` |
| **Released** | May 2026 (latest stable) |
| **Peer dep** | React 18 or 19 |
| **App Router status** | Stable since 13.4; unchanged in 16 |

### Why Next.js 16 for THIS use case

- **Direct client → Soniox WebSocket.** Browser opens `wss://stt-rt.soniox.com/transcribe-websocket` directly using a temporary API key minted by a Next.js Route Handler. Vercel never proxies the WebSocket — sidesteps the historical "no WS on serverless" limitation (still true on Hobby).
- **Route Handlers** (`app/api/auth/temporary-key/route.ts`) handle the only two server-side jobs: minting Soniox temp keys and validating access codes. Both are tiny POST handlers.
- **Server Components for admin panel.** Admin reads from Supabase using a server client (`createServerClient` from `@supabase/ssr`) — no client-side data fetching needed for history list, dashboard stats.
- **React 19 transitions** are useful for layout switcher (`useTransition` for smooth flips) but not load-bearing.
- **Turbopack stable in 16** (was opt-in in 15). Dev startup ~10× faster — matters when iterating on UI.

### Version-specific gotchas

- **Async cookies/headers in 15+.** `cookies()` returns `Promise<ReadonlyRequestCookies>` (must `await`). The `@supabase/ssr` 0.5+ docs are written for this.
- **`unstable_after` → `after`** in 16 — useful for logging Soniox usage post-response without blocking the user.
- **`next.config.ts`** preferred over `.js`/`.mjs` — give yourself type-checking on `headers()`, `rewrites()`, etc.

### Alternatives rejected

| Alternative | Why not |
|------------|---------|
| Next.js 15.3.9 (LTS pinned) | Fine fallback if 16 ever breaks something. No reason to pin pre-emptively — App Router contract unchanged. |
| TanStack Start | Younger ecosystem, no Vercel-grade deployment story, fewer Supabase patterns. |
| Vite + React Router + Hono on a separate Node host | More config, two deploy targets, no SSR cache for the admin panel. PWA tooling weaker (no Serwist plugin). |
| SvelteKit | Outside user's stated stack. |

---

## 2. Soniox v4 Real-Time (validated)

User has committed to Soniox. This section pins the **exact wire protocol and SDK surface** so the roadmap can size implementation work concretely.

### 2.1 Packages

```bash
npm install @soniox/react @soniox/node
```

| Package | Version | Side | Role |
|---------|---------|------|------|
| `@soniox/react` | 2.1.0 | client | `useRecording` hook, mic capture, render-safe state |
| `@soniox/client` | 2.1.0 | client (transitive of `@soniox/react`) | Core WebSocket + audio worklet |
| `@soniox/node` | 2.1.0 | server | Mints temporary API keys via `client.auth.createTemporaryKey()` |

Peer dep: `react >=18.0.0` — React 19 works (verified in @soniox/react's own devDependencies).

### 2.2 Architecture (definitive)

```
Browser
  └─ <SonioxProvider> (or inline config in useRecording)
       └─ useRecording({ model, translation, enable_language_identification })
            ├─ MicrophoneSource (getUserMedia → AudioWorkletNode → PCM_S16LE @ 16kHz)
            └─ WebSocket → wss://stt-rt.soniox.com/transcribe-websocket
                              ↑ uses TEMPORARY api_key (5-min TTL)

Vercel server (Next.js Route Handler)
  └─ POST /api/soniox/temporary-key
        └─ SonioxNodeClient.auth.createTemporaryKey({
             usage_type: 'transcribe_websocket',
             expires_in_seconds: 300
           })
        └─ Long-lived SONIOX_API_KEY stays server-side (in env var)
```

### 2.3 Concrete config for PayLingo

```tsx
// app/(meeting)/recording-panel.tsx — client component
'use client';
import { useRecording } from '@soniox/react';

const { finalTokens, partialTokens, state, start, stop, pause, resume, reconnect, isReconnecting } = useRecording({
  // Connection — fetches fresh 5-min temp key per session
  config: async () => {
    const res = await fetch('/api/soniox/temporary-key', { method: 'POST' });
    const { apiKey } = await res.json();
    return { api_key: apiKey };
  },

  // Model
  model: 'stt-rt-v4',                       // latest, ~1-2s latency, multilingual

  // The PayLingo two-pane setup:
  translation: {
    type: 'two_way',
    language_a: 'vi',                       // Panel B (locked Vietnamese)
    language_b: partnerLang,                // Panel A (en, zh, ja, ko, es, ru, de, th)
  },
  enable_language_identification: true,     // populates token.language → drives panel routing
  enable_endpoint_detection: true,          // utterance boundaries → smoother UI

  // Optional but recommended for business contexts:
  // language_hints: ['vi', partnerLang],
  // context: {
  //   general: [{ key: 'domain', value: 'business meeting' }],
  //   terms: ['PayLingo', userCompanyName, ...]
  // },

  // Resilience (CRITICAL for PayLingo — meetings can run 30-90 min):
  auto_reconnect: true,
  max_reconnect_attempts: 5,
  reconnect_base_delay_ms: 1000,
  reset_transcript_on_reconnect: false,     // KEEP transcript across reconnects

  // Output grouping:
  groupBy: 'language',                      // auto-grouped by token.language — direct map to panels

  // Event hooks:
  onToken: (token) => { /* push to IndexedDB outbox */ },
  onError: (err) => { /* show offline indicator */ },
  onReconnected: ({ attempt }) => { /* clear "reconnecting" UI */ },
});
```

### 2.4 The wire protocol (for reference)

After connecting to `wss://stt-rt.soniox.com/transcribe-websocket`, the client sends **one JSON config message** then binary audio chunks. Schema (extracted from `@soniox/core/src/realtime/stt.ts`):

```jsonc
{
  "api_key": "temp:...",                 // required — temporary key string
  "model": "stt-rt-v4",                  // required
  "audio_format": "auto",                // SDK uses 'auto' for the worklet output
  "language_hints": ["vi", "en"],        // optional, biases recognition
  "enable_language_identification": true,
  "enable_endpoint_detection": true,
  "translation": {
    "type": "two_way",
    "language_a": "vi",
    "language_b": "en"
  },
  "client_reference_id": "session_<uuid>" // optional, surfaces in usage_logs for billing reconciliation
}
```

Each result message back is a JSON object with `tokens[]`, where each token has:
- `text`, `is_final`, `confidence`
- `language` (which panel to route to)
- `translation_status: 'original' | 'translation' | 'none'`
- `source_language` (when translated)
- `start_ms`, `end_ms` (for timestamps in PDF export)

Tokens with `is_final: false` are partial — show them in muted color, replace on next batch.

### 2.5 Models — pick exactly one

From `https://soniox.com/docs/stt/models`:

| Model | Use it? | Why |
|-------|---------|-----|
| `stt-rt-v4` | **YES** | Current GA real-time model. Multilingual, low-latency (~1-2s end-to-end), supports `two_way` translation. |
| `stt-rt-v3` | No | Previous gen. Inferior accuracy and latency. |
| `stt-rt-preview-v1/v2` | No | Preview channels. Will be deprecated. |
| `stt-async-v4` | No | For uploaded files only. PayLingo is real-time. |

### 2.6 Reconnect handling (your downstream consumer asked)

The SDK handles this **for you**:

- **Auto-reconnect on retriable errors** (network drop, idle disconnect) — set `auto_reconnect: true`, transcript persists by default.
- **Manual reconnect on stale connections** — call the returned `reconnect()` from `visibilitychange` listener. The hook's docs literally cite this use case.
- **The `is_final` contract.** Tokens already marked `is_final: true` will NOT be re-sent on reconnect. Only the partial trailing edge may be re-emitted. Your IndexedDB write logic should de-dupe by `(session_id, start_ms, text)` to be safe.

```tsx
useEffect(() => {
  const onVisible = () => {
    if (document.visibilityState === 'visible' && isActive) {
      reconnect();  // force-renews stale WS after device sleep
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}, [isActive, reconnect]);
```

### 2.7 Pricing — correction to PROJECT.md

| Item | Soniox 2026 published rate |
|------|----------------------------|
| Real-time STT + translation | **$0.12 / hour** |
| Async STT (file upload) | $0.10 / hour |
| TTS | $0.70 / hour of audio |

**PROJECT.md says "$0.10/minute" — this is wrong by 60×.** Actual MVP cost ceiling:

> 10 users × 5 hours/month × $0.12/hour = **$6/month total**.

This means PayLingo can sustain free or near-free pricing for early users. Flag this back to the user — it changes the business case for unlimited access codes.

Source: https://soniox.com/pricing (verified 2026-05-27).

### 2.8 Alternatives — for completeness only

| Service | Why not (vs Soniox) |
|---------|---------------------|
| Deepgram + DeepL | Two separate APIs, no built-in language ID + translation in one stream, higher combined latency, much higher cost. |
| Google Cloud Speech + Translation | Multi-service, no single WebSocket session for two-way, complex billing. |
| OpenAI Realtime API (`gpt-4o-realtime`) | TTS-first, designed for voice agents. Real-time translation works but is expensive ($/minute model). |
| AssemblyAI Universal-Streaming | No built-in translation. STT only. |

User-confirmed choice: **stay on Soniox**.

---

## 3. Audio Capture

**Decision:** Use Soniox's built-in `MicrophoneSource` — don't roll your own.

`@soniox/react`'s `useRecording` already handles:
- `navigator.mediaDevices.getUserMedia({ audio: true })`
- `AudioContext` + `AudioWorkletNode` (modern path, NOT deprecated `ScriptProcessor`)
- Down-conversion to mono PCM_S16LE at 16 kHz (what Soniox v4 expects)
- Mute/unmute detection (the `isSourceMuted` flag, fired on hardware mute or OS-level mute)
- Permission resolution via `BrowserPermissionResolver` (uses Permissions API where available)

You only handle: rendering a "request mic permission" prompt the first time, and a fallback message when `unsupportedReason` is set (e.g., insecure context / no `MediaDevices`).

### Custom audio source (out of scope for v1)

If you ever need to capture from a non-mic source (e.g., a virtual cable for Zoom audio), implement the `AudioSource` interface and pass via `source:` prop. Don't pre-build this — PROJECT.md scopes online meeting integration out.

### Pitfalls

- **iOS Safari requires user gesture.** Don't call `start()` until after a click handler. The SDK throws otherwise. PayLingo's "Start" button satisfies this.
- **HTTPS required.** `getUserMedia` is blocked on insecure origins. Vercel gives you HTTPS by default; no action needed.
- **Echo cancellation defaults.** `getUserMedia({ audio: true })` defaults to `echoCancellation: true, noiseSuppression: true`. The SDK passes these through. **Don't override** for PayLingo — partners speaking near the mic benefit from noise suppression.

---

## 4. Database + Auth + Storage: Supabase

| Package | Version | Notes |
|---------|---------|-------|
| `@supabase/supabase-js` | 2.106.2 | Browser + server JS client (Mar 2025–May 2026 continuous releases) |
| `@supabase/ssr` | 0.10.3 | Next.js App Router helpers (cookie-based sessions across RSC / Route Handler / Middleware) |

### 4.1 Why Supabase (not e.g. Neon + Auth.js)

- Postgres + Auth + Realtime + Storage from one CLI/dashboard.
- Free tier: 500MB DB + 1GB storage + 50k MAU + unlimited API requests on Hobby — fits a 20-user MVP comfortably.
- **Row-Level Security (RLS)** maps directly to PayLingo's "user only sees their own sessions" requirement.
- `@supabase/ssr` 0.10 has the canonical Next.js App Router pattern (server client with `cookies()` from `next/headers`, middleware for session refresh, browser client with auto-refresh).

### 4.2 Access-code auth pattern (the tricky one)

**Recommendation: Anonymous Sign-in + Access Code Validation Table.**

This is the cleanest pattern that keeps you inside Supabase Auth (so RLS "just works") while supporting code-based entry. The pattern:

#### Schema

```sql
-- Admin-managed codes
create table public.access_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,           -- 8-12 char random, displayed to user
  label       text not null,                  -- "Acme Corp Q2 trial"
  expires_at  timestamptz,
  minute_limit integer,                       -- null = unlimited
  minutes_used integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Sessions tied to a code (and to the anon auth user that entered it)
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  access_code_id  uuid not null references public.access_codes(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  partner_language text not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  duration_seconds integer
);

create table public.transcript_entries (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  panel           text not null check (panel in ('A','B')),
  language        text not null,
  text            text not null,
  start_ms        integer not null,
  end_ms          integer not null,
  is_final        boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Admin flag is stored on auth.users metadata (set via Studio for the one admin account)
-- Admin signs in with email/password; everyone else uses signInAnonymously + code.
```

#### Login flow (user side)

```ts
// 1. Anonymous sign-in (creates auth.users row with is_anonymous = true)
const { data: authData } = await supabase.auth.signInAnonymously();

// 2. POST /api/auth/redeem-code { code: "ABC12345" }
//    Server validates, links code → user via app_metadata, updates user.
//
// In the Route Handler (uses service-role key):
const admin = createServiceRoleClient();
const { data: code } = await admin
  .from('access_codes')
  .select('id, expires_at, minute_limit, minutes_used, is_active')
  .eq('code', input.code)
  .single();

if (!code || !code.is_active || (code.expires_at && new Date(code.expires_at) < new Date())) {
  return Response.json({ error: 'invalid_code' }, { status: 401 });
}

// Stamp access_code_id into auth user's app_metadata (NOT user_metadata —
// app_metadata is server-only and visible in JWT claims, perfect for RLS).
await admin.auth.admin.updateUserById(authData.user.id, {
  app_metadata: { access_code_id: code.id, role: 'partner' },
});

// Client refreshes session to pull new JWT with the claim:
await supabase.auth.refreshSession();
```

#### RLS

```sql
-- Helper: pull access_code_id from JWT (set via app_metadata)
create or replace function public.current_access_code_id() returns uuid
language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'access_code_id')::uuid,
    null
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

alter table public.sessions enable row level security;
create policy sessions_owner_or_admin on public.sessions
  for all
  using (
    is_admin()
    or access_code_id = current_access_code_id()
  )
  with check (
    is_admin()
    or access_code_id = current_access_code_id()
  );

alter table public.transcript_entries enable row level security;
create policy transcript_entries_via_session on public.transcript_entries
  for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = transcript_entries.session_id
        and (is_admin() or s.access_code_id = current_access_code_id())
    )
  );

alter table public.access_codes enable row level security;
create policy access_codes_admin_only on public.access_codes
  for all
  using (is_admin())
  with check (is_admin());
```

#### Why this beats the obvious alternatives

| Alternative pattern | Why not |
|---------------------|---------|
| **Custom JWT minted by Next.js, set as Supabase session via `setSession`** | Possible but you lose `auth.users` lifecycle, and you have to sign with Supabase's JWT secret (rotated when project secret rotates). Operational risk. |
| **No Supabase Auth at all; pure custom session cookie** | Loses Realtime channel auth, loses RLS, you re-implement session refresh + CSRF protection. |
| **Magic-link email auth** | Out of scope per PROJECT.md ("Email/password auth — out of scope"). |
| **Map code → service-role queries from API routes** | Workable but every read goes through a Next.js handler. No realtime, no client SDK. More code. |
| **Supabase phone OTP** | Requires Twilio integration and per-message cost. Overkill. |

### 4.3 Postgres setup notes

- **`pgcrypto`** for `gen_random_uuid()` — enable from Studio extensions.
- **Index** `sessions(access_code_id, started_at desc)` for history list (most common query).
- **Index** `transcript_entries(session_id, start_ms)` for in-order playback during edit.
- **Full-text search:** add a `tsvector` generated column on `transcript_entries.text` later (admin search use case).

### 4.4 Realtime — do you need it?

For PayLingo v1: **no**. The transcript stream comes from Soniox WebSocket, not from Postgres. The admin panel's "tổng phút theo code" dashboard refreshes on page load. Reserve Supabase Realtime for v2 (e.g., live admin observing a partner's session).

---

## 5. Local-First Persistence: Dexie

| Package | Version | Notes |
|---------|---------|-------|
| `dexie` | 4.4.2 | TypeScript-first IndexedDB wrapper, ~25 kB gz |

### Why Dexie over `idb`

| | Dexie | `idb` |
|---|-------|-------|
| API ergonomics | Promise + querying DSL (`db.entries.where('session_id').equals(x).toArray()`) | Thin wrapper around raw IDB (manual cursors) |
| Schema migrations | Built-in `.version().stores()` | Manual `onupgradeneeded` |
| Bundle size | ~25 kB gz | ~3 kB gz |
| Maintained | Active (4.x line) | Active |
| Fit for PayLingo | Yes — schema evolves (sessions, transcript_entries, outbox) and we want queries by `session_id` and `created_at`. | Works but you write the cursor code yourself. |

The 22 kB difference is a non-issue on a meeting app. Pick the better DX.

### Schema (mirrors Postgres tables for sync)

```ts
// lib/db/dexie.ts
import Dexie, { type Table } from 'dexie';

export interface LocalSession {
  id: string;
  remote_id?: string;             // populated after first successful sync
  access_code_id: string;
  user_id: string;
  name: string;
  partner_language: string;
  started_at: number;
  ended_at?: number;
  needs_sync: boolean;
}

export interface LocalEntry {
  id: string;                     // client-generated UUID
  session_id: string;
  panel: 'A' | 'B';
  language: string;
  text: string;
  start_ms: number;
  end_ms: number;
  is_final: boolean;
  created_at: number;
  needs_sync: boolean;
}

export class PaylingoDB extends Dexie {
  sessions!: Table<LocalSession, string>;
  entries!: Table<LocalEntry, string>;

  constructor() {
    super('paylingo');
    this.version(1).stores({
      sessions: 'id, access_code_id, started_at, needs_sync',
      entries:  'id, session_id, [session_id+start_ms], needs_sync',
    });
  }
}
export const db = new PaylingoDB();
```

### Sync engine (no library needed)

Per session, batch entries from Dexie where `needs_sync = true`, POST to Supabase via `supabase.from('transcript_entries').insert(batch)`, then mark synced. Trigger on:
- `session.stop()` (flush remaining)
- Every 10 s while online (background sync)
- `window.addEventListener('online', …)`
- Manual "Upload" button

Don't reach for `Y.js` / `Automerge` — PayLingo doesn't have multi-device merge (one code can write from multiple devices but each session is single-device by design; admins read-only).

---

## 6. PWA: Serwist (NOT next-pwa)

| Package | Version | Notes |
|---------|---------|-------|
| `@serwist/next` | 9.5.11 | Active Next.js plugin |
| `serwist` | 9.5.11 | Underlying Workbox-style toolkit |

### Why Serwist, not next-pwa

`next-pwa@5.6.0` was last published **August 2022** (verified on npm) — unmaintained, doesn't support App Router properly, broken with React 19. **Serwist is its modern fork**, written by the same/related maintainers, with Next.js 15/16 App Router support and TS-first config.

### What Serwist gives PayLingo

- Installable PWA (manifest + icons, you provide).
- Cached app shell (HTML, JS, CSS) for offline page load.
- Service worker that **does NOT** cache `/api/*` or Soniox WebSocket — those need fresh connectivity.
- Background sync hook (`workbox-background-sync`) — optional, the manual sync engine above is simpler.

### Config

```ts
// next.config.ts
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

export default withSerwist({
  /* normal Next config */
});
```

```ts
// app/sw.ts
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});
serwist.addEventListeners();
```

### Pitfalls

- **Don't cache `/api/auth/temporary-key`.** Temp keys are 5-minute scoped — a cached one is a stale credential. Serwist's `defaultCache` already excludes `/api/*` from SW caching; verify in DevTools after first build.
- **iOS PWA quirks.** Adding to home screen works since iOS 16.4, but you lose the URL bar. Wake Lock still works inside the PWA frame. Test on a real iPhone before launch.

---

## 7. Wake Lock

Browser native API — **no library needed**.

```ts
// hooks/use-wake-lock.ts
'use client';
import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!('wakeLock' in navigator)) {
      console.warn('Wake Lock unsupported on this browser');
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener('release', () => { sentinelRef.current = null; });
      } catch (err) {
        console.warn('Wake Lock denied:', err);
      }
    };

    acquire();

    // Re-acquire on tab return (lock is auto-released when tab hides)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}
```

### Browser support (verified via caniuse 2026-05-27)

| Browser | Min version | Notes |
|---------|-------------|-------|
| Chrome / Edge | 90+ | Stable since 2021 |
| Safari (macOS) | 16.4+ | March 2023 |
| Safari (iOS) | 16.4+ | March 2023 — matches PROJECT.md constraint |
| Firefox | 126+ | June 2024 |
| Android Chrome | All current versions |  |
| Samsung Internet | 14+ |  |

PROJECT.md's "Safari iOS 16.4+" constraint is the exact minimum for Wake Lock. **Lock this in the README's supported-browsers section.**

### Gotchas

- **Auto-released when tab loses visibility.** The `visibilitychange` handler above re-acquires.
- **Auto-released on `navigator.wakeLock.request` errors** — non-fatal, just degraded UX (screen may sleep).
- **iOS PWA in standalone mode:** Wake Lock works, but `visibilitychange` fires differently from in-browser. Test on-device.

---

## 8. PDF Export: `@react-pdf/renderer`

| Package | Version | Notes |
|---------|---------|-------|
| `@react-pdf/renderer` | 4.5.1 | React 19 compatible (verified peer dep `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`) |

### Why react-pdf, not pdf-lib

PayLingo PDFs contain **Vietnamese + Chinese/Japanese/Korean/Thai** text. Both libraries need explicit font embedding for non-Latin scripts (PDF standard 14 fonts cover only Latin-1).

- **`@react-pdf/renderer`** has a first-class `Font.register({ family, src })` API that automatically handles font subsetting and Unicode mapping. JSX-style component composition makes the 2-panel transcript layout trivial.
- **`pdf-lib`** is lower-level — requires you to add `@pdf-lib/fontkit`, call `registerFontkit()`, manually compute line breaks, manually wrap mixed-script text. ~3× the code.

### Implementation sketch

```tsx
// components/transcript-pdf.tsx
import { Document, Page, Text, View, Font, StyleSheet } from '@react-pdf/renderer';

// Self-host Noto fonts in public/fonts/ (subsets for VI, CJK, Thai)
Font.register({ family: 'Noto Sans', src: '/fonts/NotoSans-Regular.ttf' });
Font.register({ family: 'Noto Sans SC', src: '/fonts/NotoSansSC-Regular.ttf' });   // Simplified Chinese
Font.register({ family: 'Noto Sans JP', src: '/fonts/NotoSansJP-Regular.ttf' });
Font.register({ family: 'Noto Sans KR', src: '/fonts/NotoSansKR-Regular.ttf' });
Font.register({ family: 'Noto Sans Thai', src: '/fonts/NotoSansThai-Regular.ttf' });

const fontByLang: Record<string, string> = {
  vi: 'Noto Sans', en: 'Noto Sans',
  zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR', th: 'Noto Sans Thai',
};

export function TranscriptPDF({ session, panelA, panelB }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{session.name}</Text>
        <View style={styles.cols}>
          <View style={styles.col}>
            {panelA.map(e => (
              <Text key={e.id} style={{ fontFamily: fontByLang[e.language], marginBottom: 4 }}>
                [{formatTime(e.start_ms)}] {e.text}
              </Text>
            ))}
          </View>
          <View style={styles.col}>
            {panelB.map(e => (
              <Text key={e.id} style={{ fontFamily: 'Noto Sans', marginBottom: 4 }}>
                [{formatTime(e.start_ms)}] {e.text}
              </Text>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}

// Trigger render → blob → download (client side, no server roundtrip)
import { pdf } from '@react-pdf/renderer';
const blob = await pdf(<TranscriptPDF {...props} />).toBlob();
```

### Pitfalls

- **Font files are big.** Noto Sans CJK families are 1-4 MB each. Self-host with `font-display: swap` and only `Font.register` the ones needed for languages in the session (compute from entries).
- **Don't generate PDF on the server.** `@react-pdf/renderer`'s server renderer requires Node's `canvas` package (native bindings) — won't run on Vercel's edge runtime. Render client-side; ship a Blob.
- **Vietnamese diacritics** need `Noto Sans` (not `Noto Serif Display`) — verified in my testing of the font Unicode coverage. Use the **regular** Noto Sans, not the variable font, for smaller file size.

### Alternatives rejected

| Alternative | Why not |
|------------|---------|
| `pdf-lib` + `@pdf-lib/fontkit` | More boilerplate, no JSX layout, manual word wrap. |
| `jspdf` | Older API, weaker Unicode story, larger output. |
| Server-side Puppeteer / Playwright PDF | Requires headless Chromium on Vercel — too heavy, slow cold starts. |
| `html2pdf.js` | Client-side, prints DOM screenshot quality — no font subsetting, blurry text. |

---

## 9. Styling: Tailwind 4 + shadcn/ui

| Package | Version | Notes |
|---------|---------|-------|
| `tailwindcss` | 4.3.0 | v4 is the CSS-first config (no `tailwind.config.ts` needed for most cases) |
| `shadcn` (CLI) | 4.8.1 | Component code generator (NOT a runtime dep) |
| `lucide-react` | 1.16.0 | Icons (used by shadcn defaults) |
| `tailwind-merge` | 2.x | Used by shadcn for safe class merging |
| `class-variance-authority` | 0.7.x | Variant typing helper (used by shadcn) |

### Why this combo

- **Tailwind v4** uses native CSS (`@theme`, `@source`) — no JS config to maintain. Faster builds (no PostCSS pass).
- **shadcn/ui** doesn't install a npm dependency — it copies component source into your repo (`components/ui/`). You can edit anything. This matters for PayLingo's "flip 180°" custom transform and the audience-color theming.
- **Components you'll actually use:** `Button`, `Select` (language dropdown), `Card`, `ScrollArea` (transcript), `Sheet` (mobile admin nav), `Dialog` (delete confirmations), `Toast` (sync errors), `Switch` (record toggle), `Skeleton` (loading states), `Tabs` (admin sections).

### Don't add a heavy component library

Skip Mantine, Chakra, MUI. shadcn + Tailwind gives full control with no runtime weight. PayLingo's UI is bespoke (2-pane responsive flip layout) — pre-built components fight you.

---

## 10. Smaller picks

### State (cross-component)

`@soniox/react`'s `useRecording` already returns everything you need (state, tokens, controls). **You may not need a state library at all** for the recording surface.

For cross-page state (current session id, admin auth state), use **React Server Component patterns + URL state + Zustand 5.0.13 if needed**.

### Forms

`react-hook-form@7.x` + `@hookform/resolvers` + `zod@4.4.3`. Use for the admin "create access code" form (fields: label, expires_at, minute_limit). Overkill for the user's single "code" input — plain `<input>` is fine.

### Validation

**Zod 4.4.3.** Use for:
- API route input schemas (`/api/auth/redeem-code` payload)
- Soniox response narrowing (already typed but Zod lets you double-check at the seam)
- Form schemas

### IDs

`nanoid@5.1.11` for client-generated session/entry UUIDs (smaller than `crypto.randomUUID()` output but still collision-safe). Or just use `crypto.randomUUID()` — it's built-in and PayLingo isn't generating millions per second.

### Error tracking

Out of scope for MVP. Add Sentry post-launch (`@sentry/nextjs`).

### Analytics

`@vercel/analytics@2.0.1` for basic page-view stats on Vercel. Skip until validated.

---

## 11. Deploy & Environment

### Vercel

- **Plan:** Hobby is fine for MVP. Free SSL, auto previews, ISR not used.
- **Region:** Choose `sin1` (Singapore) or `hkg1` (Hong Kong) for VN/APAC latency. **Set this in `vercel.json` or project settings — defaults to `iad1` (US) which adds 200ms to admin requests.**
- **Functions:** Route Handlers run on Node by default (preserve this — `@soniox/node` uses Node-only APIs).
- **Env vars:**

```bash
# Server-only (do NOT prefix with NEXT_PUBLIC_)
SONIOX_API_KEY=<from soniox.com console>
SUPABASE_SERVICE_ROLE_KEY=<from supabase project settings>

# Client-safe
NEXT_PUBLIC_SUPABASE_URL=<…>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<…>
```

### Supabase

- Project region: choose `ap-southeast-1` (Singapore) to pair with `sin1` Vercel.
- Migrations: use Supabase CLI (`supabase db diff`, `supabase db push`) committed to repo. Don't edit schema only in Studio.
- Backups: free tier = 7-day point-in-time recovery on Pro only. For MVP, schedule a weekly `pg_dump` cron via GitHub Actions if you care.

---

## 12. Confidence Summary

| Decision | Confidence | Why |
|----------|-----------|-----|
| Next.js 16 + React 19 | HIGH | Verified latest npm, peer deps, Soniox's own example aligned |
| Soniox SDK + `stt-rt-v4` + two-way translation | HIGH | Read source of `@soniox/react@2.1.0` directly, verified config shape, verified Next.js example uses identical pattern to PayLingo |
| Soniox pricing $0.12/hr (not $0.10/min) | HIGH | Direct fetch of soniox.com/pricing |
| Supabase + `@supabase/ssr` 0.10.3 | HIGH | Stable, current, official Next.js docs are recent |
| Access-code = anon sign-in + `app_metadata` claim + RLS | MEDIUM | This is the cleanest synthesis but no off-the-shelf pattern. Two unknowns: (a) whether `app_metadata` claim is in JWT immediately after `updateUserById` or only after `refreshSession()` — code samples assume the latter; (b) admin role assignment via Studio is manual. Recommend prototyping this end-to-end in phase 1. |
| Dexie 4 | HIGH | Mature, active, TS-first |
| Serwist over next-pwa | HIGH | `next-pwa` last published 2022 — verified on npm; Serwist actively maintained, 9.5.11 current |
| Wake Lock native API | HIGH | Browser support matrix exactly matches PROJECT.md's stated minimum |
| `@react-pdf/renderer` for PDF | HIGH | React 19 peer dep verified; font registration handles VI + CJK |
| Tailwind 4 + shadcn | HIGH | Both stable, shadcn CLI supports Tailwind 4 |
| Vercel + region pick | MEDIUM | Hobby tier limits (60s function timeout) are not relevant since Soniox WS bypasses Vercel; latency claim relies on user being in VN/APAC |

---

## 13. Pitfalls & Roadmap Flags

These are the items that **need to surface in phase planning**:

1. **Cost correction.** Fix PROJECT.md "$0.10/minute" → "$0.12/hour". Recompute the admin "ước tính chi phí API tích lũy" feature.
2. **Access-code JWT claim refresh timing.** Phase 1 must validate that `auth.jwt() -> app_metadata ->> access_code_id` becomes available after the user calls `supabase.auth.refreshSession()` on the client. If the JWT is delivered fresh by the Route Handler (server-set cookie), this is automatic. Build a quick spike before committing to the RLS schema.
3. **Dexie write throughput vs token rate.** Soniox emits tokens roughly every 100-200ms. Writing each token individually to IndexedDB on every onToken can cause UI jank on low-end Android. **Batch writes in a 250ms debounce window** and flush on `is_final` boundaries. Plan this into the local-storage phase.
4. **Wake Lock on visibility change.** Re-acquire pattern is essential. Without it, leaving the tab for a notification kills the lock.
5. **Vercel function timeout (Hobby = 60s).** Route Handlers fine. The Soniox WebSocket is client→Soniox direct, so meeting duration is unbounded by Vercel.
6. **Supabase Free tier MAU.** 50k MAU is fine; **5GB egress** is the harder limit. Transcripts are tiny (KB), so even 1000 users × 100 sessions = ~100 MB. Safe.
7. **Service worker vs `/api/auth/temporary-key`.** Force exclude this route from cache. A cached 5-min temp key is a footgun.
8. **iOS standalone PWA Wake Lock.** Test on real iPhone before claiming this works. Browser engines differ between in-Safari and added-to-home-screen contexts.
9. **`@react-pdf/renderer` font weight.** 4 × CJK Noto fonts at ~1.5 MB each = 6 MB of fonts. Lazy-load fonts per-PDF based on actual entry languages, don't ship all at once.

---

## 14. Sources

| Source | Used for |
|--------|----------|
| https://soniox.com/docs/api-reference/stt/websocket-api (page exists; SPA shell only) | URL confirmation |
| https://github.com/soniox/soniox-js (full source read) | SDK API, message format, version, React 19 compat, hooks list |
| https://raw.githubusercontent.com/soniox/soniox-js/main/packages/core/src/types/realtime.ts | Wire protocol types |
| https://raw.githubusercontent.com/soniox/soniox-js/main/packages/core/src/types/transcriptions.ts | TranslationConfig types |
| https://raw.githubusercontent.com/soniox/soniox-js/main/examples/nextjs/src/app/translate-between.tsx | Two-way translation pattern (≈ PayLingo's exact UI) |
| https://raw.githubusercontent.com/soniox/soniox-js/main/examples/nextjs/src/app/api/get-temporary-api-key/route.ts | Server-side temp key route |
| https://soniox.com/pricing | Pricing correction |
| https://soniox.com/docs/stt/models (sitemap) + model name extraction | Model name confirmation |
| https://caniuse.com/wake-lock | Wake Lock browser support |
| https://registry.npmjs.org/* (next, react, @supabase/*, dexie, idb, @soniox/*, tailwindcss, @react-pdf/renderer, serwist, next-pwa, zod, lucide-react, zustand) | All version pins |
| https://supabase.com/docs/guides/auth/auth-anonymous | Anonymous sign-in pattern |
| https://supabase.com/docs/guides/auth/server-side/nextjs | `@supabase/ssr` usage |
| https://github.com/serwist/serwist | Serwist as next-pwa successor |

---

*Pinned versions are as of 2026-05-27. Re-verify when starting Phase 1 (npm `pkg latest`).*
