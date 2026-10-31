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

## Theme (Lumen: Day Foundry for the citizen app, Night Foundry for the consoles)
Channels live in `tokens.css` as `--c-*` (L C H) so Tailwind can apply alpha.

| Role | Day (citizen app) | Night (`data-theme="night"`, consoles) |
|---|---|---|
| paper / paper-2 / paper-3 | 97 / 94 / 90 % L, H265 | 13 / 17 / 22 % L, H265 |
| ink / ink-2 / ink-3 | 18 / 38 / 52 % L | 96 / 80 / 63 % L |
| rule | oklch(87% 0.012 265) | oklch(28% 0.018 265) |
| accent | deep indigo oklch(46% 0.24 268) | molten brass oklch(76% 0.17 50) |
| danger (SOS only) | oklch(52% 0.2 25) | oklch(65% 0.2 22) |
| warn (check-ins only) | oklch(66% 0.15 70) | oklch(86% 0.15 98), kept clear of brass |
| safe / focus | 56% H160 / indigo | 76% H160 / pale indigo |

Semantic colour is never decoration: red = SOS/incident, warn = pending check-in.

## Typography (two registers)
- Display + body: the platform system UI face (SF Pro / Roboto / Segoe), so the citizen app reads as a native app. Titles 700, sentence case, never italic.
- Labels: Geist Mono UPPERCASE (`.label`): chips, section headers, readouts. Every screen runs on the night theme (`data-theme="night"` on <html>), so the citizen app shares the ops console language.
- Numbers: tabular (`.tabular`).
- Loaded via `next/font/google` in `app/layout.tsx`.

## Signature
No decorative diagrams. The citizen home shows real readiness as four ops-style bordered tiles (voice, location, police, check-ins; location and check-ins are tappable). The police desk standby is a single pulsing dot.

## Components (`components/ui.tsx`, use these, don't restyle per page)
- `Row`: `LABEL ····· value` readout inside a `<dl>`; tone for state (danger, warn, muted…).
- `Chip`: mono UPPERCASE status pill with a dot; `live` pulses. Words carry meaning, colour reinforces.
- `Panel`: hairline card with a mono caption and an optional action.
- `LogLine`: transcript as a log: speaker/time column + line. No chat bubbles.
- `btn.primary` (accent, 17px semibold, 14px radius), `btn.outline` (hairline), `btn.danger` (SOS), `btn.quiet` (text).
- Segmented choices: hairline strip, selected cell inverted (ink on paper).
- Check-in: card with mono countdown and a hairline progress line; full-screen only in typed demo, a card above the SOS bar during calls.

## Flow
- Citizen home (ops language: night paper, bordered `card` panels, mono labels): title → mode filter strip + brass **Talk to Raksha** → "Safety status" 2×2 tiles. Hold-to-send SOS circle (2 s) docked at the bottom on every screen.
- During a call: headline → live transcript → call controls → status → I'm safe / End.
- Police desk: alerts | headline + live transcript | location, briefing, acknowledge.

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
