---
name: oya-frontend
description: Build or update Oya frontend pages and components using the project's visual identity, CSS structure, and payment-demo boundaries. Use for frontend implementation, not backend payment processing.
---

# Implement Oya UI

Read [the design guide](../../../design.md) for the visual direction and component conventions. Resolve paths relative to this skill or the app root, not the agent's starting directory.

1. Inspect `apps/web/src/main.tsx`, the target page/component, its imported styles, and the app's package scripts. Confirm which screen and interaction the user wants. The current entry point renders the landing page directly; a new route may require explicit routing work.
2. Identify the relevant existing pattern: heading, action, payment amount, status, illustration, or checkout surface. Use semantic color tokens and the existing theme system. Scope new product-screen styles to their components so landing-page selectors do not accidentally control them.
3. Implement the requested behavior with the installed React/CSS stack. Prefer existing Framer Motion for animation when needed. Introduce another UI or animation library only when the requested work justifies it; document the dependency and integration choice.
4. Preserve the guide's demo boundaries in customer-facing copy. Keep local simulated state separate from real API/payment state. Real money amounts should come from validated integer/decimal-string data; decorative samples must stay identified as samples.
5. Run the relevant app checks and exercise changed interactions. For visible changes, use the design guide's viewport/theme checks. Report the changed files, observed behavior, validation results, and any unverified browser behavior.

Completion means the requested UI works in its intended flow, carries Oya's visual conventions into both themes, and has evidence appropriate to the change. Updating documentation does not authorize committing, pushing, or publishing.
