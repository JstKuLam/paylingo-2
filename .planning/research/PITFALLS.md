# Pitfalls — PayLingo

**Domain:** Real-time bidirectional speech translation PWA
**Researched:** 2026-05-27
**Confidence:** HIGH for browser/audio/PWA pitfalls (well-documented); MEDIUM for Soniox-specific edge cases (some require Phase 1 spike to verify)

---

## Severity Legend

- 🔴 **Critical** — will break the product or leak data
- 🟡 **Important** — will cause user pain or cost overrun
- 🟢 **Nice-to-know** — minor polish concerns

---

## 1. Audio Capture / Microphone

### P-AUDIO-01 🔴 — iOS Safari suspends AudioContext on backgrounding
- **Symptom:** User switches apps for 1 second → comes back → no more transcription, no error shown.
- **Warning sign:** Transcript stops updating but Soniox WS still "connected".
- **Prevention:** Listen to `document.visibilitychange`. On `hidden`: pause UI but keep Wake Lock if possible. On `visible`: explicitly call `audioContext.resume()` and Soniox SDK `reconnect()`. Show "tap to resume" if resume fails.
- **Phase:** Phase 2 (streaming spike) — verify on real iPhone before locking design.

### P-AUDIO-02 🟡 — iOS PWA requires user gesture to start mic
- **Symptom:** "Start" button works first time but if app reloads or service worker restarts, mic permission silently denied.
- **Prevention:** Always start `getUserMedia` from a click handler, never from `useEffect`. Cache `MediaStream` reference; tear down on Stop, recreate on next Start.
- **Phase:** Phase 2.

### P-AUDIO-03 🟡 — AirPods / Bluetooth mic conflict
- **Symptom:** User has AirPods connected for music; PayLingo grabs the wrong mic, partner's voice is faint or echoed.
- **Prevention:** In settings UI, show selected device name; let user pick from `navigator.mediaDevices.enumerateDevices()`. Default to "default" but allow override.
- **Phase:** Phase 5 (polish).

### P-AUDIO-04 🟡 — Echo when partner speaks while speaker plays previous audio
- **Symptom:** Phone speaker plays beep / notification → mic picks it up → app transcribes own audio.
- **Prevention:** Set `echoCancellation: true, noiseSuppression: true, autoGainControl: true` in getUserMedia constraints. Mute system sounds during session (cannot fully control on web — document in UX).
- **Phase:** Phase 2.

---

## 2. Soniox SDK / Streaming

### P-SONIOX-01 🔴 — Temporary API key expires mid-session
- **Symptom:** Long meeting (>60min) → WS closes mid-sentence, transcript stops.
- **Warning sign:** Soniox emits `error` event with `code: 401` or `expired`.
- **Prevention:** Soniox SDK auto-refreshes if you supply a `getTemporaryApiKey` callback (vs a static key). Wire the callback to a Next.js Route Handler that mints fresh keys; SDK handles rest. Verify in Phase 2 spike.
- **Phase:** Phase 2.

### P-SONIOX-02 🟡 — Partial → Final token reconciliation flicker
- **Symptom:** Words appear, change, appear differently as Soniox refines. User finds it distracting.
- **Prevention:** Render partial tokens with subtle visual cue (lighter color, italic, fade-in). Group tokens into "sentence cards" by `<end>` marker — only finalize the card on final tokens. Avoid auto-scroll on each partial token (debounce 200ms).
- **Phase:** Phase 2.

### P-SONIOX-03 🔴 — Reconnect loses recent tokens
- **Symptom:** Network blip → SDK reconnects → 3-5 seconds of audio missing from transcript.
- **Prevention:** SDK has client-side buffering but it's bounded. Show "reconnecting…" indicator. Don't try to "fill the gap" — be honest with user. Add manual "I missed something" replay button in v2.
- **Phase:** Phase 2 (spike to measure gap size).

### P-SONIOX-04 🟡 — `<end>` token semantics inconsistent across languages
- **Symptom:** Chinese sentences run together; English splits correctly; Japanese splits at clause level.
- **Prevention:** Don't rely solely on `<end>` for sentence boundaries. Add silence-gap heuristic (2s no tokens = force end). Test per-language in Phase 2.
- **Phase:** Phase 2.

### P-SONIOX-05 🟡 — Soniox concurrency cap per account
- **Symptom:** 3rd parallel user fails to connect — silent.
- **Prevention:** Check `GET /v1/concurrency-limits` on Soniox account before launching. For MVP single-admin scenario this is fine; flag for v2 if scale changes.
- **Phase:** Phase 1 (verify limit during account setup).

---

## 3. Real-Time Transcript UX

### P-UX-01 🟡 — Auto-scroll fights manual scroll
- **Symptom:** User scrolls up to re-read; new token arrives → app jumps to bottom.
- **Prevention:** Detect manual scroll (track `scrollTop` vs `scrollHeight`). If user scrolled away from bottom, stop auto-scrolling; show "↓ new messages" pill that jumps to latest when tapped.
- **Phase:** Phase 2.

### P-UX-02 🟡 — Mobile virtual keyboard pushes panel out of view
- **Symptom:** Edit transcript → keyboard appears → bottom panel hidden.
- **Prevention:** Edit mode is post-session only (per anh's decision), so keyboard never overlaps live panels. Still: use `dvh` units, not `vh`, for panel heights. Test on iOS where toolbar collapses.
- **Phase:** Phase 4 (history/edit).

### P-UX-03 🟢 — Very long sessions cause scroll lag
- **Symptom:** 2-hour meeting with 500+ messages → scroll jank on mid-range Android.
- **Prevention:** Virtualize message list with `@tanstack/react-virtual` when count > 100.
- **Phase:** Phase 4.

### P-UX-04 🟡 — Mixed RTL languages (future) misalign
- **Symptom:** Adding Arabic to v2 → text alignment breaks.
- **Prevention:** Note for v2; v1 has only LTR languages (EN, ZH, JA, KO, ES, RU, DE, TH, VI all LTR).
- **Phase:** v2.

---

## 4. Speaker Detection by Language (PayLingo-specific)

### P-SPK-01 🔴 — Anh speaks English to clarify → routed to partner panel
- **Symptom:** Anh says "yes, OK" or "thank you" in English → text appears in partner's panel as if partner said it. Confusing.
- **Prevention:** This was anh's explicit choice (no manual override). Document as known limitation in onboarding tooltip: "App phân biệt người nói bằng ngôn ngữ. Hãy nói tiếng Việt để text xuất hiện ở khung của anh."
- **Phase:** Phase 2 (Soniox spike validates behavior); Phase 5 (UX tooltip).

### P-SPK-02 🟡 — Vietnamese with English loanwords mid-sentence
- **Symptom:** "Anh xem cái email rồi" → "email" tagged as English, splits the sentence into two panels.
- **Prevention:** Soniox's token-level language detection should tag short loanwords as part of the parent sentence's language (verify in spike). If wrong: aggregate tokens within `<end>` to majority language → route whole sentence.
- **Phase:** Phase 2 spike.

### P-SPK-03 🟡 — Partner says "hello" or "xin chào" → wrong panel
- **Symptom:** Greeting in non-native language routes wrong.
- **Prevention:** Same as P-SPK-02: majority-language aggregation within `<end>` boundary. For single-word utterances: accept the misroute as edge case; show source language tag in message.
- **Phase:** Phase 2.

### P-SPK-04 🟢 — Code-switching across whole sentences
- **Symptom:** Partner switches between EN and ZH mid-conversation.
- **Prevention:** Each sentence routes independently — works correctly with majority-language approach. Document.
- **Phase:** Phase 2.

---

## 5. Persistence (IndexedDB + Dexie + Sync)

### P-PERSIST-01 🔴 — IndexedDB quota exceeded on iOS
- **Symptom:** After ~50MB transcript storage, writes silently fail on iOS Safari.
- **Prevention:** Monitor `navigator.storage.estimate()`; warn user at 80%. Add "delete oldest session" prompt at 95%. Don't store audio (already decided). Compress transcript JSON (gzip via CompressionStream API).
- **Phase:** Phase 3.

### P-PERSIST-02 🔴 — Sync conflict: user edits offline, server has newer version
- **Symptom:** User edits message offline. Reconnects. Server message has been edited by admin via panel. Whose version wins?
- **Prevention:** Last-Write-Wins with timestamp. Add `updated_at` column. On conflict: keep server's, warn user with toast "Server có bản mới hơn, đã ghi đè edit của anh".
- **Phase:** Phase 4 (edit feature).

### P-PERSIST-03 🟡 — Dexie write throttling on heavy token streams
- **Symptom:** Partial tokens written every ~50ms → 20 writes/sec → IDB transaction queue grows.
- **Prevention:** Debounce writes: only persist final tokens immediately, batch partial tokens at 250ms intervals. Use `bulkPut` for batched writes.
- **Phase:** Phase 3.

### P-PERSIST-04 🟡 — Service worker stale cache breaks sync
- **Symptom:** Serwist caches Supabase client → user sees stale data after app update.
- **Prevention:** Don't cache Supabase API calls. Cache static assets only. Use `NetworkFirst` for `/api/*` routes.
- **Phase:** Phase 7 (PWA wiring).

---

## 6. Access-Code Auth (Supabase Anonymous + code_bindings)

### P-AUTH-01 🔴 — Brute force codes
- **Symptom:** Attacker scripts code-lookup endpoint, guesses 6-digit codes.
- **Prevention:** Use longer codes (10+ chars alphanumeric → 36^10 = 3.6×10^15 combos). Rate-limit code-lookup endpoint at IP level via Vercel middleware or Supabase Edge Function. Add 1-second sleep on invalid attempts.
- **Phase:** Phase 1 (auth setup).

### P-AUTH-02 🔴 — RLS policy lets user A see user B's sessions
- **Symptom:** Bug in RLS predicate → data leak. Most critical bug class for multi-tenant app.
- **Prevention:** Write RLS test suite using Supabase's local stack: create 2 fake codes, assert each only sees own sessions, assert admin sees both. Run on every migration. Reference: `ARCHITECTURE.md` § Auth.
- **Phase:** Phase 1.

### P-AUTH-03 🟡 — JWT claim propagation timing
- **Symptom:** Admin updates `app_metadata` for a code → user still sees old permissions until next session.
- **Prevention:** Call `client.auth.refreshSession()` after admin changes; document delay for admin in UI. (Flagged by STACK research as MEDIUM confidence — Phase 1 spike.)
- **Phase:** Phase 1.

### P-AUTH-04 🟡 — Admin login surface
- **Symptom:** Admin route uses same domain → if user discovers `/admin` → has login form to attack.
- **Prevention:** Rate-limit admin login attempts strictly (5/min/IP). Use Supabase Auth's email+password for admin (it has bcrypt + rate-limiting built in). Don't expose admin route in sitemap/robots.
- **Phase:** Phase 6 (admin panel).

### P-AUTH-05 🟢 — Code leak / sharing
- **Symptom:** Code shared on Telegram → strangers use it → API costs spike.
- **Prevention:** anh accepted this risk (unlimited devices). Mitigation: per-code minute caps already in scope. Show admin a "recent activity from N devices" warning when device count spikes.
- **Phase:** Phase 6 (admin stats).

---

## 7. PWA / Mobile-Specific

### P-PWA-01 🟡 — Wake Lock not available on iOS < 16.4
- **Symptom:** Older iPhones (iPhone 8/X with iOS 15) can't keep screen on. User locks phone → recording dies.
- **Prevention:** Feature-detect `'wakeLock' in navigator`. If unavailable: show banner "Thiết bị anh không hỗ trợ giữ màn hình. Hãy tăng Auto-Lock setting trước session." Don't try to silently work around.
- **Phase:** Phase 2.

### P-PWA-02 🟡 — iOS standalone PWA Wake Lock behavior differs from in-Safari
- **Symptom:** Add to home screen → mic permission re-prompts. Wake Lock may behave differently.
- **Prevention:** Test PWA mode separately from Safari mode on actual iPhone. Document expected behaviors. Re-prompt mic gracefully on first session in PWA mode.
- **Phase:** Phase 7.

### P-PWA-03 🟢 — Add-to-home-screen flow varies
- **Symptom:** Chrome shows native prompt; Safari requires manual menu tap.
- **Prevention:** Show platform-specific install instructions modal on first visit.
- **Phase:** Phase 7.

### P-PWA-04 🟡 — Service worker caching breaks live data
- **Symptom:** Serwist precaches `/api/sessions` accidentally → user sees old sessions.
- **Prevention:** Strict cache rules: NetworkOnly for `/api/*`, StaleWhileRevalidate for Next.js static, CacheFirst for fonts/images. Use Serwist runtime caching config, not generic.
- **Phase:** Phase 7.

---

## 8. Cost Runaway

### P-COST-01 🔴 — Forgotten session left recording overnight
- **Symptom:** User starts session, forgets to stop. 10 hours of silence transcribed = wasted API time, fills DB.
- **Prevention:** Auto-end session if no tokens received in 5 minutes (VAD-like, based on Soniox events). Show countdown warning at 4 min. Configurable per-code (admin can set).
- **Phase:** Phase 3 (session lifecycle).

### P-COST-02 🟡 — Cost monitoring after corrected pricing ($0.12/hr)
- **Symptom:** At $0.12/hr, even high usage stays cheap (~$30/month for 10 active users × 1hr/day). But surprises still possible.
- **Prevention:** Admin dashboard shows total minutes/code/day. Set per-code cap (admin can set max 60min/session, 240min/day). Email alert if monthly threshold crossed.
- **Phase:** Phase 6 (admin stats).

### P-COST-03 🟢 — No VAD = paying during silence
- **Symptom:** Silence between speakers still bills.
- **Prevention:** At $0.12/hr this is minor (~$0.002/min silence). Defer VAD to v2 unless usage scales. Auto-end (P-COST-01) catches egregious cases.
- **Phase:** v2.

---

## 9. Supabase / Vercel Deployment

### P-DEPLOY-01 🔴 — Soniox API key leaked
- **Symptom:** API key in client bundle → scraped → unauthorized use → billing surprise.
- **Prevention:** ONLY use temporary-API-key flow (per ARCHITECTURE.md). Master key lives in Vercel env var server-side only. Never `NEXT_PUBLIC_SONIOX_*`. Audit final bundle for leaks before launch.
- **Phase:** Phase 2.

### P-DEPLOY-02 🟡 — Cold start latency on first session of day
- **Symptom:** First user hits `/api/auth/temporary-key` → 2-3s cold start on Vercel Hobby.
- **Prevention:** Use Edge runtime for the temp-key endpoint (faster cold start, lower latency). Or accept the one-time 2s delay — first session of day only.
- **Phase:** Phase 2.

### P-DEPLOY-03 🟢 — Bundle size grows past Vercel free tier
- **Symptom:** Fonts + Soniox SDK + PDF library + Dexie + shadcn → bundle exceeds limits.
- **Prevention:** Code-split PDF library + fonts (lazy load only on export route). Tree-shake Soniox SDK. Monitor bundle size in CI.
- **Phase:** Phase 5 (polish), Phase 7 (PWA).

---

## 10. Legal / Privacy

### P-LEGAL-01 🔴 — Partner consent for recording/transcription
- **Symptom:** Partner unaware their voice is captured + stored → legal issue in GDPR jurisdictions.
- **Prevention:** Show prominent "🎙 Đang ghi âm + dịch" indicator visible in BOTH panels (so partner sees it on their flipped panel). Add brief disclaimer in onboarding: "Hãy hỏi đồng ý đối tác trước khi bắt đầu session."
- **Phase:** Phase 5 (polish).

### P-LEGAL-02 🟡 — Data retention
- **Symptom:** Old sessions accumulate; user has no way to delete; GDPR right-to-be-forgotten not honored.
- **Prevention:** User can delete own sessions. Admin can delete any. Add auto-delete-after-N-days as admin setting (optional v2).
- **Phase:** Phase 4 (history) + Phase 6 (admin).

---

## 11. PDF Export

### P-PDF-01 🟡 — Vietnamese diacritics + CJK glyphs missing in PDF
- **Symptom:** Export Korean session → PDF shows tofu boxes (□□□).
- **Prevention:** Bundle Noto Sans for Latin/Vietnamese + Noto Sans CJK for ZH/JA/KO + Noto Sans Thai. Use `@react-pdf/renderer` `Font.register` for each. Lazy-load fonts per session's languages only (P-PDF-02).
- **Phase:** Phase 4 (export).

### P-PDF-02 🟡 — Bundle size from font embedding
- **Symptom:** Naive load of all fonts → 15MB+ bundle, blows past Vercel function size.
- **Prevention:** Detect languages in session being exported. Load only those fonts. Use font subsetting for Latin+Vietnamese (small). Render PDF client-side to keep Vercel function size small.
- **Phase:** Phase 4.

### P-PDF-03 🟢 — Long sessions = huge PDF
- **Symptom:** 2-hour session → 50+ pages PDF, slow to generate.
- **Prevention:** Show progress bar during generation. Use `react-pdf` streaming if available.
- **Phase:** Phase 4.

---

## Phase Mapping Summary

| Phase | Top pitfalls to address |
|-------|------------------------|
| **Phase 1 — Auth + DB foundation** | P-AUTH-01, P-AUTH-02, P-AUTH-03, P-SONIOX-05 |
| **Phase 2 — Soniox streaming spike** | P-AUDIO-01, P-AUDIO-02, P-AUDIO-04, P-SONIOX-01-04, P-SPK-01-03, P-PWA-01, P-DEPLOY-01, P-DEPLOY-02 |
| **Phase 3 — Session lifecycle + autosave** | P-PERSIST-01, P-PERSIST-03, P-COST-01 |
| **Phase 4 — History + edit + export** | P-UX-02, P-UX-03, P-PERSIST-02, P-PDF-01, P-PDF-02, P-LEGAL-02 |
| **Phase 5 — Polish (layout switcher, settings)** | P-AUDIO-03, P-LEGAL-01, P-SPK-01 (tooltip) |
| **Phase 6 — Admin panel** | P-AUTH-04, P-AUTH-05, P-COST-02 |
| **Phase 7 — PWA wrap-up** | P-PWA-02, P-PWA-03, P-PWA-04, P-PERSIST-04, P-DEPLOY-03 |

---

## Critical Watch-Outs (TL;DR for roadmap)

1. **Phase 1 must include an RLS test harness.** Data-leak class bugs are catastrophic for a multi-tenant access-code app.
2. **Phase 2 must be a real-device spike on actual iPhone.** Don't trust DevTools simulators for audio/PWA/Wake Lock.
3. **Phase 2 must validate Soniox token-level language detection on Vietnamese-with-loanwords.** This makes or breaks the speaker-by-language UX promise.
4. **Never expose Soniox master API key client-side.** Temp-key flow only.
5. **Auto-end-on-silence (P-COST-01) belongs in v1**, not v2. One forgotten overnight session pays for the feature work.
