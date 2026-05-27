# Architecture Patterns — PayLingo

**Domain:** Real-time bidirectional speech translation PWA
**Researched:** 2026-05-27
**Overall confidence:** HIGH (primary patterns confirmed against Soniox reference implementation + Vercel/Supabase official docs)

---

## TL;DR — The One Big Insight

Soniox provides a **temporary-API-key flow** (`POST /v1/auth/temporary-api-key`) that emits a 60-second key the browser uses to open the WebSocket **directly to Soniox**. We do **NOT proxy the WebSocket** through our backend. Combined with the official `@soniox/speech-to-text-web` SDK — which already handles `getUserMedia`, `AudioWorklet`, PCM resampling, framing, partial/final reconciliation, and `token.language` tagging — the architecture collapses to:

```
Browser  ──HTTP POST──>  Next.js API  ──HTTP POST──>  Soniox (mint temp key)
Browser  ──WebSocket──────────────────────────────>  Soniox (stream audio, get tokens)
Browser  ──HTTP/Supabase JS──>  Supabase (Postgres + Auth + RLS)
Browser  ──IndexedDB──>  Local persistence
```

Vercel's serverless/edge constraints (no long-lived WebSockets, 25s response budget) become a **non-issue**. The Vercel app is a stateless web tier; the real-time hot path runs Soniox ↔ Browser directly. (HIGH confidence — verified in `soniox/soniox_examples` reference implementation, Aug 2025.)

This frees us from spending Phase 1 building a WebSocket-proxy infrastructure layer that Soniox already engineered around.

---

## System Architecture (Logical View)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (PWA)                                │
│                                                                            │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐   │
│  │  Auth gate     │  │  Session UI      │  │  History / PDF UI         │   │
│  │  (access code  │  │  (Start/Stop +   │  │                           │   │
│  │   form +       │  │   2 panels +     │  │                           │   │
│  │   admin login) │  │   layout switch) │  │                           │   │
│  └───────┬────────┘  └────────┬─────────┘  └────────────┬─────────────┘   │
│          │                    │                          │                 │
│          ▼                    ▼                          ▼                 │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │              Client State (Zustand stores + React Query)            │   │
│  │  authStore | sessionStore | transcriptStore | layoutStore          │   │
│  └─────┬──────────────┬───────────────┬──────────────┬───────────────┘   │
│        │              │               │              │                    │
│        │              │               ▼              ▼                    │
│        │              │     ┌─────────────────┐  ┌──────────────────┐    │
│        │              │     │  Soniox SDK      │  │  IndexedDB        │    │
│        │              │     │  (@soniox/       │  │  (Dexie)          │    │
│        │              │     │   speech-to-     │  │  - sessions       │    │
│        │              │     │   text-web)      │  │  - tokens (queue) │    │
│        │              │     │                  │  │  - sync_outbox    │    │
│        │              │     │  • getUserMedia  │  │                   │    │
│        │              │     │  • AudioWorklet  │  └────────┬──────────┘    │
│        │              │     │  • PCM 16-bit    │           │               │
│        │              │     │  • WebSocket     │           │               │
│        │              │     └────┬─────────────┘           │               │
│        │              │          │                         │               │
│        ▼              ▼          ▼                         ▼               │
│  ┌─────────────────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Supabase JS client      │  │  Soniox WS   │  │  Sync worker        │   │
│  │ (auth + DB + storage)   │  │  api.soniox  │  │  (idle queue        │   │
│  │  WSS + REST             │  │  .com        │  │   flush → Supabase) │   │
│  └────────────┬────────────┘  └──────┬───────┘  └──────────┬──────────┘   │
└───────────────┼─────────────────────┼─────────────────────┼──────────────┘
                │                     │                     │
   HTTPS+WSS    │           WSS       │           HTTPS     │
                ▼                     │                     ▼
       ┌────────────────────┐         │      ┌──────────────────────────┐
       │   Supabase Cloud   │         │      │  (same Supabase)         │
       │  ┌──────────────┐  │         │      └──────────────────────────┘
       │  │  Auth (GoTrue)│  │         │
       │  │  - signIn anon│  │         │
       │  │  - JWT w/ claims│ │        │
       │  │  - admin email│  │         │
       │  └──────────────┘  │         │
       │  ┌──────────────┐  │         │
       │  │  Postgres+RLS │  │         │
       │  │  - access_codes│ │         │
       │  │  - sessions   │  │         │
       │  │  - messages   │  │         │
       │  │  - admins     │  │         │
       │  └──────────────┘  │         │
       └────────────────────┘         │
                                       │
                ▼                      ▼
       ┌──────────────────────────────────────────────┐
       │              VERCEL (Next.js 15)              │
       │                                                │
       │  ┌──────────────────────────────────────────┐ │
       │  │   /api/soniox/temp-key   (Node, ~50ms)   │ │
       │  │   Auth-guarded → mints 60s Soniox key    │ │
       │  └──────────────────────────────────────────┘ │
       │  ┌──────────────────────────────────────────┐ │
       │  │   /api/codes/redeem   (Node)              │ │
       │  │   access-code → signInAnonymously +       │ │
       │  │   server-side claim binding via RPC       │ │
       │  └──────────────────────────────────────────┘ │
       │  ┌──────────────────────────────────────────┐ │
       │  │   /api/admin/* (Node) — RBAC for admin   │ │
       │  │   code CRUD, dashboard stats              │ │
       │  └──────────────────────────────────────────┘ │
       │  ┌──────────────────────────────────────────┐ │
       │  │   /api/sessions/[id]/pdf (Node)           │ │
       │  │   pdf-lib renders, streams back binary    │ │
       │  └──────────────────────────────────────────┘ │
       │  ┌──────────────────────────────────────────┐ │
       │  │   Server Components / RSC pages           │ │
       │  │   (App Router) — initial HTML hydration   │ │
       │  └──────────────────────────────────────────┘ │
       │                                                │
       │  Service-role key lives ONLY on server side   │
       └────────────────────────────────────────────────┘
                                       │
                                       ▼
                       ┌──────────────────────────┐
                       │   Soniox Cloud           │
                       │   - /v1/auth/temp-key    │
                       │   - WSS transcribe API   │
                       │   - stt-rt-v4 model      │
                       │   - two_way translation  │
                       └──────────────────────────┘
```

(HIGH confidence — every box matches a live, deployed Soniox reference example or Supabase/Vercel docs.)

---

## Component Boundaries (Contracts)

| # | Component | Owns | Talks To | Interface |
|---|-----------|------|----------|-----------|
| 1 | **AuthGate (client)** | login flow (access code or admin email) | `/api/codes/redeem`, Supabase Auth | calls `signInAnonymously()` or `signInWithPassword()` |
| 2 | **SonioxBridge (client hook `useTranscription`)** | live STT lifecycle, mic, partial/final tokens | Soniox WS via SDK, `/api/soniox/temp-key` | emits `Token[]` with `{text, language, is_final, speaker}` |
| 3 | **PanelRouter (pure fn)** | maps tokens → Panel A vs Panel B | — | input `Token + {panelALang, panelBLang}` → `'A' | 'B'` |
| 4 | **TranscriptStore (Zustand)** | A/B panel arrays, reconciliation of partial → final | SonioxBridge, IndexedDB writer | `addTokens()`, `finalize()`, `getPanel(id)` |
| 5 | **LocalPersistence (Dexie)** | autosave during session, crash recovery | IndexedDB | `appendTokens(sessionId, tokens)`, `loadSession(id)` |
| 6 | **SyncWorker** | batches local → Supabase | LocalPersistence, Supabase JS | idle-time flush, exponential backoff |
| 7 | **SessionUI** | Start/Stop button, two panels, layout switch, Wake Lock | TranscriptStore, layoutStore, Wake Lock API | renders panels, dispatches state changes |
| 8 | **HistoryUI / Editor** | list + read + edit completed sessions | Supabase | Server Component for list, client editor for `messages` |
| 9 | **PDFEndpoint (`/api/sessions/[id]/pdf`)** | fetch session, render PDF | Supabase (service role), pdf-lib | returns `application/pdf` |
| 10 | **AdminPanel** | code CRUD, usage dashboard | `/api/admin/*` | server-action driven |

**Strict rule:** the **client never holds the Soniox master key or the Supabase service-role key**. Both stay in Vercel env vars, accessible only inside `app/api/*` route handlers / Server Actions.

---

## 1. Audio Pipeline

### Decision: Use `@soniox/speech-to-text-web` SDK

**Confidence:** HIGH (verified in the React reference implementation, Aug 2025, ~v1.2.0)

**Why:**
- SDK already wraps `getUserMedia → AudioContext → AudioWorklet → PCM16 → WebSocket` correctly and handles iOS Safari quirks. Browser audio pipelines are notoriously fiddly across Safari/Chrome/Android; rebuilding this in-house buys nothing.
- SDK emits **`token.language`** on every token — meaning panel routing reduces to `tokens.filter(t => t.language === panelA.code)`. We do not need our own VAD, diarization, or language detection.
- SDK provides native `translation: { type: "two_way", language_a, language_b }` config that produces **both source tokens and translated tokens** in one stream — exactly PayLingo's use case.
- SDK accepts `apiKey: () => Promise<string>` so the temp-key fetch is wired in cleanly.

### Streaming protocol (handled by SDK, but documented for our mental model)

- **Sample rate:** SDK upsamples/downsamples the mic to Soniox's expected rate internally (typically 16 kHz mono PCM 16-bit little-endian).
- **Chunk size:** ~50–100 ms frames over WebSocket binary message. Audio frame size is an SDK internal — we do not need to tune it.
- **First message:** SDK sends JSON config (`model: "stt-rt-v4"`, `translation: { type: "two_way", language_a: "en", language_b: "vi" }`, `enableLanguageIdentification: true`).
- **Subsequent messages:** binary PCM frames.
- **Response:** JSON messages with `tokens: Token[]`. Each token has `{text, is_final, language, speaker?, start_ms?, end_ms?}`.

### WebSocket termination: **client ↔ Soniox direct** (NOT server-proxied)

**Confidence:** HIGH

| Approach | Latency | Vercel cost | Complexity | Verdict |
|----------|---------|-------------|------------|---------|
| **Client → Soniox direct + temp key** | Best (no extra hop) | Zero (only short HTTP key mint) | Lowest (use SDK) | ✓ Pick this |
| Client → Vercel Edge → Soniox | +1 hop latency | Edge function holds a WS — Vercel does not officially support this | High | ✗ |
| Client → external WS server (Fly.io etc.) | +1 hop | Extra infra to host | High | ✗ |

Vercel's Edge runtime is built around HTTP request/response with a **25 s response-start budget**; it is not designed to host long-lived WebSocket server endpoints (verified at vercel.com/docs/functions/runtimes/edge, Dec 2025). Soniox's temp-key model exists precisely so that we don't need to.

### Security model for temp key

- **Master key** (`SONIOX_API_KEY`) lives only in Vercel env vars.
- Client calls **`POST /api/soniox/temp-key`** (Node runtime — see API section). The handler:
  1. Verifies caller has a valid Supabase JWT.
  2. Verifies the user has remaining minutes on their access code (RLS check or RPC).
  3. Calls Soniox `POST /v1/auth/temporary-api-key` with `{usage_type: "transcribe_websocket", expires_in_seconds: 60}`.
  4. Returns `{api_key: "..."}` to the client.
- Browser uses that key to open WSS to Soniox. Key expires in 60 s — even if leaked, blast radius is one minute of usage on one account.

### Backpressure / network slow

The Soniox SDK handles backpressure internally (drop or buffer microphone frames if the WebSocket is congested). We expose two UI affordances on top:

1. **Connection indicator** — drive from `RecorderState` ("Init" | "Recording" | "Finalizing" | "Error"). If state stalls in non-final for > 5 s, show a yellow "slow connection" badge.
2. **Local fallback** — even when WS is healthy, every emitted token is committed to IndexedDB before being rendered. If WS dies mid-utterance, we keep the recent finals; the next session boundary cleanly reconnects (no resume of mid-utterance — Soniox is not designed for that).

We do **not** implement a custom audio ring buffer or chunking strategy in v1. If the SDK drops audio under congestion, that's acceptable for v1 (user perception: "the app glitched, I'll repeat the sentence"). v2 could add an explicit local recorder for full audio replay.

---

## 2. Transcript Flow

### Routing logic: trivial, because Soniox tags tokens by language

```ts
// Pure function — easy to test, no state.
function routeToken(token: Token, cfg: {panelALang: string; panelBLang: string}): 'A' | 'B' | 'discard' {
  if (token.language === cfg.panelALang) return 'A';
  if (token.language === cfg.panelBLang) return 'B';
  return 'discard'; // unexpected language — log + ignore
}
```

For PayLingo: `panelBLang` is hard-coded to `'vi'`; `panelALang` is the user-selected partner language. Soniox in `two_way` mode emits **both** the source language token **and** the translation token, so:
- Partner speaks English → emits one EN token + one VI translation token. EN → panel A, VI → panel B. ✓ Both panels update.
- Vietnamese speaker speaks → emits one VI token + one EN translation token. VI → panel B, EN → panel A. ✓ Both panels update.

This matches the project's "mỗi khung 1 ngôn ngữ (audience-based)" requirement **natively**, no extra translation API call required.

### State management: **Zustand**

**Confidence:** HIGH

| Option | Verdict | Why |
|--------|---------|-----|
| **Zustand** | ✓ Pick | Tiny (~1 kB), supports selectors (prevents unnecessary re-renders during high-frequency token streams), no context-tree gymnastics, plays well with Next.js App Router |
| React Context | ✗ | Every panel re-renders on every token — 5–10 tokens/sec will jank mid-range Android |
| Jotai | △ | Atomic but adds mental overhead; Zustand's flat store is simpler for this small surface |
| Redux Toolkit | ✗ | Overkill for a 4-store surface |
| TanStack Query | ✓ (complementary) | Use for fetching history sessions; orthogonal to live transcript |

Store layout:

```ts
// Each store is a separate Zustand store — narrow subscriptions.
useAuthStore        // { user, role, codeId, signOut() }
useSessionStore     // { activeSessionId, startedAt, status, start(), stop() }
useTranscriptStore  // { panelA: Token[], panelB: Token[], partialA: Token[], partialB: Token[], addTokens(), commitFinal() }
useLayoutStore      // { mode: 'stacked' | 'sideBySide' | 'flipped', rotation }
```

### Partial → Final reconciliation

The Soniox protocol distinguishes `is_final: true` (finalized text, will not change) vs `is_final: false` (provisional, may change). Standard pattern:

```ts
// On every onPartialResult:
const incomingFinal = result.tokens.filter(t => t.is_final);
const incomingNonFinal = result.tokens.filter(t => !t.is_final);

set(state => ({
  finalTokens: [...state.finalTokens, ...incomingFinal],
  nonFinalTokens: incomingNonFinal, // REPLACE the whole non-final tail
}));
```

The non-final array is **replaced wholesale** on every message — that's how flicker resolves to stable text. Render finals dark and non-finals dimmed (per the reference renderer) so the user perceives "live caption" not "broken text".

We persist **only final tokens** to IndexedDB / Supabase. Non-finals are ephemeral by design.

---

## 3. Persistence

### Postgres schema (Supabase)

```sql
-- access_codes: admin creates, users enter
create table access_codes (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,           -- short random string, e.g. 8-char base32
  label           text,
  expires_at      timestamptz,
  minutes_cap     int,                            -- null = unlimited
  minutes_used    int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references admins(id) on delete set null
);
create index on access_codes (code);

-- admins: separate from Supabase auth.users
create table admins (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique not null references auth.users(id) on delete cascade,
  email           text not null,
  created_at      timestamptz not null default now()
);

-- sessions: one row per Start→Stop
create table sessions (
  id              uuid primary key default gen_random_uuid(),
  code_id         uuid not null references access_codes(id) on delete cascade,
  title           text not null,                   -- default "YYYY-MM-DD HH:MM"
  language_a      text not null,                   -- e.g. 'en'
  language_b      text not null default 'vi',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  duration_sec    int,
  created_at      timestamptz not null default now()
);
create index on sessions (code_id, started_at desc);

-- messages: sentence-level rows (NOT token-level — see rationale)
create table messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  panel           char(1) not null check (panel in ('A','B')),
  language        text not null,                   -- e.g. 'en' or 'vi'
  text            text not null,
  speaker         text,                            -- Soniox speaker label, optional
  start_ms        int,                             -- relative to session start
  end_ms          int,
  is_edited       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on messages (session_id, start_ms);

-- audit_log: optional, for admin dashboard
create table session_usage (
  code_id     uuid not null references access_codes(id) on delete cascade,
  session_id  uuid not null references sessions(id) on delete cascade,
  minutes     numeric(10, 2) not null,
  recorded_at timestamptz not null default now()
);
```

**Granularity decision — sentence-level not token-level:**

| Granularity | Rows per 10-min session | DB size | Edit UX | Verdict |
|-------------|------------------------|---------|---------|---------|
| Token-level | ~1500 | Free tier strained | Edit each word → terrible | ✗ |
| **Sentence-level** | ~50–80 | Compact | Edit per sentence → matches user mental model | ✓ |
| Whole-session | 1 | Tiny | No partial edit | ✗ |

Sentence boundary = Soniox emits `<end>` token OR > 1.2 s pause OR sentence-terminal punctuation. We aggregate tokens into one `messages` row when a final-sentence boundary fires.

### IndexedDB schema (Dexie)

Mirror the Postgres tables we care about + a sync outbox:

```ts
db.version(1).stores({
  sessions:    '++id, server_id, code_id, started_at',  // server_id null until synced
  messages:    '++id, session_id, panel, start_ms',
  sync_outbox: '++id, table, op, payload_json, created_at, retry_count'
});
```

Why **Dexie** (HIGH confidence): it's the canonical IndexedDB wrapper, handles version migrations, transactions, and Promise APIs cleanly; raw IndexedDB API is notoriously gnarly.

### Sync strategy: **write-through to local, batched flush to cloud**

```
Token finalized
   │
   ├──> Zustand store (immediate render)
   │
   └──> Dexie sessions/messages (within ~50 ms)
                │
                └──> sync_outbox enqueue
                        │
                        └──> SyncWorker (debounced 2 s, or on session end, or on "Upload now" button)
                                │
                                └──> Supabase upsert (idempotent by client UUID)
```

**Optimistic UI:** the panel renders from Zustand the moment a token arrives; Supabase write happens out-of-band. If Supabase is down, the session still completes locally and uploads later.

### Conflict resolution

PayLingo's conflict surface is narrow:
- **Live session writes:** only one device writes during a session (Soniox session is single-WS-per-mic). No conflict.
- **Post-session edits:** an access code might be used on multiple devices; both might open the same session and edit. Use **`updated_at` last-write-wins** for `messages.text` and `sessions.title`. Acceptable trade-off for v1 (the project explicitly says "1 code = unlimited devices" without share-protection).
- **Offline edits:** queue in `sync_outbox` with the original `messages.id` UUID. On reconnect, upsert; whoever wrote last wins.

We do **not** implement CRDTs in v1. The data model isn't collaborative enough to justify them.

---

## 4. Auth Flow

### Decision: Supabase `signInAnonymously()` + custom claim binding via RPC

**Confidence:** HIGH (verified at supabase.com/docs/guides/auth/auth-anonymous, Dec 2025)

```
┌──────────────────────────────────────────────────────────────────────┐
│ USER FLOW                                                              │
│                                                                        │
│  1. User enters access code at /enter                                  │
│  2. Client: POST /api/codes/redeem  { code: "ABC123" }                 │
│  3. Server (Node API route):                                           │
│       a. Verify code exists, is_active, not expired in Postgres        │
│       b. supabase.auth.admin.signInWithIdToken(...)  ← OR:             │
│          Just instruct client to call signInAnonymously() and          │
│          server-side bind the code to that auth user via RPC           │
│       c. INSERT into a code_bindings(auth_user_id, code_id) table      │
│       d. Return 200 OK                                                 │
│  4. Client: supabase.auth.signInAnonymously()                          │
│       — gets a JWT with is_anonymous: true, sub: <uuid>                │
│  5. All subsequent calls use that JWT; RLS policies filter             │
│     by code_bindings.auth_user_id = auth.uid()                         │
└──────────────────────────────────────────────────────────────────────┘
```

**Why this pattern (not a custom JWT minter):**
- Supabase Auth issues real Postgres-aware JWTs that RLS can natively check via `auth.uid()` and `is_anonymous`. No custom JWT verification middleware needed.
- Anonymous users are first-class in Supabase v2.
- We avoid running our own JWT issuance/rotation/key-rotation infra.

**Alternative considered:** mint custom JWTs server-side with the Supabase JWT secret. Rejected — couples our code to Supabase internals, and we'd lose the built-in refresh-token flow.

### Admin flow

Admins use email+password (`signInWithPassword`). RLS policies check `auth.uid() IN (SELECT auth_user_id FROM admins)`.

### Rate-limit enforcement (minutes cap)

**Hot path concern:** we must NOT do a Postgres roundtrip every 500 ms during a session. Instead:

1. On `/api/soniox/temp-key` (which fires once per ~50 s thanks to token expiry), check `minutes_used + estimated < minutes_cap`. If over cap, deny.
2. Increment `minutes_used` lazily — server-side aggregation: every minted temp-key adds 1 minute to the bucket (overestimate, OK).
3. Soft warning to client: when 80% used, show banner. When 100%, the next temp-key request returns 402 → client gracefully stops session.

**No realtime feel impact** — the throttle is at the 1-minute granularity of temp-key refresh, not the 50-ms granularity of audio frames.

### Token refresh during long sessions

- Supabase JWT auto-refreshes via `supabase-js`. The Soniox temp key expires every 60 s but the SDK reuses the WS — when the SDK reconnects (it does internally) it calls our `getAPIKey()` again. We've already verified this in the reference implementation.
- Add an explicit "Session has been running 2 h, refresh login?" UI nudge to handle the rare case where Supabase refresh token expires (default ≥ 1 week, so practically never during one session).

### RLS policy sketches

```sql
-- Read: a session row is visible if the caller's auth user is bound to that code
create policy "users read own sessions" on sessions
  for select using (
    exists (
      select 1 from code_bindings cb
      where cb.code_id = sessions.code_id
        and cb.auth_user_id = auth.uid()
    )
  );

-- Read: admins see everything
create policy "admins read all sessions" on sessions
  for select using (
    exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- Insert: must reference a code the caller is bound to
create policy "users write own sessions" on sessions
  for insert with check (
    exists (
      select 1 from code_bindings cb
      where cb.code_id = sessions.code_id
        and cb.auth_user_id = auth.uid()
    )
  );

-- Similar policies on messages, scoped via session_id → sessions → code_bindings
-- access_codes table: SELECT only for admins. Lookup at redeem time uses service-role
-- (server-side only, in /api/codes/redeem).
```

---

## 5. API Architecture

### Route inventory and runtime selection

| Route | Method | Runtime | Why |
|-------|--------|---------|-----|
| `/api/soniox/temp-key` | POST | **Node** | Calls Soniox REST with httpx-equivalent; no special edge benefit; Node default is fine and the path is invoked once per ~50 s. (Edge is OK too — but Node is simpler since we'll also use Node runtime for PDF.) |
| `/api/codes/redeem` | POST | **Node** | Service-role Supabase call, plain Postgres roundtrip |
| `/api/admin/codes` | GET/POST/PATCH/DELETE | **Node** | Admin CRUD; uses service-role |
| `/api/sessions/[id]/pdf` | GET | **Node** | `pdf-lib` is pure JS but heavier; Node runtime gives more memory + libraries |
| Server Components (`app/...`) | — | **Node** | Use Supabase server client for initial render of history, admin pages |
| Server Actions (`'use server'`) | — | **Node** | For session title edit, session delete |

**Edge runtime is NOT necessary** for PayLingo's hot path because the hot path is browser ↔ Soniox direct. Vercel's Edge would only save us ~50–150 ms on the temp-key mint, which fires once a minute — negligible. Sticking with Node gives us pdf-lib + future flexibility without juggling two runtimes.

(Note Vercel's own December 2025 guidance is to "migrate from edge to Node.js for improved performance and reliability" — verified at vercel.com/docs/functions/runtimes/edge. MEDIUM confidence on the long-term direction; either runtime is fine for our use case.)

### Why route handlers > server actions for the API tier

Server Actions are great for mutations triggered by forms. For the Soniox temp-key endpoint we want explicit HTTP semantics (POST with no body, returns JSON, fetched from `apiKey: () => fetch(...)` inside the SDK). Route handlers fit this naturally. Use Server Actions for in-app UX mutations like "rename session" where the form-level integration matters.

### PDF generation: **pdf-lib in Node runtime**

**Confidence:** HIGH

- `pdf-lib`: pure JS, ~200 KB, no native deps, supports custom fonts (we need Vietnamese diacritics and CJK glyphs — must embed a font like Noto Sans CJK + Noto Sans).
- Alternatives:
  - **Puppeteer / Chromium** — too heavy for Vercel; cold starts will exceed our latency tolerance.
  - **jsPDF** — older, weaker font handling.
  - **React-PDF (`@react-pdf/renderer`)** — uses React JSX; reasonable, slightly larger bundle.

Decision: start with **pdf-lib**. If formatting becomes painful, swap to `@react-pdf/renderer`. Both work in the Node runtime.

### Service-role key handling

Service-role key is set as a Vercel env var (production: encrypted at rest). It is **only** imported by files under `app/api/` and Server Actions. We add an ESLint rule (or convention check) to fail builds if `process.env.SUPABASE_SERVICE_ROLE_KEY` appears in any client-bundle file.

---

## 6. Build Order — Vertical Slices

### The riskiest assumption

> "We can stream microphone audio from a mid-range Android browser to Soniox via an SDK, see translated text in two panels with < 2 s latency, and the temp-key auth pattern works end-to-end on Vercel."

Everything downstream of this (Supabase, IndexedDB, PDF, admin) is conventional web work with well-trodden patterns. The unknown is the **realtime audio loop**.

### Phase 1 — "Hello two-panel" vertical slice (THE SPIKE)

Goal: prove the loop end-to-end on a Vercel preview deployment, deployable in 1–2 days.

Build only:
- Next.js 15 + TypeScript + Tailwind scaffold.
- `/app/spike/page.tsx` — one screen, no auth, Start/Stop button.
- `/api/soniox/temp-key/route.ts` — node handler, env var pulls master key, hits Soniox REST. (Throw `SONIOX_API_KEY` into Vercel env vars for the preview.)
- `useTranscription` hook around `@soniox/speech-to-text-web` configured with `translation: {type: 'two_way', language_a: 'en', language_b: 'vi'}`.
- Two `<div>` panels, filtered by `token.language`.

Pass criteria:
- Open preview URL on a real Android phone.
- Speak English → English text appears on left panel, Vietnamese on right panel, both within ~2 s.
- Speak Vietnamese → reverse.
- No crashes for a 60 s session.

This proves: SDK works in PWA context, temp-key flow works on Vercel, two-panel routing is sound, latency target is met. Everything else is feature work on top of a working foundation.

**If this phase fails** (latency too high, SDK broken on Safari, etc.) — we discover it before investing in Supabase schema, auth, IndexedDB, layout switcher, etc. This is the **only phase where unexpected showstoppers might exist**.

### Phase 2 — Auth + access codes

Add:
- Supabase project + schema (access_codes, admins, code_bindings).
- `/api/codes/redeem` endpoint.
- `signInAnonymously()` flow + JWT-aware Supabase client on the browser.
- Admin sign-in (email/password).
- Basic RLS policies on `access_codes` (admins only) and `code_bindings`.
- Guard the spike behind code redemption.

Pass criteria: only valid codes get into the app; admin can create a code via SQL.

### Phase 3 — Sessions + persistence

Add:
- `sessions` and `messages` tables + RLS.
- Sentence-boundary aggregator in `useTranscription`.
- IndexedDB via Dexie + sync_outbox.
- Crash recovery: on reload, prompt resume.
- "Upload now" button.

Pass criteria: 5 sessions on 2 devices end up correctly attributed in Postgres, all readable from history.

### Phase 4 — History UI + edit + PDF

Add:
- History list page (server component, server-rendered for SEO-irrelevant but DX-good caching).
- Session viewer with editable messages.
- `/api/sessions/[id]/pdf` with pdf-lib + embedded fonts.
- Search across transcripts.

### Phase 5 — Admin panel

Add:
- `/admin` route, RBAC via RLS.
- Code CRUD UI.
- Usage dashboard (minutes + estimated cost from `session_usage`).
- Bulk export / delete.

### Phase 6 — Polish & resilience

Add:
- Wake Lock API hook (`useWakeLock`) activated during recording.
- Layout switcher (stacked / side-by-side / flipped 180°). 3 CSS modes — no JS magic.
- PWA manifest + service worker (for "Add to home screen" + minimal offline shell).
- Offline indicator + reconnect handling.
- Responsive tweaks for portrait/landscape.

### Phase 7 — Hardening

Add:
- Rate limits on `/api/codes/redeem` (Vercel KV or Upstash).
- Per-code minute cap enforcement.
- Error boundaries + Sentry-style telemetry (or Vercel's built-in observability).
- Load testing — can the temp-key endpoint sustain 10 concurrent users?

### Build-order rationale

The order is driven by two principles:
1. **De-risk the unknown first** (Phase 1 is the only "we don't know if this works" phase).
2. **Each phase ships a usable app to a small set of users** — Phase 2 is "auth + transcription works", Phase 3 adds "history", etc. Avoid 5-phase prerequisite chains where nothing is testable until week 6.

### Dependency graph

```
   Phase 1 (audio loop)
        │
        ▼
   Phase 2 (auth)
        │
        ▼
   Phase 3 (persistence) ────► Phase 6 (PWA + resilience, can fork early)
        │
        ▼
   Phase 4 (history + PDF)
        │
        ▼
   Phase 5 (admin)
        │
        ▼
   Phase 7 (hardening)
```

Phase 6 can fork off after Phase 3 because PWA polish doesn't depend on the admin layer. The rest is strictly sequential.

---

## 7. Deployment

### Vercel project structure

```
apps/web/                    # only app (no monorepo needed for v1)
├── app/
│   ├── (public)/            # landing + access-code entry
│   ├── (app)/               # authenticated user routes
│   │   ├── session/
│   │   └── history/
│   ├── admin/               # admin routes — middleware-protected
│   ├── api/
│   │   ├── soniox/temp-key/
│   │   ├── codes/redeem/
│   │   ├── admin/
│   │   └── sessions/[id]/pdf/
│   └── layout.tsx
├── components/
├── lib/
│   ├── supabase/           # browser + server clients
│   ├── soniox/             # SDK wrapper hooks
│   ├── db/                 # Dexie schema + sync worker
│   └── pdf/                # PDF rendering
└── public/
    ├── manifest.json
    └── workers/            # service worker
```

### Environment variables

```bash
# Public (NEXT_PUBLIC_ prefix → bundled into client)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Server-only (NEVER prefix with NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=...
SONIOX_API_KEY=...
SONIOX_API_HOST=https://api.soniox.com  # default, override only for staging
```

Use Vercel's project-level env vars + per-environment overrides (preview/production). Document a `.env.example` checked into git.

### Supabase migrations

Use the Supabase CLI with migrations checked into `supabase/migrations/*.sql`. Each PR includes a migration file. Run `supabase db push` in CI on merge to main.

Alternative: Drizzle ORM with `drizzle-kit migrate`. Cleaner DX if we want typed queries from Next.js, but adds tool overhead. Decision deferred to Phase 2 — start with raw SQL migrations + `@supabase/supabase-js` typed via `supabase gen types typescript`.

### Vercel limits to keep in mind

- Hobby plan: 100 GB-hours/month compute. Each PDF render is a few seconds; comfortable for hundreds of sessions/month.
- Function maximum duration: 60 s (Hobby) / 300 s (Pro). PDF rendering of even multi-hour sessions stays well under this.
- Edge function size limit: 1 MB Hobby — not relevant since we're on Node.

---

## Patterns to Follow

### Pattern 1: Source of truth = Soniox + Zustand for live, Postgres for archive
Live tokens flow `Soniox → Zustand → render`. Persistence is a parallel write-through. Don't try to read live state from Postgres or IndexedDB during a session — it's just for durability.

### Pattern 2: Server boundaries by secret possession
Any function that touches `SONIOX_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` lives in `app/api/*` or `'use server'`. Convention check: `lib/secrets/` is the only directory that imports those env vars; everything else imports from `lib/secrets/server.ts`, which throws if run on the client.

### Pattern 3: Tokens are immutable; sentences are editable
The atomic unit during a session is `Token` (Soniox-owned). Once a session ends, we aggregate to `Message` rows; from then on, the message text is editable. There's no edit-during-session feature in v1.

### Pattern 4: Local-first, sync-after
Every UI affordance must work without network. Network is for archival. The Soniox WS is the one exception — when it dies, the session pauses; we cannot transcribe offline.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Proxy the Soniox WebSocket through Vercel
**Why bad:** adds 50–200 ms latency, costs serverless compute time, and Vercel's Edge runtime is not designed for long-lived WebSocket server sockets. **Instead:** use the temp-key flow Soniox provides.

### Anti-Pattern 2: Token-level rows in Postgres
**Why bad:** ~1500 rows per session strains the free tier, makes the editor UX terrible (per-word editing), and queries get slow. **Instead:** aggregate to sentence-level `messages`.

### Anti-Pattern 3: Render directly from IndexedDB during live session
**Why bad:** IndexedDB reads are async and slower than Zustand. The render loop must be synchronous in-memory. **Instead:** Zustand is the source of truth during a session; IndexedDB writes happen out-of-band.

### Anti-Pattern 4: Custom JWT minting for access codes
**Why bad:** we'd reimplement Supabase Auth — refresh tokens, key rotation, claim validation. **Instead:** use `signInAnonymously()` + a `code_bindings` table.

### Anti-Pattern 5: Edge runtime for "fastness"
**Why bad:** Vercel's own guidance (Dec 2025) is to prefer Node runtime; Edge has been deemphasized in favor of Fluid Compute. Edge only helps when (a) you're geo-distributed and (b) the function is a thin pass-through. Our temp-key handler fires once a minute — Edge's cold-start advantage is moot. **Instead:** Node everywhere, except for middleware (which has to be Edge).

### Anti-Pattern 6: Build a manual AudioWorklet before trying the SDK
**Why bad:** browser audio is a swamp of Safari quirks. The Soniox SDK has paid those costs. **Instead:** SDK first; only roll our own if a real, demonstrated limitation appears.

---

## Scalability Considerations

| Concern | At 5 users (MVP) | At 100 users (small business) | At 10K users (would re-architect) |
|---------|------------------|------------------------------|-----------------------------------|
| Postgres rows | Free tier fine | Free tier fine (~50 MB for a year of heavy use) | Move to Supabase Pro, partition `messages` by month |
| Concurrent Soniox WS | Negligible | ~10 concurrent → ~$1/min total → acceptable | $$$ — would need Soniox enterprise contract |
| Vercel functions | Hobby plan fine | Hobby plan fine | Move to Pro for SLA |
| PDF gen | Per-request, no caching | Add caching by `session_id + updated_at` to Supabase Storage | Background job queue (Inngest, Vercel Queues) |
| Code-binding lookups | One per session → no issue | OK | Cache code → `auth_user_id` mapping in KV |

The architecture has clear horizontal-scaling paths but **we don't need them for the foreseeable use case** (small group of business users, one admin).

---

## Sources

- [Soniox Live Demo (React + Server reference)](https://github.com/soniox/soniox_examples/tree/master/apps/soniox-live-demo) — **primary** source for SDK patterns, temp-key flow, two-way translation config (HIGH confidence)
- [Soniox JS SDK packages](https://github.com/soniox/soniox-js) — confirms `@soniox/client` and `@soniox/react` packages exist with Next.js support (HIGH)
- [Vercel Edge Runtime docs](https://vercel.com/docs/functions/runtimes/edge) — confirms 25 s response budget, no WebSocket server support, Dec 2025 guidance to prefer Node (HIGH)
- [Supabase Anonymous Sign-Ins guide](https://supabase.com/docs/guides/auth/auth-anonymous) — confirms `signInAnonymously()` and `is_anonymous` JWT claim for RLS (HIGH)
- [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security) — referenced for RLS policy patterns (HIGH from prior knowledge, secondary source not fetched due to tool issues)
- [pdf-lib README](https://pdf-lib.js.org/) — referenced for PDF generation feasibility (HIGH from prior knowledge)
- [Dexie.js](https://dexie.org/) — referenced for IndexedDB wrapper (HIGH from prior knowledge)
- [Zustand](https://github.com/pmndrs/zustand) — referenced for state management (HIGH from prior knowledge)

**Note on tool friction during this research:** WebSearch and WebFetch returned model errors for most queries this session; primary sources were therefore obtained via the GitHub CLI (`gh api`) reading the official Soniox examples repository at master, and via direct `curl` against documentation HTML. The Soniox patterns are particularly well-confirmed because we read the actual reference implementation source rather than relying on prose documentation.
