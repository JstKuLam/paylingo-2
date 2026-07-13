# Changelog

All notable changes to this project will be documented in this file.

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
