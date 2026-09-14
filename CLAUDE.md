<!-- GSD:project-start source:PROJECT.md -->
## Project

**PayLingo — App dịch song ngữ real-time**

PayLingo là web app PWA hỗ trợ giao tiếp 2 chiều giữa người Việt và đối tác nước ngoài trong các cuộc gặp trực tiếp. Hai khung ngôn ngữ song song hiển thị transcript real-time theo từng "audience": khung A đối tác (đa ngôn ngữ, tự chọn) — khung B của anh (luôn tiếng Việt). Speech-to-text + dịch thực hiện qua Soniox WebSocket streaming, latency ~1-2s.

App phục vụ admin (anh) và một nhóm user được cấp access code; mọi history lưu trên cloud và có thể export PDF.

**Core Value:** **Cho phép 2 người không cùng ngôn ngữ trò chuyện trực tiếp mượt mà qua 1 thiết bị**, mỗi người nhìn vào khung của mình và đọc bằng ngôn ngữ mẹ đẻ — không cần phiên dịch viên, không cần thao tác phức tạp.

Tradeoff anchor: nếu phải chọn giữa "nhiều tính năng" và "trải nghiệm hội thoại trực tiếp mượt mà", luôn ưu tiên cái sau.

### Constraints

- **Tech stack**: Next.js 16 (App Router) + React 19 + TypeScript 5.6 + Tailwind 4 + shadcn/ui + Supabase (Postgres/Auth/Storage) + `@soniox/react` 2.3 + Dexie 4 (IndexedDB) + `@react-pdf/renderer` + `@serwist/next` PWA + Vercel deploy.
- **STT/Translation API**: Soniox WebSocket (real-time + translation, model `stt-rt-v5`, mode `two_way`). Browser kết nối trực tiếp tới Soniox qua **temporary API key** (mint từ Next.js Route Handler) — không proxy qua server. Chi phí thực tế: **$0.12/giờ** (rẻ hơn 60× so với ước tính ban đầu; 30ph ≈ $0.06).
- **Latency target**: end-to-end ≤ 2s từ lúc đối tác nói xong cụm từ đến lúc text hiện lên khung. Streaming partial transcript chấp nhận flicker nhẹ.
- **Performance**: app phải chạy mượt trên mid-range mobile (Android 2-3 năm tuổi). Tránh heavy compute client-side.
- **Privacy**: không lưu audio file. Transcript là dữ liệu nhạy cảm — cần Row-Level Security trên Supabase, access code phải khó đoán.
- **Hosting**: Vercel free tier cho deploy MVP. Supabase free tier (500MB DB, 1GB storage) đủ cho giai đoạn đầu.
- **Browser support**: Chrome/Edge mới (Wake Lock + WebAudio đầy đủ), Safari iOS 16.4+. Không support IE và Safari cũ.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR — Recommended Stack
| Layer | Pick | Confidence |
|-------|------|-----------|
| Framework | Next.js **16.2.6** (App Router) | HIGH |
| Runtime | React **19.2.6** | HIGH |
| Language | TypeScript **5.6.0** | HIGH |
| Styling | Tailwind CSS **4.3.0** + shadcn/ui (CLI **4.8.1**) | HIGH |
| STT + translation | **`@soniox/react` 2.3.0** + **`@soniox/node` 2.3.0** (model `stt-rt-v5`) | HIGH |
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
## 2. Soniox v5 Real-Time (validated)
### 2.1 Packages
| Package | Version | Side | Role |
|---------|---------|------|------|
| `@soniox/react` | 2.3.0 | client | `useRecording` hook, mic capture, render-safe state |
| `@soniox/client` | 2.3.0 | client (transitive of `@soniox/react`) | Core WebSocket + audio worklet |
| `@soniox/node` | 2.3.0 | server | Mints temporary API keys via `client.auth.createTemporaryKey()` |
### 2.2 Architecture (definitive)
### 2.3 Concrete config for PayLingo
### 2.4 The wire protocol (for reference)
- `text`, `is_final`, `confidence`
- `language` (which panel to route to)
- `translation_status: 'original' | 'translation' | 'none'`
- `source_language` (when translated)
- `start_ms`, `end_ms` (for timestamps in PDF export)
### 2.5 Models — pick exactly one
| Model | Use it? | Why |
|-------|---------|-----|
| `stt-rt-v5` | **YES** | Current GA real-time model (v5). Superior accuracy in noise/accents, low-latency, supports `two_way` translation. |
| `stt-rt-v4` | Retired | Retired June 30, 2026. Aliased to v5 by server. |
| `stt-rt-v3` | No | Previous gen. Inferior accuracy and latency. |
| `stt-async-v5` | No | For uploaded files only. PayLingo is real-time. |
### 2.6 Reconnect handling (your downstream consumer asked)
- **Auto-reconnect on retriable errors** (network drop, idle disconnect) — set `auto_reconnect: true`, transcript persists by default.
- **Manual reconnect on stale connections** — call the returned `reconnect()` from `visibilitychange` listener. The hook's docs literally cite this use case.
- **The `is_final` contract.** Tokens already marked `is_final: true` will NOT be re-sent on reconnect. Only the partial trailing edge may be re-emitted. Your IndexedDB write logic should de-dupe by `(session_id, start_ms, text)` to be safe.
### 2.7 Pricing — correction to PROJECT.md
| Item | Soniox 2026 published rate |
|------|----------------------------|
| Real-time STT + translation | **$0.12 / hour** |
| Async STT (file upload) | $0.10 / hour |
| TTS | $0.70 / hour of audio |
### 2.8 Alternatives — for completeness only
| Service | Why not (vs Soniox) |
|---------|---------------------|
| Deepgram + DeepL | Two separate APIs, no built-in language ID + translation in one stream, higher combined latency, much higher cost. |
| Google Cloud Speech + Translation | Multi-service, no single WebSocket session for two-way, complex billing. |
| OpenAI Realtime API (`gpt-4o-realtime`) | TTS-first, designed for voice agents. Real-time translation works but is expensive ($/minute model). |
| AssemblyAI Universal-Streaming | No built-in translation. STT only. |
## 3. Audio Capture
- `navigator.mediaDevices.getUserMedia({ audio: true })`
- `AudioContext` + `AudioWorkletNode` (modern path, NOT deprecated `ScriptProcessor`)
- Down-conversion to mono PCM_S16LE at 16 kHz (what Soniox v4 expects)
- Mute/unmute detection (the `isSourceMuted` flag, fired on hardware mute or OS-level mute)
- Permission resolution via `BrowserPermissionResolver` (uses Permissions API where available)
### Custom audio source (out of scope for v1)
### Pitfalls
- **iOS Safari requires user gesture.** Don't call `start()` until after a click handler. The SDK throws otherwise. PayLingo's "Start" button satisfies this.
- **HTTPS required.** `getUserMedia` is blocked on insecure origins. Vercel gives you HTTPS by default; no action needed.
- **Echo cancellation defaults.** `getUserMedia({ audio: true })` defaults to `echoCancellation: true, noiseSuppression: true`. The SDK passes these through. **Don't override** for PayLingo — partners speaking near the mic benefit from noise suppression.
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
#### Schema
#### Login flow (user side)
#### RLS
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
### Schema (mirrors Postgres tables for sync)
### Sync engine (no library needed)
- `session.stop()` (flush remaining)
- Every 10 s while online (background sync)
- `window.addEventListener('online', …)`
- Manual "Upload" button
## 6. PWA: Serwist (NOT next-pwa)
| Package | Version | Notes |
|---------|---------|-------|
| `@serwist/next` | 9.5.11 | Active Next.js plugin |
| `serwist` | 9.5.11 | Underlying Workbox-style toolkit |
### Why Serwist, not next-pwa
### What Serwist gives PayLingo
- Installable PWA (manifest + icons, you provide).
- Cached app shell (HTML, JS, CSS) for offline page load.
- Service worker that **does NOT** cache `/api/*` or Soniox WebSocket — those need fresh connectivity.
- Background sync hook (`workbox-background-sync`) — optional, the manual sync engine above is simpler.
### Config
### Pitfalls
- **Don't cache `/api/auth/temporary-key`.** Temp keys are 5-minute scoped — a cached one is a stale credential. Serwist's `defaultCache` already excludes `/api/*` from SW caching; verify in DevTools after first build.
- **iOS PWA quirks.** Adding to home screen works since iOS 16.4, but you lose the URL bar. Wake Lock still works inside the PWA frame. Test on a real iPhone before launch.
## 7. Wake Lock
### Browser support (verified via caniuse 2026-05-27)
| Browser | Min version | Notes |
|---------|-------------|-------|
| Chrome / Edge | 90+ | Stable since 2021 |
| Safari (macOS) | 16.4+ | March 2023 |
| Safari (iOS) | 16.4+ | March 2023 — matches PROJECT.md constraint |
| Firefox | 126+ | June 2024 |
| Android Chrome | All current versions |  |
| Samsung Internet | 14+ |  |
### Gotchas
- **Auto-released when tab loses visibility.** The `visibilitychange` handler above re-acquires.
- **Auto-released on `navigator.wakeLock.request` errors** — non-fatal, just degraded UX (screen may sleep).
- **iOS PWA in standalone mode:** Wake Lock works, but `visibilitychange` fires differently from in-browser. Test on-device.
## 8. PDF Export: `@react-pdf/renderer`
| Package | Version | Notes |
|---------|---------|-------|
| `@react-pdf/renderer` | 4.5.1 | React 19 compatible (verified peer dep `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`) |
### Why react-pdf, not pdf-lib
- **`@react-pdf/renderer`** has a first-class `Font.register({ family, src })` API that automatically handles font subsetting and Unicode mapping. JSX-style component composition makes the 2-panel transcript layout trivial.
- **`pdf-lib`** is lower-level — requires you to add `@pdf-lib/fontkit`, call `registerFontkit()`, manually compute line breaks, manually wrap mixed-script text. ~3× the code.
### Implementation sketch
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
## 10. Smaller picks
### State (cross-component)
### Forms
### Validation
- API route input schemas (`/api/auth/redeem-code` payload)
- Soniox response narrowing (already typed but Zod lets you double-check at the seam)
- Form schemas
### IDs
### Error tracking
### Analytics
## 11. Deploy & Environment
### Vercel
- **Plan:** Hobby is fine for MVP. Free SSL, auto previews, ISR not used.
- **Region:** Choose `sin1` (Singapore) or `hkg1` (Hong Kong) for VN/APAC latency. **Set this in `vercel.json` or project settings — defaults to `iad1` (US) which adds 200ms to admin requests.**
- **Functions:** Route Handlers run on Node by default (preserve this — `@soniox/node` uses Node-only APIs).
- **Env vars:**
# Server-only (do NOT prefix with NEXT_PUBLIC_)
# Client-safe
### Supabase
- Project region: choose `ap-southeast-1` (Singapore) to pair with `sin1` Vercel.
- Migrations: use Supabase CLI (`supabase db diff`, `supabase db push`) committed to repo. Don't edit schema only in Studio.
- Backups: free tier = 7-day point-in-time recovery on Pro only. For MVP, schedule a weekly `pg_dump` cron via GitHub Actions if you care.
## 12. Confidence Summary
| Decision | Confidence | Why |
|----------|-----------|-----|
| Next.js 16 + React 19 | HIGH | Verified latest npm, peer deps, Soniox's own example aligned |
| Soniox SDK + `stt-rt-v5` + two-way translation | HIGH | Read source of `@soniox/react@2.3.0` directly, verified config shape, verified Next.js example uses identical pattern to PayLingo |
| Soniox pricing $0.12/hr (not $0.10/min) | HIGH | Direct fetch of soniox.com/pricing |
| Supabase + `@supabase/ssr` 0.10.3 | HIGH | Stable, current, official Next.js docs are recent |
| Access-code = anon sign-in + `app_metadata` claim + RLS | MEDIUM | This is the cleanest synthesis but no off-the-shelf pattern. Two unknowns: (a) whether `app_metadata` claim is in JWT immediately after `updateUserById` or only after `refreshSession()` — code samples assume the latter; (b) admin role assignment via Studio is manual. Recommend prototyping this end-to-end in phase 1. |
| Dexie 4 | HIGH | Mature, active, TS-first |
| Serwist over next-pwa | HIGH | `next-pwa` last published 2022 — verified on npm; Serwist actively maintained, 9.5.11 current |
| Wake Lock native API | HIGH | Browser support matrix exactly matches PROJECT.md's stated minimum |
| `@react-pdf/renderer` for PDF | HIGH | React 19 peer dep verified; font registration handles VI + CJK |
| Tailwind 4 + shadcn | HIGH | Both stable, shadcn CLI supports Tailwind 4 |
| Vercel + region pick | MEDIUM | Hobby tier limits (60s function timeout) are not relevant since Soniox WS bypasses Vercel; latency claim relies on user being in VN/APAC |
## 13. Pitfalls & Roadmap Flags
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
