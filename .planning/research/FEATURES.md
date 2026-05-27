# Feature Landscape — PayLingo (In-Person 2-Way Speech Translation Web App)

**Domain:** Real-time bidirectional speech-to-text + translation for face-to-face business meetings (PWA, text-only output)
**Researched:** 2026-05-27
**Reference apps:** Google Translate Conversation mode, Microsoft Translator (Live), SayHi Translate, iTranslate Voice, Otter.ai (transcription only), Android Live Caption, DeepL Voice, Vasco translators (hardware)

> **Confidence note:** External tool access (WebSearch / WebFetch / Brave / Context7) was unavailable during this research pass — findings are drawn from training-data knowledge of the listed reference apps and general patterns of streaming-STT products. Where I'm reasoning by analogy rather than direct evidence I mark **LOW confidence**. The roadmap author should re-verify cost-tracking specifics and Soniox-particular partial/final token semantics in Phase 1 spike work.

---

## Use-Case Anchor (read first)

PayLingo is **not** a generic transcription app and **not** a phrasebook translator. It is purpose-built for one shape of interaction:

> Two people, **one device between them**, **one Vietnamese + one foreign-language partner**, meeting face-to-face, taking turns to talk. Each person looks only at their own panel and reads only their own language. Output is **text-only** (no TTS), latency budget ≤ 2s end-to-end.

Every feature recommendation below is evaluated against this anchor. A feature that is "must-have" in Otter.ai (meeting recorder for one team) may be "anti-feature" in PayLingo (privacy-sensitive cross-language conversation). Conversely, the **layout flip** (rotate one panel 180°) that no general transcription tool has is **table stakes** here because the device sits between two people.

---

## Table Stakes (must-have — app feels broken without these)

Features users in this category **already expect** because Google Translate Conversation has them, or because the app physically can't fulfill its job without them.

### Audio Capture & Control

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-1 | **Single primary "Start / Stop" button** (large, thumb-reachable, obvious recording state) | Low | — | Google Translate, SayHi, MS Translator all use one prominent mic affordance. Anything more complex breaks the "device between two people" UX. |
| TS-2 | **Microphone permission flow with clear pre-prompt** explaining why mic is needed before triggering the browser prompt | Low | TS-1 | First-time browser mic prompts have ~40-60% denial rate without context (general web UX knowledge, MEDIUM). Critical because partner may not speak Vietnamese and will see the prompt. |
| TS-3 | **Visible recording state indicator** (pulsing dot, color change, or waveform) — must be visible on BOTH panels (the partner's side too) | Low | TS-1 | If partner can't tell whether they're being recorded, conversation stalls. Google Translate uses an animated mic icon; MS Translator uses a glowing border. |
| TS-4 | **Audio level meter / live waveform** (low-fi VU meter is enough) so users know mic is actually picking up voice | Medium | TS-1, TS-3 | Critical debugging affordance — without it, "is the mic working?" is unanswerable in a meeting and the user will mash buttons. Web Audio `AnalyserNode` is straightforward. |
| TS-5 | **Mute / unmute toggle** distinct from Stop (pause without ending the session) | Low | TS-1 | When a third party walks in or there's a side conversation, you don't want to end the session. SayHi and MS Translator both have this. |
| TS-6 | **Graceful handling of mic permission denied** — show what to do, don't just freeze | Low | TS-2 | Edge case but inevitable. Show inline instructions ("Click the lock icon in the address bar…") or a Vietnamese-language explainer. |

### Live Transcription Display

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-7 | **Two side-by-side (or stacked) panels**, each labeled with its target language | Low | — | Core product concept. Without this it's just a transcription app. |
| TS-8 | **Streaming partial tokens with visual distinction from finalized text** (e.g., partial in lighter grey, italic, or with cursor) | Medium | TS-1, Soniox tokens | Google Translate shows finalized text only (waits ~1s) → feels slow; modern competitors stream partials. Soniox emits `is_final: true/false` per token. **Critical**: pin the partial chunk to a stable line so it doesn't flicker the whole transcript. |
| TS-9 | **Auto-scroll to latest message** when new content arrives, but **pause auto-scroll if user scrolls up** to re-read | Medium | TS-7, TS-8 | Otter.ai and most live-caption apps do this. Scroll-jacking when user is reading earlier text is a common rage-quit moment. |
| TS-10 | **Message grouping by speaker / utterance** (each "turn" becomes a card or paragraph with subtle separator) | Medium | TS-8, TS-21 | Without grouping it looks like a wall of text and reviewing later is painful. Group on language-change events (Soniox detection delta) and silence gaps (~1.5s). |
| TS-11 | **Timestamps per message (or per turn)**, visible on hover/tap, baked into history | Low | TS-10 | Required for the PDF export ("Active" requirements list this). Display can be subtle (small grey, right-aligned). |
| TS-12 | **Stable text rendering — no layout shift / jump when partial → final** | Medium | TS-8 | This is what makes the difference between "feels professional" and "feels broken." Reserve space for the partial line; finalize in place. Common pitfall. |
| TS-13 | **Empty-state guidance** in each panel ("Bắt đầu nói tiếng Việt…" / "Start speaking English…") | Low | TS-7 | Without empty state, users freeze on first launch. |

### Language Management

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-14 | **Dropdown to select partner language** before starting session (8 options per spec: EN, ZH, JA, KO, ES, RU, DE, TH) | Low | — | Spec requirement. Use native script + Latin name (`中文 (Chinese)`) for clarity. |
| TS-15 | **Language flags / native script** in the dropdown (visual recognition for non-Vietnamese readers) | Low | TS-14 | Partner may need to point at the language during setup. Flags + native script accommodate non-readers. |
| TS-16 | **Vietnamese panel locked / non-editable language** (subtle visual treatment, no dropdown affordance) | Low | TS-7 | Per spec — but visually communicate that it's intentional, not missing. |
| TS-17 | **Detected-language indicator** (subtle badge showing what Soniox actually detected for the most recent utterance) | Medium | TS-8 | Trust calibration. When language detection misfires (e.g., user says English number while partner is speaking Chinese), the badge surfaces it without requiring manual override. |
| TS-18 | **Mid-session language switch** (partner switches from EN to ZH halfway through) — possible without ending session | Medium | TS-14 | Real meetings drift across languages. Should reconfigure Soniox stream without dropping history. (HIGH complexity if it forces stream restart — flag for spike.) |

### Session Management

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-19 | **Explicit Start / Stop session** (per spec) — Stop closes the stream and writes final session record | Low | TS-1 | Spec. |
| TS-20 | **Auto-generated session name** from date/time + partner language ("2026-05-27 14:30 — English") | Low | TS-19 | Spec. Default must be useful so most users never rename. |
| TS-21 | **Rename session post-hoc** (after Stop, in history view) | Low | TS-19, History-features | Spec. |
| TS-22 | **Local autosave to IndexedDB every N seconds (or per message)** while recording | Medium | TS-19 | Spec. Resilience requirement. |
| TS-23 | **Crash recovery on reload** — detect orphan session, offer "Resume" or "Discard" | Medium | TS-22 | Spec. Without this, dropped sessions = lost transcripts = "this app eats my data" complaint. |

### History & Retrieval

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-24 | **Sessions list** scoped to current access code (user sees own; admin sees all) | Low | Auth, TS-19 | Spec. |
| TS-25 | **Open session → read full transcript (both panels)** in same dual-panel layout as live view | Low | TS-7, TS-24 | Spec. Reuse the live layout component for read-only render. |
| TS-26 | **Search within transcripts** (across all sessions for user; full-text within a single session for admin) | Medium | TS-24 | Spec. Postgres full-text search is sufficient at MVP scale. |
| TS-27 | **Filter list by date range** | Low | TS-24 | Spec. |
| TS-28 | **Delete a session** (admin can delete any; user can delete own) | Low | TS-24 | Otherwise transcripts pile up. Soft delete preferred for admin recovery. |

### Editing

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-29 | **Edit transcript text after session ends** (per panel, per message) — fix STT errors | Medium | TS-25 | Spec. STT will misrecognize names, numbers, jargon — fixing matters before export. **Live editing is explicitly out of scope** (per "Key Decisions" in PROJECT.md). |
| TS-30 | **Auto-save edits** (no separate Save button — debounced write to backend) | Medium | TS-29 | Modern UX expectation; reduces friction. |

### Export

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-31 | **Export session to PDF** with both languages, timestamps, session metadata (name, date, partner lang) | Medium | TS-25, TS-29 | Spec. Use server-side rendering (react-pdf or Puppeteer) for consistent output. |
| TS-32 | **PDF respects RTL where relevant** + uses fonts that cover CJK + Cyrillic + Thai (Noto family safe choice) | Medium | TS-31 | Without correct fonts, exported PDFs render as `□□□`. Common failure. **Flag for Phase research.** |

### Auth & Access Control

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-33 | **Access code entry screen** (single input, prominent) — no email/password | Low | — | Spec. |
| TS-34 | **Code is remembered on device** (cookie / localStorage) — user doesn't re-enter every visit | Low | TS-33 | Otherwise too much friction for repeat use. |
| TS-35 | **Admin login** (separate route or separate credential field) with full session visibility | Medium | TS-33 | Spec. |
| TS-36 | **Admin CRUD on access codes** — create, name, set expiry, set minute-cap, revoke | Medium | TS-35 | Spec. |
| TS-37 | **Code expiry enforcement** at login + when session starts (avoid mid-session expiration surprise) | Low | TS-33, TS-36 | Spec implies expiry exists; must actually enforce it. |
| TS-38 | **Code minute-cap enforcement** — block new session when cap reached, show clear message | Medium | TS-36 | Spec. Without this, codes are unbounded billing risk. |

### Resilience & Offline

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-39 | **Network status indicator** (visible "offline" badge when disconnected) | Low | — | Spec. |
| TS-40 | **Auto-reconnect to Soniox WebSocket on transient drop** without ending session | Medium | TS-19 | Spec. Soniox docs describe reconnection protocol — confirm semantics during spike. |
| TS-41 | **Continue local-only recording while offline**, sync transcripts to cloud on reconnect | High | TS-22, TS-40 | Spec. Note: Soniox is a *cloud* STT service — offline-while-recording can only mean buffering audio for later replay OR pausing STT but still recording UI state. **Needs Phase 1 design call.** |
| TS-42 | **Manual "Upload now" button** for syncing local sessions to cloud | Low | TS-22 | Spec. |

### PWA / Mobile

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-43 | **Wake Lock active during session** (per spec) with subtle UI indicator | Low | TS-19 | Spec. Use `navigator.wakeLock.request('screen')`. |
| TS-44 | **Responsive layout** for mobile portrait / landscape / tablet / laptop | Medium | TS-7 | Spec. |
| TS-45 | **Layout switcher** — three modes: stack (top/bottom), side-by-side (left/right), and **flipped** (one panel rotated 180° for conversation mode) | Medium | TS-44 | Spec. Flipped mode is what makes "device between two people" work — partner reads upright when device is on table. **This is a true differentiator** (most apps don't have it) but listed as table stakes because spec calls it out. |
| TS-46 | **Installable as PWA** (manifest, install prompt where supported) | Low | — | Spec. Reduces friction for repeat use; users open from home screen. |
| TS-47 | **Icon set, favicon, theme color, splash screen** for installed PWA | Low | TS-46 | "Feels broken" if missing on home screen. |

### Performance & Cost (basic)

| # | Feature | Complexity | Depends On | Justification |
|---|---|---|---|---|
| TS-48 | **Per-code minute counter** visible to admin dashboard | Low | TS-36, TS-38 | Spec. Foundation for cost tracking. |
| TS-49 | **Admin dashboard: cost estimate** based on Soniox $0.10/min × accumulated minutes per code | Low | TS-48 | Spec. Simple multiplication is fine for MVP; refine later if Soniox billing nuance emerges. |
| TS-50 | **Hard stop when code's minute cap hit mid-session** (warn at 80%, stop at 100%) | Medium | TS-38, TS-48 | Without this, cap is decorative. |

---

## Differentiators (competitive advantage — what makes PayLingo better than alternatives)

These are not strictly required to ship, but they're what makes the app **distinctly good** for the in-person business meeting use case versus Google Translate.

### Conversation UX Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-1 | **Flipped layout (180° rotation of one panel)** treated as a first-class mode with a one-tap toggle | Medium | TS-45 | Already in spec — but treat as a *signature* feature. Google Translate has Conversation mode but no rotation; Vasco hardware does rotation but isn't a web app. Lead with this in marketing/onboarding. | Ship v1 (already required) |
| DF-2 | **"Conversation mode" preset** — one-tap setup that picks layout, starts session, requests Wake Lock, expands fonts | Low | TS-45, TS-43 | Reduces 3-4 taps to 1. Mirrors Google Translate's "Tap to start" in Conversation mode. | Ship v1 |
| DF-3 | **Large, high-contrast text mode** for older partners or bright rooms | Low | TS-7 | Business meetings often involve older partners or sunlit rooms. Simple `prefers-contrast` + font-size toggle. | v1 if cheap |
| DF-4 | **Auto-detect speaker via language alone** (per spec decision) — no manual speaker selection needed | Medium | TS-17 | Already in spec. The product wins by *not* asking the user "who's speaking now?" — Google Translate Conversation does this via "tap the speaker's language button," which is friction. | Ship v1 |

### Transcript Quality Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-5 | **Confidence indicator on uncertain segments** (subtle underline or low-opacity for low-confidence tokens) | Medium | TS-8 | Soniox emits confidence; surfacing it helps users know what to verify in editing. Most apps hide this; surfacing it is honest UX. | v1 if Soniox exposes it |
| DF-6 | **Inline "this looks wrong, edit?" affordance** (long-press on a message) for live mid-session correction-flagging without disrupting flow (defer actual edit until post-session per spec) | Medium | TS-29 | Bookmark errors during conversation; fix in batch after. Avoids the "live editing" complexity barrier. | v1 nice-to-have |
| DF-7 | **Side-by-side aligned editing** (both languages shown when editing one) | Medium | TS-29 | Lets user fix STT errors with translation context visible. | v2 |
| DF-8 | **Highlight number / date / proper-name tokens** (these are highest-error categories in STT) for quick visual verification | Medium | TS-8 | Domain-specific. Use regex post-processing on the transcript. | v2 |

### Session & Workflow Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-9 | **Pre-session notes / context field** ("Meeting with Suzuki-san about Q3 contract") attached to session metadata for findability | Low | TS-19 | Low cost, high retrieval value. Otter has this. | v1 |
| DF-10 | **Tag / label sessions** (e.g., "Suzuki-san", "Logistics partner") for grouping | Low | TS-24 | After 50+ sessions, search alone isn't enough. | v2 (skip if admin's session volume is low) |
| DF-11 | **Quick-share link** (generate short URL to a read-only session view, time-limited) | High | TS-25, Auth | Useful for sharing transcript with colleague who has no access code. Adds significant auth complexity — defer. | v2 |
| DF-12 | **Email session as PDF attachment** directly from app | Medium | TS-31 | After PDF export, sending it is the natural next step. Could use `mailto:` for v1 to skip server email infra. | v1 if cheap |

### Export & Sharing Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-13 | **Export format toggle: bilingual (both columns) vs monolingual (one language only)** | Low | TS-31 | Sometimes user wants to send the partner the foreign-language transcript only. Cheap to support. | v1 |
| DF-14 | **Export as plain text or markdown** in addition to PDF | Low | TS-31 | Power users want copy-paste-able. Trivial to add given the data structure. | v1 |
| DF-15 | **Per-export options: include/exclude timestamps, speaker labels, confidence marks** | Low | TS-31 | Simple checkbox set in export dialog. | v1 |
| DF-16 | **PDF branding / header customization** (company logo, meeting title) | Low | TS-31 | Business context — exported transcripts often become meeting minutes. | v2 |

### Admin Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-17 | **Usage analytics per code: sessions count, minutes used, languages used, last active** | Medium | TS-36, TS-48 | Spec implies dashboard; this is the substance of it. | v1 |
| DF-18 | **Cost projection** ("at current pace this code will spend $X by end of month") | Medium | DF-17 | Helps admin spot runaway costs. | v2 |
| DF-19 | **Bulk operations on codes** (extend expiry for 5 codes, revoke 3 codes) | Low | TS-36 | If admin manages > ~10 codes, single-row CRUD gets tedious. | v2 |
| DF-20 | **Audit log** (who logged in when, which session was viewed/deleted/edited by admin) | Medium | TS-35 | Privacy / compliance ask if PayLingo serves regulated industries. | v2 if needed |

### Resilience Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-21 | **Visible "reconnecting…" state with countdown / attempts** (not just a binary offline icon) | Low | TS-39, TS-40 | Reduces panic during transient drops. | v1 |
| DF-22 | **Buffered audio replay-after-reconnect** (re-send buffered PCM chunks to Soniox once connection restores, to fill the gap) | High | TS-40, TS-41 | **HIGH complexity; depends on Soniox replay semantics.** Could be a true differentiator vs Google Translate (which just drops audio during a network blip). Flag for Phase research. | v2 unless cheap |
| DF-23 | **Local-first model: full session functions without sync to cloud, sync is opt-in/background** | High | TS-22, TS-41 | Spec already aligns. Worth treating as a marketing point. | Already in spec |

### Performance & Cost Differentiators

| # | Feature | Complexity | Depends On | Justification | Priority |
|---|---|---|---|---|---|
| DF-24 | **Voice Activity Detection (VAD) client-side** to pause Soniox stream during silence and resume on speech, reducing API minutes billed | Medium-High | TS-1 | At $0.10/min, every minute of silence avoided is real money. Web Audio + simple energy threshold can work, or `@ricky0123/vad-web`. **Trade-off: VAD that's too aggressive cuts off speech starts.** | v1 if Soniox doesn't already do this server-side; v2 otherwise |
| DF-25 | **Network-aware quality throttling** (lower audio sample rate on slow connections) | Medium | TS-1 | `navigator.connection.effectiveType` is supported on Chrome. Helps in field meetings on tethered hotspots. | v2 |
| DF-26 | **Per-session cost shown to user (admin only)** at end of session | Low | TS-48, TS-49 | Transparency — admin sees what each meeting cost. | v1 |

---

## Anti-Features (deliberately NOT building — and WHY)

> Each item has an explicit reason so future scope creep is resisted. Items marked **(spec)** are also in PayLingo's PROJECT.md "Out of Scope" section.

### Already in PROJECT.md Out of Scope (re-stated here with feature framing)

| # | Anti-feature | Why NOT | Instead |
|---|---|---|---|
| AF-1 | **Text-to-Speech / spoken output (spec)** | Simplification + cost; user reads from screen in face-to-face meeting | Text-only output with clear typography |
| AF-2 | **Manual speaker selection / "tap to speak" (spec)** | Auto-detect by language is faster + zero-friction | Trust Soniox language detection; flag misdetects via DF-5 confidence indicator |
| AF-3 | **Zoom / Google Meet / Teams integration (spec)** | Different use case (online meeting has its own audio routing complexity) | Stay focused on in-person — single mic, single device |
| AF-4 | **Video / webcam / lip-reading (spec)** | Out of scope; audio is sufficient | — |
| AF-5 | **Native iOS / Android app (spec)** | PWA + Wake Lock covers needs; building native multiplies dev cost 3x | PWA with manifest + install prompt (TS-46) |
| AF-6 | **Audio file storage (spec)** | Privacy + storage cost + complexity | Transcript-only persistence |
| AF-7 | **Background recording with screen locked (spec)** | Not feasible in PWA (browsers suspend tabs); requires native | Wake Lock keeps screen on |
| AF-8 | **Email/password account system (spec)** | Adds friction; admin wants invite-only access control | Access codes only |
| AF-9 | **Multi-language UI / i18n (spec)** | UI is for Vietnamese admin / Vietnamese users; partners only read their panel text | Vietnamese-only UI |
| AF-10 | **Voice fingerprint speaker diarization (spec)** | Adds latency + needs training data + Soniox does language-detect already | Language-based speaker routing |

### Additional Anti-Features (recommended, not yet in spec — flag to confirm)

| # | Anti-feature | Why NOT | Instead |
|---|---|---|---|
| AF-11 | **Live (mid-session) transcript editing** | Edit UI competes with live reading UI; touch interactions on streaming text are buggy and confusing | Edit only post-session (TS-29). Optional DF-6 "flag this" affordance during live for batch-fix later. |
| AF-12 | **Multi-party / 3+ language meetings** | UX becomes incoherent with 3+ panels; auto-detect is unreliable with > 2 languages flipping rapidly | One Vietnamese + one foreign partner only. Document as a limitation. |
| AF-13 | **Speaker diarization within the same language** (two English speakers, label as Speaker A / B) | Otter does this; needs voice fingerprinting; out of scope per AF-10 | Treat all foreign-side speech as one stream regardless of who's speaking |
| AF-14 | **Custom vocabulary / domain glossary upload** (e.g., "our company's product names") | Soniox may support this server-side (verify); UI for it adds complexity | Skip in v1; add only if STT accuracy proves a blocker post-launch |
| AF-15 | **Translation memory / phrase reuse across sessions** | Useful for translators but not for live conversation | — |
| AF-16 | **Real-time collaboration (multiple devices joining a session)** | The spec's "1 code = unlimited devices" allows simultaneous logins, but session-sharing is different. Adds Realtime / Supabase Channels complexity. | Each device runs its own session; merge via PDF/text export if needed |
| AF-17 | **Public / unauthenticated demo or "try without code" mode** | Cost exposure; abuse risk on shared API key | Admin can issue short-lived demo codes (TS-36 expiry + TS-38 cap covers this) |
| AF-18 | **AI summarization of transcripts** | Tempting but: privacy, cost, scope creep, and the user can paste the export into ChatGPT themselves | — |
| AF-19 | **Push notifications when partner finishes speaking** | The whole point is they're in the same room — eye contact replaces notifications | — |
| AF-20 | **Calendar integration / meeting auto-scheduling** | Way out of scope | — |
| AF-21 | **Per-message "translate to Y" override** (re-translate a specific message to a different language) | Inflates UI; users wanting this can copy text to Google Translate | — |
| AF-22 | **Phrasebook / pre-saved phrases** | Different product (iTranslate, Vasco); doesn't fit live-meeting flow | — |
| AF-23 | **Conversation handover / "you talk now" cue tones** | Adds audio output (conflicts with AF-1 TTS exclusion); also intrusive | Users self-coordinate; transcript appearing IS the cue |
| AF-24 | **Multiple simultaneous foreign languages displayed** (e.g., partner says something in English, partner #2 says something in Korean — show both) | Reduces panel clarity; outside the 2-person anchor (AF-12) | — |

---

## Feature Dependencies (read top-to-bottom for build order intuition)

```
Auth foundation
  TS-33 (code entry) → TS-34 (remember) → TS-35 (admin login) → TS-36 (CRUD codes)
                                                              ↘ TS-37 (expiry) → TS-38 (cap)
                                                              ↘ DF-17 (analytics) → DF-18 (projections)

Audio + UI foundation
  TS-2 (mic permission) → TS-1 (start/stop) → TS-3 (recording indicator)
                                            → TS-4 (level meter)
                                            → TS-5 (mute)

Soniox streaming
  TS-1 → [Soniox WebSocket spike] → TS-8 (partial tokens) → TS-9 (auto-scroll)
                                                          → TS-10 (message grouping)
                                                          → TS-11 (timestamps)
                                                          → TS-12 (no-flicker rendering)
                                                          → TS-17 (detected lang)
                                                          → DF-5 (confidence)

Language config
  TS-14 (dropdown) → TS-15 (flags) → TS-16 (VN locked)
                                   → TS-18 (mid-session switch)
                                   ↘ DF-4 (auto-detect speaker)

Session lifecycle
  TS-19 (start/stop) → TS-20 (auto-name) → TS-21 (rename)
                     → TS-22 (autosave) → TS-23 (recovery)
                                        → TS-41 (offline continue)
                                        → TS-42 (manual upload)

Persistence & history
  Session lifecycle → TS-24 (list) → TS-25 (read view) → TS-26 (search)
                                                      → TS-27 (date filter)
                                                      → TS-28 (delete)
                                                      → TS-29 (edit) → TS-30 (autosave edits)

Export
  TS-25 + TS-29 → TS-31 (PDF) → TS-32 (font coverage)
                              → DF-13 (mono/bilingual)
                              → DF-14 (txt/md)
                              → DF-15 (per-export options)

Resilience
  TS-22 → TS-23 (recovery)
        → TS-39 (offline badge) → TS-40 (reconnect) → DF-21 (reconnect UI)
                                                    → TS-41 (offline record) → DF-22 (replay)

PWA
  TS-46 (manifest) → TS-47 (icons/theme)
  TS-43 (Wake Lock) → DF-2 (conversation mode preset)
  TS-44 (responsive) → TS-45 (layout switcher) → DF-1 (flipped mode)

Cost guards
  TS-48 (per-code minutes) → TS-49 (cost est) → TS-50 (cap enforce)
                          → DF-17 (analytics) → DF-18 (projections)
                                              → DF-26 (per-session cost)
  TS-1 → DF-24 (VAD) [optional, saves cost]
       → DF-25 (network throttle) [optional]
```

---

## MVP Recommendation (suggested v1 cut)

If shipping pressure forces a smaller v1, the **absolute minimum** to validate the core value (`Cho phép 2 người không cùng ngôn ngữ trò chuyện trực tiếp mượt mà qua 1 thiết bị`) is:

**Must ship v1.0 (validates the product hypothesis):**
- Auth: TS-33, TS-34, TS-35, TS-36, TS-37, TS-38
- Capture: TS-1, TS-2, TS-3, TS-4, TS-5
- Streaming: TS-7, TS-8, TS-9, TS-10, TS-11, TS-12, TS-13
- Language: TS-14, TS-15, TS-16, TS-17 *(TS-18 mid-session switch can defer)*
- Session: TS-19, TS-20, TS-21, TS-22, TS-23
- History: TS-24, TS-25, TS-27, TS-28 *(TS-26 search can defer to v1.1)*
- Edit: TS-29, TS-30
- Export: TS-31, TS-32, DF-13 *(DF-14, DF-15 can defer)*
- Resilience: TS-39, TS-40, DF-21 *(TS-41 offline-record can defer if hard)*
- PWA: TS-43, TS-44, TS-45, TS-46, TS-47, DF-1, DF-2
- Cost: TS-48, TS-49, TS-50

**Can ship v1.1 (within 1-2 weeks of v1):**
- TS-18 (mid-session language switch)
- TS-26 (transcript search)
- TS-41 (true offline recording)
- DF-3 (large text mode)
- DF-9 (pre-session notes)
- DF-12 (email PDF)
- DF-17 (admin analytics dashboard)
- DF-26 (per-session cost display)

**Defer to v2 or beyond:**
- DF-5, DF-6, DF-7, DF-8 (advanced editing UX)
- DF-10, DF-11 (tags, share links)
- DF-16 (PDF branding)
- DF-18, DF-19, DF-20 (advanced admin)
- DF-22, DF-25 (advanced resilience / network)
- DF-24 (VAD — promote to v1 if Soniox billing demands it)

---

## Cross-References to PROJECT.md

### Direct alignment (PROJECT.md Active requirements → this doc)
| PROJECT.md requirement | This doc's feature(s) |
|---|---|
| Admin login + admin features | TS-35, TS-36, DF-17 |
| Access code (CRUD, 1 code unlimited devices, history scoping) | TS-33, TS-34, TS-36, TS-37, TS-38 |
| Audio capture + Soniox streaming | TS-1, TS-2, TS-4, TS-8, TS-12 |
| Two panels, one language each, audience-based | TS-7, TS-13, TS-16 |
| Latency 1-2s, partial streaming | TS-8, TS-12 |
| Language dropdown (8 langs) + Vietnamese locked | TS-14, TS-15, TS-16 |
| Auto-route by detected language | DF-4, TS-17 |
| Start/Stop session, auto-name, rename | TS-19, TS-20, TS-21 |
| Autosave to IndexedDB + cloud sync | TS-22, TS-42 |
| Wake Lock auto-on during record | TS-43 |
| Offline indicator + reconnect + reload-recovery | TS-23, TS-39, TS-40, TS-41, DF-21 |
| History list scoped to code, open session, search | TS-24, TS-25, TS-26, TS-27 |
| Edit transcript post-session | TS-29, TS-30 |
| PDF export with both langs + timestamps | TS-11, TS-31, TS-32 |
| Responsive + layout switcher (stack/side/flipped) | TS-44, TS-45, DF-1, DF-2 |
| Admin CRUD codes + dashboard + cost estimate | TS-36, TS-38, TS-48, TS-49, TS-50, DF-17 |

### Conflicts / clarifications to flag against PROJECT.md Out of Scope
| PROJECT.md Out of Scope item | Feature in this doc that might conflict | Resolution |
|---|---|---|
| Manual override speaker | DF-6 (flag-error affordance) | DF-6 only marks errors for **post-session** edit; does not override speaker live. No conflict. |
| Multi-language UI | DF-13 (bilingual/monolingual PDF) | This is **export content**, not UI language. No conflict — app UI stays Vietnamese, exports can be in any of the 8 partner languages. |
| Native mobile app | TS-43 Wake Lock, TS-46 PWA install | PWA only, confirmed. |
| Voice fingerprint diarization | DF-5 confidence, DF-4 auto-detect speaker | Both use Soniox language detection, not voice fingerprinting. No conflict. |
| Background recording when screen locked | TS-43 Wake Lock | Wake Lock prevents lock; doesn't enable recording-while-locked. Consistent. |
| Email/password auth | TS-33-38 access codes only | Consistent. |
| Audio file storage | All features (transcript-only) | Consistent. No feature in this doc requires audio retention. |

**No conflicts detected. Two flags for confirmation:**
1. **DF-11 (shareable link)** — touches auth model since it bypasses access code for the recipient. Confirm whether quick-share is even desirable given the privacy stance in PROJECT.md Constraints ("Transcript là dữ liệu nhạy cảm"). Recommendation: **defer to v2 minimum, possibly drop entirely.**
2. **AF-12 (multi-party / 3+ language)** — confirm this is intentional. PROJECT.md says "1 hoặc nhiều đối tác nước ngoài" (one or more foreign partners), which implies > 1 partner. But the two-panel design only supports two languages at a time. **Recommendation: clarify whether "nhiều đối tác" all speaking the same foreign language is the intent (in which case fine), or whether multi-language is desired (in which case it's a much bigger v2 feature).**

---

## Risk Flags (for roadmap / phase research)

| Risk | Phase to address | What to verify |
|---|---|---|
| Soniox partial/final token semantics may flicker the UI | Phase 1 spike | Build a 1-day prototype: stream audio, render partials, verify no jump on finalize |
| Soniox reconnect / replay behavior unclear | Phase 1 spike | What happens to in-flight audio on socket drop? Is there a `resume_token`? Document before building TS-40, TS-41, DF-22. |
| PDF rendering with CJK + Cyrillic + Thai fonts | Phase: Export | Pick font (Noto Sans family), confirm Vercel serverless function size budget for embedded fonts |
| Mid-session language switch (TS-18) may require Soniox session restart | Phase: Language config | Spike: can Soniox accept new `language_hints` mid-stream, or does it need a new session? |
| VAD vs Soniox billing model | Phase: Cost | Confirm whether Soniox bills connected-time or speech-time. If connected-time, DF-24 VAD becomes critical, not optional. |
| Wake Lock support gap on older iOS Safari | Phase 1 | iOS 16.4+ required; verify partner devices meet. Fallback UI for unsupported browsers? |
| IndexedDB quotas + sync conflict resolution | Phase: Resilience | Last-write-wins vs CRDT vs explicit choice. For a single-user-per-code app, LWW is likely fine but document the decision. |
| Vietnamese language detection accuracy when partner is speaking Vietnamese (e.g., greeting "Xin chào") | Phase 1 | Could mis-route to VN panel. Test with mixed-language utterances. |

---

## Sources

**Direct evidence:** External research tools were not available during this research pass.

**Indirect evidence (training-data knowledge of reference apps):**
- Google Translate Conversation mode (Android/iOS) — language-pair selection, tap-to-speak with manual speaker toggle, message-card UI, no rotation; history limited
- Microsoft Translator Live Conversation — multi-participant code-join model, web + mobile, side-by-side transcript, broadcast-style
- Otter.ai — single-language transcription, message grouping, editing, search, export — closest analog for transcript-management UX
- iTranslate / SayHi — phrasebook-style 2-way, mostly single utterance at a time, less suited to flowing conversation
- Android Live Caption — system-level streaming captions, demonstrates flicker-free partial/final rendering at OS level
- DeepL Voice (newer) — high-quality streaming but Mac/Windows focused, less mobile
- Vasco / Pocketalk (hardware) — flipped-display "two-sided screen" hardware, conceptually validates PayLingo's flipped layout differentiator

**Confidence on individual claims:**
- HIGH: layout flipping, partial/final token UX, mic permission pre-prompts, font coverage for CJK/Thai PDF rendering, IndexedDB autosave patterns — these are well-established web app patterns
- MEDIUM: specific feature lists of competitors (Google Translate / MS Translator) — based on training-data familiarity, not freshly verified
- LOW: Soniox-specific behaviors (reconnect, mid-stream language switch, billing model) — must verify in Phase 1 spike before committing to dependent features (TS-18, TS-40, TS-41, DF-22, DF-24)
- LOW: exact cost projections at scale — depends on Soniox billing model

**Action for roadmap author:** Treat Phase 1 as a Soniox capabilities spike before committing to the more complex resilience/streaming features. Re-verify confidence-LOW items there.
