# Design — Raksha

A locked design system for this app. Every page redesign reads this file before
emitting code. Extend or amend it when the system needs to grow; don't override per page.

## Genre
atmospheric, two-mode: **Day** (woman's app, calm, protective) and **Night**
(police desk + ops console, urgent, technical). Same roles, inverted ground.

## Macrostructure family
- Citizen app (`/`): single-column phone task flow: status header · one primary action ·
  preparedness list · sticky SOS slab. Portrait only.
- Consoles (`/police`, `/ops`): three-pane workbench: list · live transcript (largest) · details/actions.
  Locks to one viewport from tablet width up; stacks on phones.

## Theme (custom: "calm protection by day, night-watch console")
Channels live in `tokens.css` as `--c-*` (L C H) so Tailwind can apply alpha.

| Role | Day | Night |
|---|---|---|
| paper | oklch(97.5% 0.008 150) | oklch(17% 0.02 250) |
| paper-2 / paper-3 | 94.5% / 90.5% | 21% / 26.5% |
| ink / ink-2 / ink-3 | 24% / 40% / 53% (H160) | 95% / 80% / 64% (H250) |
| rule | oklch(86% 0.016 155) | oklch(31% 0.024 250) |
| accent (brand forest) | oklch(38% 0.07 165) | oklch(80% 0.11 165) |
| danger (SOS only) | oklch(50% 0.19 25) | oklch(64% 0.2 25) |
| warn (check-ins only) | oklch(70% 0.15 70) | oklch(80% 0.14 75) |
| safe | oklch(58% 0.13 155) | oklch(74% 0.13 155) |
| focus | oklch(55% 0.17 255) | oklch(72% 0.14 255) |

Night applies via `data-theme="night"` on the console root.
**Semantic colour is never decoration:** red means SOS/incident, amber means a pending check-in.

## Typography
- Display: Bricolage Grotesque 700, roman, tracking -0.02em (headings, wordmark, SOS label)
- Body: Geist 400/500
- Mono: Geist Mono (timestamps, coordinates, phone numbers, states)
- Loaded via `next/font/google` in `app/layout.tsx`; tokens map `--font-display/body/mono`.

## Spacing / radius
4-pt scale (`--space-*`). Radius: card 20px, input 12px, pill 999px.

## Motion
- Easings `--ease-out` cubic-bezier(0.16,1,0.3,1); durations 160–240ms; transform/opacity/colour only.
- Live indicators may pulse; nothing else loops. Reduced motion collapses to ≤120ms.

## Microinteractions stance
- Silent success; no celebratory toasts. Errors are inline `role="alert"` with a next step.
- SOS never sits behind a confirmation. Check-in sheet focuses two large choices.

## CTA voice
- Primary: filled accent, card-radius tile or pill, verb-first ("Talk to Raksha", "Sign in").
- Danger: filled danger slab, always reachable ("SOS · Alert police").
- Secondary: outline pill or text button.

## What pages MUST share
Wordmark, tokens, type trio, CTA voice, the demo strip ("DEMO · Police alerts reach a consenting stand-in").

## Honesty rules
No invented metrics, no fake device data (battery removed), no "help is on the way" copy.
Sample location/profile is labelled "sample" wherever it appears on screen.

## Exports
### tokens.css
See `tokens.css` at the project root (single source; Tailwind colours resolve to it in `tailwind.config.cjs`).
