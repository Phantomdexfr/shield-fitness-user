# MASTERPLAN — User app

## Product in one paragraph
A flexible, offline, premium dark-and-gold workout PWA built on a real dataset (634 exercises, 55 machines with photos, 34 muscles). Tap a body to find or build training; build routines of any length; run sessions in any order; see heatmaps for any period; skip an exercise and get same-variation alternatives; add your own exercises; read what each muscle does in daily life in a 3D atlas. Works standalone for anyone; optionally connects to a gym (QR / link / code) for membership, check-in QR, announcements, gym programs and admin locks, with no code change.

## Principles
1. **Standalone first.** Every feature works with no server; connection only adds.
2. **Zero cost.** GitHub Pages / Vercel static hosting; no paid service; gym backend (Admin zip) uses free Supabase tiers.
3. **Offline first.** Device is the first database; nothing lost mid-workout.
4. **Flexible.** Nothing forces an order, a split or a day count. Suggestions suggest; the user decides.
5. **Compact and calm.** Nothing bleeds, nothing truncates, no expand/collapse cards, tokens only, gold on dark. No purple/violet/magenta/pink.
6. **Pure core.** Engines in `src/shared`, specified in `contract/engines.md`, fixture-tested.
7. **Honest.** Educational content, not medical advice; unknown things are said plainly; owner data is never invented.

## Modes
| | Standalone | Connected |
|---|---|---|
| Login | none | admin-issued credentials |
| Data | device (backup file) | device + gym sync |
| Policy | all features user-controlled | gym locks/defaults overlay |
| Extras | — | membership, QR, attendance, inbox, requests, programs, tiers |

## Milestones (see PHASES.md)
M1 Foundation (1-6) · M2 Dataset + pure core (7-15) · M3 Body picker, library, exercises (16-27) · M4 Routines + sessions (28-39) · M5 Heatmap, recovery, progress (43-55) · M6 Holo Atlas (58-60) · M7 Settings/About/Credits + gate 0.1.0 (62-64) · M8 Connect + gate 0.2.0 (65-70) · M9 1.0.0 + fix pack (71-72).

## Release line
0.1.0 = complete standalone app (Phase 64). 0.2.0 = connected (Phase 70, needs Admin 9-18 deployed). 1.0.0 = Phase 71 after owner device checklists.

## Risks (tracked in PHASE_STATUS)
Unverified dependency installs; iOS storage eviction; 3D on low-end phones; BodyParts3D licence; two zips drifting (mitigated by `contract/CHECKSUMS.txt`).

## Additions (2026-11-18)
Setup options (grips/handles/positions/benches), fuzzy search, Machine Lab map, flexible schedule and rest days, three-metric PRs, barcode scanner (no food log, no AI recognition). See `PHASES.md` lettered phases 8-57.

Share plan by QR/link/code (encrypted, 3-minute, single-use relay): Phases 41-42, `docs/PLAN_SHARE.md`.

## Additions (2026-11-18, later)
Movement Map (geometric exercise diagrams), Copy for AI review (session / range / exercise), and a set of convenience features (Today card, why chips, plate calculator, warm-up ramp, smart rest, big-number mode, quick workout, equipment mode, weak spots, streaks, PR celebration, recaps). See `docs/MOVEMENT_MAP.md`, `docs/AI_REVIEW_EXPORT.md`, `docs/EXTRAS.md`.

## Additions (2026-11-19)
Per-muscle strength badges (Wood to Olympian), bodyweight-relative with allometric scaling: `docs/MUSCLE_BADGES.md`, Phases 45-47.
