# Requirements — PayLingo v1

**Derived from:** PROJECT.md + research (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY)
**Last updated:** 2026-05-27

---

## v1 Requirements

### Authentication & Access Control

- [ ] **AUTH-01** — Admin (anh) can log in with email + password (Supabase Auth standard)
- [ ] **AUTH-02** — Admin can create a new access code with label, expiration date, and per-session minute cap
- [ ] **AUTH-03** — Admin can list, edit, and delete access codes
- [ ] **AUTH-04** — User can enter an access code on landing page to access the app (no email required)
- [ ] **AUTH-05** — 1 access code can be used on unlimited devices simultaneously
- [ ] **AUTH-06** — Code-lookup endpoint is rate-limited to prevent brute force (≥1s delay on invalid attempts)
- [ ] **AUTH-07** — Expired or revoked codes show clear error on attempted login
- [ ] **AUTH-08** — RLS policies isolate sessions per code; admin sees all, code-users see only their own

### Real-Time Speech-to-Text + Translation

- [ ] **STT-01** — App captures microphone audio in browser via `@soniox/react` SDK on user gesture (Start button)
- [ ] **STT-02** — Browser opens WebSocket directly to Soniox using temporary API key minted by server (master key never client-side)
- [ ] **STT-03** — Soniox configured with model `stt-rt-v4`, `translation.type=two_way`, `language_a=vi`, `language_b=<selected partner lang>`, `enable_language_identification=true`
- [ ] **STT-04** — Partial tokens render with visual distinction (lighter/italic); final tokens finalize sentence display
- [ ] **STT-05** — Sentence-end detection uses Soniox `<end>` token + 2s silence fallback (language-dependent)
- [ ] **STT-06** — End-to-end latency from speech to displayed text ≤ 2 seconds (target)
- [ ] **STT-07** — Temporary API key auto-refreshes during long sessions without dropping transcript

### Language Selection & Routing

- [ ] **LANG-01** — Khung A has a dropdown for partner language; v1 supports 8: English, 中文, 日本語, 한국어, Español, Русский, Deutsch, ภาษาไทย
- [ ] **LANG-02** — Khung B is locked to tiếng Việt
- [ ] **LANG-03** — Partner language must be selected before Start button enables
- [ ] **LANG-04** — Tokens are routed to panels by aggregating language detection within `<end>` boundary (majority language → that panel)
- [ ] **LANG-05** — Each panel shows only the audience's language: Khung A = partner language only; Khung B = Vietnamese only

### Session Lifecycle

- [ ] **SESS-01** — User explicitly starts a session via Start button; explicitly stops via Stop button
- [ ] **SESS-02** — Each session is persisted with auto-name `YYYY-MM-DD HH:mm <partner-lang>`; user can rename after stop
- [ ] **SESS-03** — Active session enables Wake Lock API automatically (when supported)
- [ ] **SESS-04** — Session auto-ends after 5 minutes of zero tokens received (cost guard); warning shown at 4 min
- [ ] **SESS-05** — Per-code minute cap enforced: when reached, session ends with explanatory message
- [ ] **SESS-06** — On reload during active session, app offers to resume from IndexedDB or start new

### Persistence & Sync

- [ ] **PERSIST-01** — Tokens autosave to IndexedDB via Dexie (final tokens immediate, partials batched at 250ms)
- [ ] **PERSIST-02** — Background sync pushes session + messages to Supabase Postgres when online
- [ ] **PERSIST-03** — Offline indicator visible when network drops; sync resumes automatically when back online
- [ ] **PERSIST-04** — Sync conflict resolution: server timestamp wins; client shows toast notification of override
- [ ] **PERSIST-05** — Storage quota monitored via `navigator.storage.estimate()`; user warned at 80%

### History & Editing

- [ ] **HIST-01** — User sees list of own sessions sorted by date desc, with search by transcript content
- [ ] **HIST-02** — User can open any session to view full transcript (both panels rendered)
- [ ] **HIST-03** — User can rename a session
- [ ] **HIST-04** — User can delete a session (own only)
- [ ] **HIST-05** — User can edit transcript messages after session ends (post-session only, not live)
- [ ] **HIST-06** — Edited transcript reflects updated_at timestamp; conflicts resolved by last-write-wins

### Export

- [ ] **EXPORT-01** — User can export any session to PDF with `@react-pdf/renderer`
- [ ] **EXPORT-02** — PDF includes session name, date, both panels side-by-side per message, timestamps
- [ ] **EXPORT-03** — PDF font embedding lazy-loads only fonts needed for session's languages (Noto Sans family)
- [ ] **EXPORT-04** — PDF generation runs client-side to keep Vercel function size small

### Responsive UI + Layout Switcher

- [ ] **UI-01** — App is responsive across mobile (portrait/landscape), tablet, laptop
- [ ] **UI-02** — Layout switcher icon offers 3 modes: stacked (vertical), side-by-side, flipped 180° (conversation mode)
- [ ] **UI-03** — Layout choice persists in localStorage per user
- [ ] **UI-04** — Active session shows recording indicator visible in both panels (legal: partner can see they're being recorded)
- [ ] **UI-05** — UI language is Vietnamese only (admin + user interface)
- [ ] **UI-06** — Panels use `dvh` units to handle mobile browser chrome correctly

### Admin Panel

- [ ] **ADMIN-01** — Admin panel at `/admin` requires admin login; rate-limited
- [ ] **ADMIN-02** — Admin can CRUD access codes (label, expiration, minute cap)
- [ ] **ADMIN-03** — Admin can view list of all sessions across all codes, with filter by code/date and full-text search
- [ ] **ADMIN-04** — Admin can open and view any session's transcript
- [ ] **ADMIN-05** — Admin can export any session to PDF
- [ ] **ADMIN-06** — Admin can delete any session
- [ ] **ADMIN-07** — Admin dashboard shows usage stats: total minutes per code, total minutes per day, estimated cost ($0.12/hr)
- [ ] **ADMIN-08** — Admin dashboard surfaces device-count anomalies (e.g., "code X used by 10+ devices today")

### Resilience & Reliability

- [ ] **REL-01** — On Soniox WebSocket disconnect: SDK auto-reconnects; UI shows "reconnecting…" indicator
- [ ] **REL-02** — On AudioContext suspend (iOS backgrounding): on visibility return, resume context + reconnect SDK + show "tap to resume" if auto-resume fails
- [ ] **REL-03** — Echo cancellation, noise suppression, auto gain control all enabled on getUserMedia
- [ ] **REL-04** — Wake Lock failure (unsupported browser) shows banner: "Tăng Auto-Lock setting trước session"
- [ ] **REL-05** — Onboarding tooltip explains speaker-by-language behavior to set user expectations

### Deployment & Operations

- [ ] **OPS-01** — App deployed to Vercel from GitHub via main branch auto-deploy
- [ ] **OPS-02** — Soniox master API key in Vercel env vars (server-only, never `NEXT_PUBLIC_`)
- [ ] **OPS-03** — Supabase project created with RLS enabled on all tables
- [ ] **OPS-04** — Database migrations tracked in `supabase/migrations/`
- [ ] **OPS-05** — Service worker (Serwist) configured with NetworkOnly for `/api/*`, CacheFirst for static assets

---

## v2 (Deferred — not in scope this milestone)

- ElevenLabs TTS for partner audio output (high-value, deferred for simplicity)
- Manual speaker override button
- VAD (Voice Activity Detection) to skip silence billing
- Audio file storage + playback
- Multi-language UI (admin can switch)
- Custom glossary / industry terms
- Online meeting integration (Zoom/Meet/Teams audio capture)
- Native mobile app
- Share-link for sessions
- Auto-delete old sessions after N days

---

## Out of Scope (v1 — explicit exclusions)

- Email/password user auth — using access code only
- TTS / voice synthesis — text only
- Manual speaker switch — auto by language only
- Audio file persistence — transcript only (privacy + storage)
- Background recording when screen locked — Wake Lock instead (web limitation)
- Multi-language UI — Vietnamese only
- Voice fingerprinting / diarization — language-based routing only
- Speaker name beyond "anh" / "partner" — simple model
- Share-link for sessions — privacy concern
- Mobile push notifications — out of v1
- Live editing during session — post-session only

---

## Definition of Done (v1 release)

- All AUTH, STT, LANG, SESS requirements implemented and tested on Chrome Android + iOS Safari 16.4+
- RLS test suite passes (no cross-code data leak)
- Phase 2 spike validated speaker-by-language routing on Vietnamese-with-loanwords
- PDF export renders correctly with all 9 languages (Vietnamese + 8 partner langs)
- Admin can operate the system end-to-end (create code → user uses → admin sees session → exports PDF)
- App passes Lighthouse PWA audit (installable)
- Deployed to Vercel with custom domain (TBD)

---

## Traceability

| Category | Phase |
|----------|-------|
| AUTH-01..08 | Phase 1 — Foundation |
| OPS-01..04 | Phase 1 — Foundation |
| STT-01..07 | Phase 2 — Streaming spike |
| LANG-01..05 | Phase 2 — Streaming spike |
| REL-01..03 | Phase 2 — Streaming spike |
| SESS-01..06 | Phase 3 — Session lifecycle + autosave |
| PERSIST-01..05 | Phase 3 — Session lifecycle + autosave |
| REL-04 | Phase 3 — Session lifecycle + autosave |
| HIST-01..06 | Phase 4 — History + edit + PDF export |
| EXPORT-01..04 | Phase 4 — History + edit + PDF export |
| UI-01..06 | Phase 5 — Layout switcher + polish |
| REL-05 | Phase 5 — Layout switcher + polish |
| ADMIN-01..08 | Phase 6 — Admin panel |
| OPS-05 | Phase 7 — PWA wrap-up + launch |
