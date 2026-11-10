---
name: oya-responsive-theme
description: Review or fix Oya frontend responsiveness, light/dark themes, keyboard navigation, and touch sizing. Use for layout or theme regressions and visual QA rather than unrelated feature implementation.
---

# Verify responsive and themed UI

Read Responsive layout and Theme behavior in [the design guide](../../../design.md). Inspect the final cascade: `tokens.css`, `landing.css`, then `adaptive.css`. For theme changes, inspect both `index.html` and `src/components/ThemeToggle.tsx` from the app root.

## Layout

Check the affected UI at 320, 375, 760, 761, 1024, and 1440 CSS pixels. The adjacent 760/761 widths expose navigation and column transitions. Inspect headings, header actions, artwork, currency strip, checkout, FAQ, and footer when shared styles change. Test 200% zoom and keyboard traversal for affected controls.

Correct the source of overflow using intrinsic sizing, wrapping, proportional artwork, or an appropriate breakpoint. Preserve readable amounts, labels, and clickable targets. Horizontal clipping is acceptable for decorative artwork only, not as a substitute for fitting content.

## Theme

Verify system-light and system-dark defaults with no saved choice; explicit saved choices overriding the system; toggle/reload persistence; system changes without a saved preference; and cross-tab storage updates. Test invalid and unavailable storage without crashing. Confirm the initial document theme and browser metadata agree with the rendered React control.

Inspect text and controls against their actual backgrounds in both themes. Pay special attention to QR/paper surfaces that intentionally remain light, receipt status colors, the checkout button, the scope banner, and the orange closing panel. Keep a single root theme attribute and the existing storage key.

## Interaction and completion

Exercise mobile menu open/close, link selection, Escape focus return, and resize to desktop. Check the theme button's accessible label, FAQ keyboard behavior, touch targets, and reduced-motion mode for changed UI.

For a review request, report reproducible findings before proposing unrelated changes. For a fix request, implement the scoped corrections and rerun the failing cases plus the frontend build. Finish with widths/themes exercised, checks passed, remaining issues, and any browser-verification limits; do not claim visual success from compilation alone.
