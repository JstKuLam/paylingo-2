# Research Summary — PayLingo

**Synthesized:** 2026-05-27
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## The Big Insight

**Soniox provides a temporary-API-key flow** that lets the browser open a WebSocket directly to Soniox. We do NOT proxy WebSocket through Vercel. The `@soniox/react` SDK handles audio capture, PCM streaming, partial/final reconciliation, and emits `token.language` for panel routing — all out of the box. There is an official example (`translate-between.tsx`) that mirrors PayLingo's UI exactly.

This collapses architecture risk: PayLingo is mostly "wire up the SDK + persist + auth + polish", not "build streaming infrastructure".

---

## Recommended Stack (locked)

| Layer | Pick |
|-------|------|
| Framework | Next.js 16.2.6 (App Router) |
| Runtime | React 19.2.6 |
| Language | TypeScript 5.6 |
| UI | Tailwind 4.3 + shadcn/ui |
| STT + translation | `@soniox/react` 2.1.0 (model `stt-rt-v4`, two_way translation mode) |
| DB + Auth + Storage | Supabase (`supabase-js` 2.106, `@supabase/ssr` 0.10) |
| Auth pattern | `signInAnonymously()` + `access_codes` table + `code_bindings` + RLS via `is_anonymous` + `app_metadata` JWT claim |
| Local-first store | Dexie 4.4 (IndexedDB) |
| Wake Lock | Native `navigator.wakeLock.request('screen')` |
| PDF export | `@react-pdf/renderer` 4.5 with Noto Sans font family (lazy per-language) |
| PWA | `@serwist/next` 9.5 (next-pwa is unmaintained) |
| Deploy | Vercel Hobby tier (sufficient for MVP) |

---

## Pricing Correction (CRITICAL — update PROJECT.md)

**Soniox real-time STT + translation = $0.12/HOUR, not $0.10/minute.** That's **60× cheaper** than the original estimate.

- 30-min session: **~$0.06** (was $3 in original PROJECT.md)
- 10 active users × 1h/day × 30 days: **~$36/month** (was $900)

This drops cost from a constraint to a near-non-issue at MVP scale. Update PROJECT.md.

---

## Table-Stakes Features (v1 must-have)

Grouped from FEATURES.md, aligned with PROJECT.md Active requirements:

1. **Audio** — start/stop record, mic permission UX, recording-state indicator
2. **Live transcription** — partial+final token rendering, sentence grouping, scroll behavior
3. **Language** — initial dropdown (8 langs), routing by detected language
4. **Session** — explicit Start/Stop, auto-name by datetime, rename in history
5. **History** — list/search/filter, view detail, edit post-session
6. **Export** — PDF with timestamps, both languages, Noto Sans
7. **Auth** — access code login, admin email+password, RLS isolation
8. **Resilience** — Wake Lock, autosave to IndexedDB, reconnect, offline indicator
9. **Layout** — switcher (stack / side-by-side / flipped 180°), responsive
10. **Admin panel** — CRUD codes + caps, view all history, usage stats, export/delete sessions

---

## Build Order (recommended)

| Phase | Purpose | Validates |
|-------|---------|-----------|
| **1. Foundation** | Next.js + Supabase setup, auth (anon sign-in + code), RLS schema, admin login | Auth + RLS = no data leak; access code UX works |
| **2. Streaming spike** | Wire `@soniox/react` example, two panels with language routing, on real iPhone | The whole core loop (mic → text in correct panel < 2s) actually works on target devices |
| **3. Session lifecycle + autosave** | Start/Stop session, IndexedDB autosave, Postgres sync, auto-end on silence | Resilience: crash recovery, offline, cost guard |
| **4. History + edit + export** | List sessions, search, edit transcript post-session, PDF export with fonts | History is usable for real value |
| **5. Layout switcher + polish** | 3-mode layout switcher, responsive, recording indicator, onboarding tooltips | Conversation-mode UX feels right |
| **6. Admin panel** | CRUD codes, usage stats, view+export+delete all history | Admin can operate the system |
| **7. PWA wrap-up** | Service worker (Serwist), install prompt, font lazy-load, bundle audit | Installable, fast, ready to ship |

**The riskiest assumption is Phase 2.** Treat as a real-device spike before locking down Phase 3+ details.

---

## Top Pitfalls (must address in roadmap)

| # | Pitfall | Phase |
|---|---------|-------|
| P-AUTH-02 | RLS policy lets user A see user B's sessions | Phase 1 (with test suite) |
| P-AUDIO-01 | iOS AudioContext suspends on backgrounding | Phase 2 |
| P-SONIOX-01 | Temporary API key expires mid-session (60s TTL) | Phase 2 |
| P-SPK-01 | anh speaks English → routed to partner panel (no manual override) | Phase 2 spike + Phase 5 onboarding tooltip |
| P-COST-01 | Forgotten session left recording overnight | Phase 3 (auto-end-on-silence) |
| P-DEPLOY-01 | Soniox API key leaked to client | Phase 2 (temp-key flow only) |
| P-PERSIST-01 | IndexedDB quota exceeded on iOS | Phase 3 |
| P-PDF-01 | CJK/Vietnamese glyphs missing in PDF | Phase 4 (Noto fonts) |
| P-LEGAL-01 | Partner consent for recording | Phase 5 (visible indicator + onboarding) |
| P-PWA-04 | Service worker stale cache breaks live data | Phase 7 |

---

## Open Questions (need answer or spike)

1. **JWT claim propagation** after `auth.admin.updateUserById` — spike in Phase 1
2. **Soniox `<end>` token thresholds** per language — measure in Phase 2 spike
3. **iOS standalone PWA Wake Lock + audio interaction** — test on real device Phase 2 + 7
4. **Vercel region for Vietnamese users** — recommend `sin1` or `hkg1`; confirm with anh
5. **Soniox concurrency cap** for the chosen account tier — check during account setup Phase 1

---

## Anti-Features (v1 will NOT do — already documented)

From PROJECT.md Out of Scope + FEATURES.md anti-features:

- No TTS (ElevenLabs) — text-only v1
- No manual speaker override — auto-detect by language only
- No audio file storage — transcript only
- No online meeting integration (Zoom/Meet)
- No video processing
- No native app — PWA only
- No multi-language UI — Vietnamese only
- No share-link for sessions — privacy stance
- No live editing — post-session only
- No real-time captions during anh's own speech in his panel (he speaks Vietnamese, sees Vietnamese)
- No voice fingerprinting / diarization
- No background recording when screen locked — Wake Lock instead

---

## v2 Candidates (mentioned but deferred)

- ElevenLabs TTS for partner audio output
- Manual speaker switch button
- VAD to skip silence billing
- Audio playback of original recording
- Multi-language UI
- Online meeting integration
- Native mobile app (iOS/Android)
- Custom glossary / industry terms
- Speaker name labeling beyond "anh" / "partner"
