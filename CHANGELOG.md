# Changelog

All notable changes to this project will be documented in this file.

## [3.1.1] - 2026-07-14

### Fixed
- **Theme fidelity:** Rebuilt the dark palette as a neutral graphite and steel control surface, removing the remaining teal cast from the entry screen.
- **Tech-blue light mode:** Applied blue-white surfaces, technical blue borders, and consistent blue action states throughout the interface.
- **Theme consistency:** Replaced fixed blue, teal, white, and report-preview colors in primary, recording, AI, sharing, and archive controls with theme tokens.

## [3.1.0] - 2026-07-14

### Added
- **Offline-resilient PWA shell:** The landing page, manifest, icons, and static application assets are cached so the app can open safely when connectivity drops. Pending local records synchronize automatically when connectivity returns.
- **Ownership migration:** Added a Supabase migration that binds sessions, folders, transcripts, and shared summaries to the authenticated user ID, with legacy data backfill and ownership indexes.
- **Cloudflare deployment configuration:** Added a Pages worker configuration with the `nodejs_compat` flag required by the generated Next.js Worker.
- **Regression coverage:** Added tests for salted shared-link passwords, Soniox transcript parsing, and HTML/PDF report escaping.

### Changed
- **Complete UI/UX redesign:** Rebuilt the Home, live session, history, folder, session detail, administration, and shared-summary experiences for responsive light and dark themes.
- **Local-first synchronization:** Sessions, folders, and transcript entries are stored locally first and uploaded in owner-safe batches after a connection is available.
- **Smaller Edge deployment:** Replaced the heavyweight client PDF renderer with browser-native A4 printing. The largest Edge route dropped from approximately 3.1 MiB to 1.6 MiB and the compressed worker estimate is now below 3 MiB.

### Fixed
- **API security:** Protected the Soniox temporary-key endpoint, validated API inputs, removed embedded provider credentials, and restricted admin/settings access.
- **Shared summaries:** Replaced legacy password hashes progressively with salted PBKDF2 hashes, added rate-delay protection, and removed unsafe public data reads.
- **Data quality:** Corrected relative transcript timestamps, deterministic UUID generation, final transcript saving, sync ownership checks, and stale PWA cache recovery.

## [3.0.3] - 2026-07-13

### Fixed
- **Supabase Egress Bandwidth Optimization:** Removed the high-frequency database sync trigger (`syncPendingData()`) from the real-time transcription autosave `useEffect`. Transcription changes are now stored instantly in local IndexedDB (Dexie) and synced to Supabase efficiently in batches (every 15 seconds) or on session end, saving over 99.9% of database REST API requests and resolving the bandwidth quota issue.
- **Version bump:** Updated version to `v3.0.3` with the correct release build timestamp.

## [3.0.2] - 2026-07-13

### Fixed
- **Button Contrast (Dark & Light Theme):**
  - **Dark Theme:** Made button text and Lucide icon strokes automatically render as dark steel-grey (`#111215`) when placed inside light-silver (`#cbd5e1`) button containers (`bg-host`, `bg-primary`), ensuring maximum contrast and legibility.
  - **Light Theme:** Fixed a styling conflict that caused SVG strokes inside primary buttons to render as black. Icons (like the mic icon on Bắt Đầu button) now correctly render with white strokes.
- **Font-Size Badge ("AA"):** Re-mapped `.bg-slate-800` styling in Light theme to a light gray background with dark text to fix the unreadable dark-on-dark "AA" font size button.
- **Version bump:** Updated version to `v3.0.2` with the correct release build timestamp.

## [3.0.1] - 2026-07-13

### Fixed
- **Button Contrast (Light Mode):** Restored high-contrast white text on all blue/brand buttons and colored elements in Light Mode. Fixed the design bug where white text on saturated blue buttons was overridden to black text.
- **Version bump:** Updated version to `v3.0.1` with the correct release build timestamp.

## [3.0.0] - 2026-07-13

### Added
- **Resizable Split Layout:** Drag-to-resize support between the Host and Partner translation panels on desktop/tablet views with touch and mouse dragging.
- Smooth drag handles with vertical dotted indicators and active glowing animations.

### Changed
- **New Steel/Grey Dark Theme:** Replaced the default dark mode with a sleek, metallic dark steel-grey and slate-silver style.
- **New Tech Blue Light Theme:** Replaced the light theme with a clean, flat digital tech-blue and cyan theme.
- **Theme Minimalism:** Removed all dynamic background gradients, radial blobs, and ambient glow effects for a flat, clean, and professional appearance.
- **Simplified Theme Switcher:** Removed all intermediate themes (iOS Light, Liquid Glass, Warm Amber) to keep only two main themes: Dark (Steel) and Light (Tech Blue).
