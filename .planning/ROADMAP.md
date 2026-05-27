# Roadmap — PayLingo v1

**Project:** PayLingo — Real-time bidirectional speech translation PWA
**Mode:** MVP (vertical slices, prove core loop first)
**Phases:** 7
**Last updated:** 2026-05-27

---

## Phase Map

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 1 | Foundation | Auth + DB + RLS — multi-tenant base that doesn't leak | AUTH-01..08, OPS-01..04 |
| 2 | Streaming spike | Mic → Soniox → 2 panels with language routing, on real iPhone | STT-01..07, LANG-01..05, REL-01..03 |
| 3 | Session lifecycle + autosave | Start/Stop session, IndexedDB autosave, sync, auto-end | SESS-01..06, PERSIST-01..05, REL-04 |
| 4 | History + edit + PDF export | View, search, edit, export sessions | HIST-01..06, EXPORT-01..04 |
| 5 | Layout switcher + polish | 3-mode layout, recording indicator, onboarding | UI-01..06, REL-05 |
| 6 | Admin panel | Code CRUD, all-history view, usage stats | ADMIN-01..08 |
| 7 | PWA wrap-up + launch | Service worker, install, bundle audit, deploy | OPS-05 |

---

## Phase Details

### Phase 1: Foundation
**Goal:** Set up Next.js + Supabase with anonymous-sign-in + access-code auth pattern; verify RLS isolation; create admin login. Ship a "logged-in landing page" that proves the multi-tenant base works.
**Mode:** mvp

**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, OPS-01, OPS-02, OPS-03, OPS-04

**Success Criteria**:
1. Admin can log in at `/admin` and see an empty access codes list
2. Admin can create an access code; new code appears in list
3. User can enter the code at `/` landing and reach an authenticated home page
4. RLS test suite proves: code A's sessions are invisible to code B; admin sees both
5. Invalid/expired codes show clear error; brute force is rate-limited
6. App deployed to Vercel preview URL on every push

**Key risks / spikes**:
- Anonymous sign-in + `app_metadata` JWT claim propagation timing (STACK §4.2)
- RLS predicate complexity — write test harness before scaling

---

### Phase 2: Streaming spike (the riskiest phase)
**Goal:** Wire `@soniox/react` SDK into a two-panel page that captures mic, streams to Soniox with `two_way` translation, routes tokens by detected language, renders partials/finals with low latency. Prove this works on real iPhone + Chrome Android.
**Mode:** mvp

**Requirements**: STT-01, STT-02, STT-03, STT-04, STT-05, STT-06, STT-07, LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, REL-01, REL-02, REL-03

**Success Criteria**:
1. User selects partner language → presses Start → grants mic → sees own voice (Vietnamese) appear in Khung B as Vietnamese text within 2s
2. Partner speaks → text appears in Khung A in their language; translation also appears (audience-based rendering: each panel one language)
3. Anh speaks Vietnamese with an English loanword ("anh xem email rồi") → whole sentence routes to Khung B (majority-language aggregation works)
4. Network drops mid-session → SDK reconnects → "reconnecting…" indicator appears, transcript resumes
5. Backgrounding tab on iOS Safari → returning resumes recording with no manual restart needed (or shows clear "tap to resume")
6. End-to-end latency measured ≤ 2s on real-device test (iPhone 13+ and mid-range Android)

**Key risks / spikes**:
- Soniox `<end>` token semantics per language — measure and tune
- iOS AudioContext suspend on backgrounding — test thoroughly
- Vietnamese-with-loanwords routing accuracy — make-or-break for UX promise

---

### Phase 3: Session lifecycle + autosave
**Goal:** Add Start/Stop session model, persist to IndexedDB (Dexie) with sync to Supabase, auto-end on silence, resume on reload, per-code minute caps.
**Mode:** mvp

**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04, PERSIST-05, REL-04

**Success Criteria**:
1. Each Start creates a new session row in Postgres + IndexedDB with auto-name
2. Tokens written to IndexedDB immediately (finals) / batched 250ms (partials)
3. Closing browser mid-session and reopening: app offers Resume from local state OR start new
4. Network offline mid-session: indicator shows offline; transcript continues locally; sync resumes on reconnect
5. Session auto-ends after 5min of no tokens with explanatory message; warning at 4min
6. Wake Lock requested on Start; banner shown if unsupported
7. Per-code minute cap enforced: session terminates with "Hết hạn mức"

**Key risks**:
- Sync conflict semantics (server-wins with toast notification)
- iOS IndexedDB quota (warn at 80%)

---

### Phase 4: History + edit + PDF export
**Goal:** User can browse own sessions, search, view detail, edit transcript post-session, export PDF.
**Mode:** mvp

**Requirements**: HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, HIST-06, EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04

**Success Criteria**:
1. User's history page lists sessions sorted by date desc; search filters by transcript content
2. Tapping a session opens read-only view with both panels rendered
3. User can rename, delete own sessions
4. Edit mode allows fixing individual messages; updated_at reflected
5. Export PDF works for all 9 supported languages (Vietnamese diacritics + CJK + Thai + Cyrillic + Latin all render correctly)
6. PDF generation completes on mobile within 5s for typical 30-min session

**Key risks**:
- Font bundle size (lazy-load Noto Sans subsets per session language)
- List virtualization needed for sessions > 100 messages

---

### Phase 5: Layout switcher + polish
**Goal:** Polish UX for actual in-person meeting use — layout switcher, recording indicator, onboarding tooltips that set correct expectations.
**Mode:** mvp

**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, REL-05

**Success Criteria**:
1. Icon to switch layout cycles through: stacked (vertical) → side-by-side → flipped 180° (conversation mode)
2. Choice persists per device in localStorage
3. Recording state indicator visible in BOTH panels — partner can see they're being recorded (legal + UX)
4. First-time user sees brief onboarding modal explaining speaker-by-language UX ("Hãy nói tiếng Việt để text xuất hiện ở khung anh")
5. Responsive: tested on iPhone SE width 375px, iPad 768px, laptop 1280px — all panels readable, no horizontal scroll
6. Vietnamese UI throughout; copy reviewed for tone

**Key risks**:
- Mobile keyboard interaction with edit mode (use `dvh` units)
- Conversation-mode flip must be tested at table-across distance

---

### Phase 6: Admin panel
**Goal:** Admin can operate the system: manage codes, see all activity, track usage and costs, intervene when needed.
**Mode:** mvp

**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08

**Success Criteria**:
1. `/admin` requires admin login; rate-limited
2. Admin can: create code (label + expire + minute cap), list, edit, delete
3. Admin sees all sessions with filter by code, date range, full-text search
4. Admin can open any session, view full transcript, export PDF, delete
5. Dashboard shows: total minutes per code (today / 7d / 30d), total minutes all codes, estimated total cost ($0.12/hr)
6. Anomaly alert when one code uses ≥10 devices in a day (suggests code sharing)

**Key risks**:
- Admin login attack surface — strict rate limit
- RLS bypass for admin role — test admin can read everything; non-admin cannot

---

### Phase 7: PWA wrap-up + launch
**Goal:** Make app installable, fast, audit bundle, deploy to production.
**Mode:** mvp

**Requirements**: OPS-05

**Success Criteria**:
1. Serwist service worker configured: NetworkOnly for `/api/*`, CacheFirst for static assets, StaleWhileRevalidate for HTML
2. PWA manifest with proper icons (192, 512), name, theme color
3. Lighthouse PWA audit passes (installable)
4. App installable from Chrome Android prompt and iOS Add to Home Screen
5. Bundle size under Vercel function limits; main JS bundle < 300KB gzip
6. Production deploy to custom domain (TBD); analytics + error tracking wired (e.g., Vercel Analytics + Sentry free tier)
7. Smoke test on real devices: install, log in with code, record a 2min session, export PDF

**Key risks**:
- Service worker caching stale data — verify NetworkOnly rules strict
- iOS standalone PWA mic re-prompt — verify graceful re-permission

---

## v1 Coverage Check

All v1 requirements from REQUIREMENTS.md are mapped to exactly one phase:

- ✓ AUTH (8 reqs) → Phase 1
- ✓ STT (7 reqs) → Phase 2
- ✓ LANG (5 reqs) → Phase 2
- ✓ SESS (6 reqs) → Phase 3
- ✓ PERSIST (5 reqs) → Phase 3
- ✓ HIST (6 reqs) → Phase 4
- ✓ EXPORT (4 reqs) → Phase 4
- ✓ UI (6 reqs) → Phase 5
- ✓ ADMIN (8 reqs) → Phase 6
- ✓ REL (5 reqs) → Phase 2 (REL-01..03) + Phase 3 (REL-04) + Phase 5 (REL-05)
- ✓ OPS (5 reqs) → Phase 1 (OPS-01..04) + Phase 7 (OPS-05)

**Total: 65 requirements across 7 phases. 100% coverage.**
