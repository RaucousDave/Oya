# Oya frontend design

## Purpose and current implementation

Oya connects stablecoin-holding customers with Nigerian merchants who price in naira. The visual identity should feel energetic, approachable, and credible: expressive Web3 artwork around a straightforward payment experience.

This guide captures the landing-page redesign and its light/dark themes. It is a baseline for future frontend work, not evidence that every screen or backend capability has shipped. Explicit product/design requests can evolve this baseline; update this guide when shared conventions change.

The current frontend is React + Vite, TypeScript, plain CSS, and Framer Motion. `src/main.tsx` renders `LandingPage` directly. Read [system-design.md](../../system-design.md) for architecture and product context, and inspect the code for what is actually implemented. shadcn, Tailwind, GSAP, and Three.js are not installed as part of this design.

## Visual direction

- Use warm neutral surfaces, ink typography, electric orange actions, and lilac supporting artwork. Dark mode uses warm charcoal rather than a blue-black recolor.
- Make the orange dimensional Oya hub the landing page's focal point. Orbiting stablecoins and the receipt tell the payment story; supporting sections are quieter.
- Use oversized, tightly tracked display headings with concise merchant-facing language. Keep explanatory copy readable and narrower than its container.
- Give content distinct structures: a split hero, currency strip, three sequential steps, dark benefits section, interactive checkout, scope notice, FAQ, and orange closing invitation.
- Product screens should carry the palette and typography forward while prioritizing amounts, statuses, and actions over decorative artwork.

## Color system

[tokens.css](src/styles/tokens.css) is the executable source of truth. Use semantic variables for text, surfaces, borders, and statuses; the table explains their roles.

| Role / token | Light | Dark |
| --- | --- | --- |
| Brand / `--primary` | `#ef5b2b` | `#ef5b2b` |
| Accent text / `--primary-deep` | `#c7441c` | `#ff9a73` |
| Canvas / `--canvas` | `#faf9f6` | `#171614` |
| Subtle surface / `--canvas-soft` | `#f1efea` | `#211f1c` |
| Warm surface / `--canvas-cream` | `#f0e8df` | `#302822` |
| Primary text / `--ink` | `#242321` | `#f4efe8` |
| Secondary text / `--ink-secondary` | `#766e64` | `#bcb2a6` |
| Border / `--hairline` | `#e7e1d8` | `#39342e` |
| Strong border / `--hairline-strong` | `#d4c9bc` | `#51483e` |
| Lilac / `--lavender` | `#e5ddf0` | `#332a40` |
| Success / `--success` | `#287a51` | `#86d9aa` |
| Success surface / `--success-soft` | `#e5f2e9` | `#213c2c` |
| Warning / `--warning` | `#966514` | `#f1cb7c` |
| Warning surface / `--warning-soft` | `#fff0d6` | `#43351e` |
| Error / `--danger` | `#b33838` | `#ff9b96` |

Some illustrations deliberately retain physical colors in dark mode: pale token faces, white QR backgrounds, and paper receipts with dark text. Pair their foreground/background explicitly. The closing orange panel also keeps its own contrast treatment. Check actual color pairs for readable contrast; a token name is not a contrast guarantee. Communicate statuses with text or icons as well as color.

## Typography and spacing

- **Space Grotesk** (`--font-display`): wordmark and headings, generally weights 500-700. The wordmark includes an orange northeast arrow.
- **DM Sans** (`--font-sans`): navigation, explanatory copy, controls, and amounts where appropriate. Fonts load in [index.html](index.html), with system fallbacks.
- Display headings scale with `clamp()` and negative tracking. On phones, fit the full word "possibilities" without clipping; avoid a fixed desktop minimum font size.
- Body copy generally uses 14-16px and a 1.7 line height. Existing small artwork labels are decorative; use readable sizes for newly added payment instructions and important disclosures.
- The spacing scale is 2, 4, 8, 12, 16, 24, 32, and 64px. Sections add generous breathing room; the content maximum is 1240px.
- Use modest radii (6-12px) on controls and illustrations, about 16px on checkout containers, and pills/circles for badges and token shapes. Shadows give the hero depth; ordinary content uses restrained borders.

## Components and interaction

| Pattern | Intent |
| --- | --- |
| Orange primary CTA | Main invitation into the demo; explicit action copy |
| Ink button | Checkout progression and orange-panel CTA; checkout uses a pale button in dark mode |
| Outline navigation CTA | Secondary invitation without competing with the hero |
| Theme button | 44px icon control with an accessible label describing the next theme |
| Step illustrations | Price entry, QR scan, and receipt in payment order |
| Checkout | Clearly labeled local simulation, with selectable token and payment outcome |
| FAQ | Native `details` / `summary`, keyboard-operable and expandable |
| Scope notice | Visible explanation of test tokens, fallback rate, and mocked payout |

Use links for navigation and buttons for state changes. Keep visible focus indicators, the skip link, and labeled selects. Mobile navigation closes after selecting a link, on Escape (returning focus to its button), and when resizing to desktop.

The sample checkout uses NGN 8,500 and an illustrative NGN 1,700/USD rate, giving 5.00 token units. The underpayment illustration receives 4.00 and resolves with a 1.00 top-up. `QrCode.tsx` draws an illustrative matrix, not a payment payload. Preserve the "do not send funds" label; production QR generation needs a real encoder and the backend's exact amount/network/address.

## Responsive layout

Read the cascade in order: [tokens.css](src/styles/tokens.css), [landing.css](src/styles/landing.css), then [adaptive.css](src/styles/adaptive.css). The last file contains the final theme and responsive overrides. Prefer editing the relevant rule over stacking another contradictory override.

| Width | Final design intent |
| --- | --- |
| 320-380px | Compact header, restrained type, wrapped actions, full-width checkout |
| Up to 760px | Mobile navigation; one-column content; proportional hero artwork |
| 761-1100px | Desktop navigation with tighter gaps; smaller hero type/art; two-column main sections |
| Above 1100px | Spacious split layouts and three-column steps |
| 1500px and above | Centered wide composition with capped content widths |

`landing.css` also contains a 1050px breakpoint; inspect its interaction with `adaptive.css` when changing tablet behavior. Use `minmax(0, 1fr)` and `min-width: 0` where content could expand grid tracks. The mobile hero scene uses a square aspect ratio and percentage sizing, so coins and the receipt scale with the available width. Keep decorative overflow separate from functional content; clipping the page is not a fix for an overflowing button or amount.

Touch targets should be at least 44px; checkout actions and selects use 48px minimum heights. Selects use 16px text to avoid mobile input zoom. Hover effects are optional decoration, not required interaction.

## Theme behavior

The theme is selected on `<html data-theme="light|dark">`. The bootstrap in `index.html` applies it before React renders; [ThemeToggle.tsx](src/components/ThemeToggle.tsx) maintains it afterwards. Keep both implementations consistent:

1. A valid `oya-theme` localStorage value wins.
2. Without a valid saved choice, follow `prefers-color-scheme` and subsequent system changes.
3. Toggling saves the explicit choice. Storage access failure must still allow the page and toggle to work.
4. Synchronize theme changes across tabs through storage events.
5. Keep CSS `color-scheme` and the browser `theme-color` metadata aligned with the active theme.

Use the existing attribute-based system when adding components rather than introducing a second theme state or provider.

## Motion

Framer Motion handles the entrance and keyed checkout transitions; CSS handles the floating hub, token motion, shimmer, underline, cursor, and QR scan. Typical reference timings are about 700ms for the hero entrance, 200ms for checkout transitions, and 6-8 seconds for ambient floating effects.

Keep movement concentrated in the payment illustration and state changes. Prefer transforms and opacity. When switching checkout states, preserve stable reading order and prevent departing/entering panels from overlapping (`AnimatePresence` with `mode="wait"`). Motion must not advance a payment state or imply real confirmation.

Preserve both `MotionConfig reducedMotion="user"` / `useReducedMotion` and the CSS `prefers-reduced-motion` fallback. The "Pause motion" control applies `.motion-paused` to stop repeating CSS animations. New ambient effects must honor that control, including any future JavaScript animation loops.

## Product language

Write for merchants and customers: "Set your price in naira", "Payment confirmed", and "Top up". Light Nigerian phrasing such as "crypto wahala" belongs in marketing copy; payment instructions should be precise. Use the naira symbol and token units consistently, and show the supported network near the payment details.

Distinguish the product vision from this frontend simulation and the testnet MVP. Production payouts are planned through a licensed off-ramp partner; the current demo does not pay real naira. Treat USDT/USDC as the product direction and identify the actual supported test token/network on payment screens. Confirmation follows required block confirmations; avoid guaranteed instant settlement claims. Flag wrong-network deposits only where detectable. Never invent live merchants, partner endorsements, or regulatory approval.

## Working with agents

The scoped [AGENTS.md](AGENTS.md) routes agents to project-local skills under `.agents/skills`. Start the agent in `apps/web` for tools that discover ancestor-local skills. Tools with different discovery rules can read the listed `SKILL.md` directly; no personal machine path or globally installed skill is required.

Example requests:

```text
Use $oya-frontend to build a payment-history screen consistent with apps/web/design.md.
Use $oya-motion to animate a new checkout status while preserving reduced-motion behavior.
Use $oya-responsive-theme to check the landing page on phones and in both themes.
```

For a tool without named skill support: "Read apps/web/.agents/skills/oya-frontend/SKILL.md and follow it for this task."

Use the scripts in `package.json` for development and validation. From the repository root, `pnpm --filter @oya/web dev` starts the frontend and `pnpm --filter @oya/web build` performs its TypeScript and production build checks. Install workspace dependencies from the repository root if needed. Keep verification proportional to the change; documentation-only edits need link/skill validation rather than an application rebuild.

For visual work, check 320, 375, 760, 761, 1024, and 1440px widths; both themes; keyboard navigation; reduced motion; and the exact-payment and underpayment/top-up demonstrations. Confirm no horizontal overflow, clipped controls, unreadable text, or theme flash. A successful build is not visual verification. Report unavailable browser tooling or untested interactions explicitly.
