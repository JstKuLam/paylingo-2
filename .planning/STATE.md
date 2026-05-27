# PayLingo — Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-27)

**Core value:** Cho phép 2 người không cùng ngôn ngữ trò chuyện trực tiếp mượt mà qua 1 thiết bị — mỗi người đọc bằng ngôn ngữ mẹ đẻ của mình.
**Current focus:** Phase 1 — Foundation

## Current State

- ✅ PROJECT.md initialized
- ✅ Config (YOLO, standard, parallel, research+check+verify on, quality models)
- ✅ Research complete (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY)
- ✅ REQUIREMENTS.md defined (65 v1 requirements across 10 categories)
- ✅ ROADMAP.md created (7 phases, MVP mode)
- ⏳ Next: `/gsd:discuss-phase 1` to gather context for Phase 1 — Foundation

## Phase Progress

| Phase | Status |
|-------|--------|
| 1. Foundation | ⏳ Not started |
| 2. Streaming spike | ⏳ Pending |
| 3. Session lifecycle + autosave | ⏳ Pending |
| 4. History + edit + PDF export | ⏳ Pending |
| 5. Layout switcher + polish | ⏳ Pending |
| 6. Admin panel | ⏳ Pending |
| 7. PWA wrap-up + launch | ⏳ Pending |

## Key Decisions Locked

- Stack: Next.js 16 + React 19 + Supabase + `@soniox/react` + Dexie 4 + `@react-pdf/renderer` + Serwist PWA + Vercel
- Auth: Anonymous sign-in + access_codes + RLS via `app_metadata` JWT claim
- Audio: Browser → Soniox direct WebSocket via temp API key
- Pricing: Soniox $0.12/hr (corrected from initial $0.10/min estimate — 60× cheaper)
- v1 partner languages: EN, ZH, JA, KO, ES, RU, DE, TH (8)
- Output: Text-only (no TTS in v1)
- Speaker detection: Auto-by-language, majority-aggregation per sentence
