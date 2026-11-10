---
name: oya-motion
description: Add or refine Oya frontend animation with Framer Motion and CSS, including checkout transitions, hero artwork, pause controls, and reduced-motion behavior.
---

# Animate Oya interactions

Read the Motion and Components sections of [the design guide](../../../design.md), then inspect the target component and relevant keyframes in `src/styles/landing.css` from the app root.

1. Classify the animation as entrance, user-driven transition, or repeating decoration. Name the event it communicates. Keep actual payment state independent of animation completion.
2. Use Framer Motion for React state transitions and CSS for the existing ambient artwork. Retain stable keys and `AnimatePresence` exit/entry sequencing where panels replace one another. Check that rapid clicks do not create stale or duplicated panels.
3. Favor opacity and transforms. Scale artwork within its container; verify transformed children remain legible and do not cover controls on small screens. Let payment content remain usable if animations are disabled.
4. Connect recurring animation to the existing pause control. Preserve both React and CSS reduced-motion handling. If adding a timer or JavaScript loop, clean it up and honor pause/reduced-motion rather than relying on CSS animation-play-state.
5. Inspect the changed effect on mobile and desktop, paused and running, with reduced motion enabled. For checkout work, exercise exact payment and underpayment/top-up transitions. Run the frontend build after code changes.

Completion means motion explains or supports the interaction, controls remain usable during transitions, and pause/reduced-motion behavior is verified. If browser tooling is unavailable, distinguish source/build checks from unverified animation behavior.
