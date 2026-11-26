# UI_PREMIUM_PLAN: Milestone 12 "Premium UI" (member app only)

Written 2026-11-26 from a planning session with the owner (his verdicts from the interactive preview, carried in `SHIELD_UI_MILESTONE_PLANNING_HANDOFF.md`). **Docs only, no app code was changed, nothing was built or run.** User app Phases 96-111. The Admin app is NOT touched; `contract/` is NOT touched.
Preview the owner looked at (his link, not checked here): https://claude.ai/artifact/6MbwgT1w9r82pRLoN9cBtR
Owner rules still hold: zero cost, dark and gold, offline-first, install gate, no store or food log, no hue 250-350 anywhere, no truncation CSS, colour literals only in `tokens.css`. UI and UX only: no backend, no SQL, no Edge Function redeploy.

## 0. Owner decisions
1. **The newly agreed UX becomes the DEFAULT ("Premium").** Everyone gets it, including existing installs that upgrade from 1.2.0.
2. **NOTHING from the present UI/UX is removed.** The 1.2.0 look and behaviour stays fully available as **Classic**. Every phase is "add the premium version beside the classic one, behind a switch", never "replace".
3. **Switchable in two places.** In Settings (Appearance -> Interface style) AND from the page where an upgrade is used (a small "View" sheet per page). Changes apply instantly, no reload.
4. **Depth rule APPROVED.** The old plan said no shadow and no glow. New rule: soft layered shadows + a faint 1px top highlight, and ONE gold hero wash per screen; still gold-only, tokens only. Prototype defaults: depth "soft", hero wash 18%, corner radius 14px, motion 1x. (`UI_RULES.md` and `DESIGN_TOKENS.md` carry a one-line pointer now; the full rewrite happens in Phase 96.)
5. **Today (D1) verdict recorded 2026-11-26 (Phase 109): build the proposal, with a liquid-gold Start button.** See section 2.3. Phase 110 is unblocked.
6. **Calendar sheet stays exactly as it is** (Month/Year dropdowns above the day grid, Clear and Done). The preview's Month/Year-chip calendar is DROPPED.

## 1. Problems found (evidence, 2026-11-26)
1. **Same outlined box everywhere.** Every card, row and group is the same flat raised box with a 1px line; lists are boxes inside boxes (box-in-a-box). No depth, no hierarchy.
2. **Only 21 icons exist and many are wrong.** History, Goals and Reminders all use a checkmark; Progress uses a dumbbell; Personal records a plus-square; Year in review a generic image; Settings an info icon; Food and water a plus; Muscle badges and Gym the same user-circle; Simple/Advanced a search icon.
3. **Controls look like a website.** 4-way segmented rows, a plain Toggle, checkbox-style chips, plain inputs, steppers for weight and reps.
4. **Almost no motion craft.** About 5 keyframes and zero `backdrop-filter` in the CSS; page change is one 8px fade-up for every direction.
5. **Solid tab bar.** No frosted layer, no moving active indicator, outline icons only.
6. **Every page title is the same fixed 28px**, no large-title collapse.
7. **Some screens are sparse, some crowded.** Train is nearly blank; Settings and Me are long flat lists.
8. **The Body figure is buried** under lists although it is the hero of that tab.

## 2. Verdicts from the preview

### 2.1 LOVE IT, build as shown
| Id | Item | Phase |
|---|---|---|
| A1 | Surfaces: 3 elevations; inset-grouped lists (one container, hairline dividers, no box per row; kills box-in-a-box) | 97 |
| A2 | Gold hero card: faint gold radial wash + thin gold gradient border; ONE per screen | 97 |
| A3 | Icons: about 80 Phosphor icons correctly mapped, in 32px tinted rounded tiles on Me/Settings | 98 |
| A4 | Tab bar: frosted (`backdrop-filter`, solid fallback), sliding gold indicator, filled icon when active, spring on tap | 99 |
| A5 | Headers: large title that collapses to a small frosted bar on scroll; back-button variant | 99 |
| B1 | Segmented: sliding gold thumb (4+ options becomes a value row that opens a sheet list) | 100 |
| B2 | Switch and chips: gold on state, spring thumb; ONE chip shape, selected = gold outline + wash, no OS checkbox glyph | 100 |
| B4 | Inputs: floating label, gold focus ring, search with Cancel | 100 |
| B6 | Action menu: one primary + a "..." popover (Add to go-tos, Never show, Got it do not show again) | 100 |
| B7 | Buttons: four kinds in default, pressed, disabled, loading | 100 |
| C1-C7 | Motion: directional push/pop; count-up and draw-in; set-complete; restrained gold PR moment (no confetti); gold skeleton shimmer; pull-to-refresh with the sync pill; press feedback (scale 0.97; Android 8 ms vibration, iPhone visual only) | 103 (push/pop), 104 (the rest) |
| D2 | Body: figure is the hero; tap a muscle opens a half-height sheet; Front/Back toggle; links in a compact row below. Use the REPO's real figures (the preview hand-drew one) | 106 |
| D4 | Exercise page: figure up top, one primary + "..." menu, unified tag chips, existing `Collapsible` bars, 4:3 photo frame with gold-outline placeholder | 106 |
| D5 | Progress: count-up hero numbers, proper 2-up grid (Streak tile aligned), scrubbable line chart | 106 |
| D6 | Me/Settings: grouped lists with icon tiles; new controls replace 4-way segmented rows | 105 |
| D7 | Library: inset-grouped list, filter chips, search with Cancel, machine photo thumbs | 105 |
| D8 | Train: next workout, routines, history preview, other ways to train (no longer blank) | 105 |
| D9 | Onboarding "About you": segmented with a real selected state, DOB/Height/Weight rows opening sheets | 108 |
| E | Launch polish: splash, app icon, gold text selection, status-bar colour, 8-point grid | 108 |

### 2.2 CHANGES the owner asked for
- **B3 Wheel picker:** weight is a wheel too (not only height, reps, rest seconds). Scroll-snap, tick feel, selected value in gold between two thin gold lines. (Phase 101)
- **D3 Workout logger:** wheels for BOTH weight and reps as the main input, replacing plus/minus steppers. Steppers stay as the Classic option. (Phase 107)
- **B5 Calendar:** KEEP the existing calendar sheet. Other sheet upgrades stay (fading scrim, spring up, grab handle, detents). (Phase 102)
- **Scrollbars:** page, sheets, drawers and horizontal rows must all match the theme (thin, gold-toned thumb, transparent/dark track). `base.css` already themes the global scrollbar, but some swipe strips hide theirs (for example `.sf-rcp__track` in `recap.css`) and sheets, drawers and horizontal rows were never audited. The audit is part of Phase 96.

### 2.3 D1 Today: VERDICT RECORDED (Phase 109, 2026-11-26)
Today verdict. Where today's 1.2.0 Today screen and the proposal differ, and what the owner decided (asked part by part; answers are the owner's own words in quotes).

| Part | 1.2.0 Today (Classic, stays as is) | Proposal | Owner verdict |
|---|---|---|---|
| 1 Top and hero card | Title "Today" + sync chip; one gold card: label, day name, 1-3 grey text lines, Start, then Swap day + Rest today | Small date label + sync pill; ONE hero card with a progress ring, "N exercises", big primary Start workout, Swap day + Rest today as smaller secondary buttons | **BUILD, with a change:** "as proposed, but make the Start button really very attractive, golden, liquid type". See 2.3.1 |
| 2 Week strip | Existing `WeekView strip` (Phase 86) | 7 equal cells, today in gold outline, done days with a gold dot | **BUILD as proposed** (restyle the existing strip; its logic is not touched) |
| 3 Next up | nothing | New block: first 3 exercises of today's workout, each with a small body figure of the muscle it trains | **ADD as proposed** (with the mini figure) |
| 4a Quick | Plain list of buttons (Share, Scan, History, Quick workout) | 2x2 grid of icon tiles | **BUILD as proposed** |
| 4b Empty state | Gold card, two buttons ("Make a routine", "Just start") | Gold figure, ONE line, ONE primary button; "Just start" a small text link | **BUILD as proposed** |

#### 2.3.1 The liquid-gold Start button (owner's wording: "really very attractive, golden liquid type")
Read as: a molten-gold metallic button, the single most eye-catching thing on Today. Premium only, only on the hero card's Start workout button. Tokens only (no new hex). Spec: a gold metal gradient (`--gold-metal` family, with a lighter highlight band across the top third and a darker lower edge) so it reads as a curved liquid-metal pill; the top inset highlight (`--hl-top`) and a soft gold outer glow from `--gold-wash`; a slow sheen that drifts across it (about 6 s per pass, a moving highlight, not a flashing one) only when the Motion setting AND the phone allow motion; on press it dips (scale .98) and the sheen jumps once; dark text with at least 4.5:1 contrast on every colour of the gradient; 56 px tall, full width, label "Start workout" (the existing string); with Motion Reduced it is the same gradient, static. Classic Start button is unchanged. [A-P109.1] Read "liquid" as the look (gradient, highlight, glow, drifting sheen), not as a physics effect (no blobs, no canvas, no WebGL), so it costs nothing in battery or bundle size. If the owner wants more or less shine after seeing it on a phone, that is a fix pack.

#### 2.3.2 What Phase 110 keeps unchanged (non-negotiable)
The plan engine and every rule behind the card: one notice slot, "Workout for today completed" (Phase 92b), the rest shift, "Log a past day", Welcome back, the missed-day sheet (SC3), the SC4 hint, the deload banner, the active / mobility / rest kinds. Phase 110 changes how they LOOK under `ux.layout`, never when they show.

### 2.4 Not shown in the preview (needs real design inside the phases)
Swipe-from-left-edge back (103); shared-element transition from library row to exercise page (103); sheets with finger-follow velocity, rubber-band and medium/large detents (102); swipe to delete/duplicate set rows (107); workout finish summary sheet (107); rest-timer docking animation (107); the full icon grid (98); true side-by-side Before/After (screenshots per phase, see section 4.4).

### 2.5 Not verified (standing gaps for the owner; every phase lists them, nobody claims them)
A real phone; iPhone Safari; vibration; frosted-blur cost on low-end Android; how the wheels feel under a thumb.

## 3. The Style System (the core design)

### 3.1 Settings -> Appearance -> "Interface style"
Master row (3-way segmented): **Premium (default)** / **Classic** / **Custom**.
- Premium = every switch below ON. Classic = every switch OFF = the exact 1.2.0 look and behaviour. Custom = shown automatically when the user mixes switches.
- Below it, a bordered group of independent switches (all ON under Premium), each with a one-line plain description:

| Key (pref) | Premium (ON) | Classic (OFF) |
|---|---|---|
| `ux.surfaces` | 3 elevations, shadows, inset-grouped lists, gold hero card | flat outlined boxes (today) |
| `ux.icons` | ~80 correct Phosphor icons + tinted tiles | the current 21-icon set and mapping (kept as is) |
| `ux.tabbar` | frosted bar, sliding gold indicator | solid bar with hairline |
| `ux.headers` | large title that collapses on scroll | fixed 28px title |
| `ux.controls` | sliding segmented thumb, new switch, unified chips, floating-label inputs | current segmented, Toggle, chips, inputs |
| `ux.wheels` | wheel pickers for weight, reps, height, rest | steppers and sheet rows (today) |
| `ux.sheets` | fading scrim, finger-follow, detents, rubber-band | current sheet |
| `ux.motion` | directional page transitions, swipe-back, count-up, draw-in, shimmer, PR moment | current 8px fade-up |
| `ux.layout` | Body figure-first, new Exercise/Progress/Train layouts | current page layouts |

The existing `Motion` (Full/Reduced) setting and `prefers-reduced-motion` ALWAYS win over `ux.motion`. The existing Appearance rows (Motion, Haptics, Density) stay as they are.

### 3.2 Switchable where it is used (not only in Settings)
Each page with a premium/classic difference gets a small "View" entry in its existing "..." menu or header: a bottom sheet with the switches relevant to THAT page. Minimum set:
- Workout logger: "Weight and reps input": **Wheels / Steppers** (`ux.wheels`).
- Body tab: "Layout": **Figure first / List first** (`ux.layout`).
- Exercise, Progress, Train, Library, Me: "Layout" and "Look" (`ux.layout`, `ux.surfaces`).
- Any number field that opens a wheel: a small "Use steppers instead" link in the sheet (`ux.wheels`).
- Appearance changes apply instantly with no reload.

### 3.3 How it must be built (so Classic is never lost)
- **Prefs:** one prefs row `appearance:ux` holding the nine switches + the master value (the existing prefs use dot keys such as `appearance.motion`; `ui:sections` is the colon precedent for a device-only row, and Phase 96 uses the key as named here). Default for EVERYONE, including existing installs, is **Premium**. Not part of the cloud backup (device-only, same as `ui:sections`), but included in the backup FILE.
- **Apply early:** set root attributes (`data-ux-surfaces="premium|classic"` and one per key) from `src/app/appearance.ts`, and ALSO from a tiny inline script in `index.html` that reads the saved value, so there is no flash of the wrong style on launch (Phase 96 decides where the inline script reads from, since IndexedDB is async: a one-line `localStorage` mirror of the switches is the simplest, recorded as an [A] in that phase). Follow how `data-motion` is applied today (`applyAppearance` in `src/app/appearance.ts`).
- **Classic CSS is frozen.** Do not edit existing rules; leave them untouched. All premium CSS goes in NEW files (`src/ui/styles/premium/*.css`) scoped under `:root[data-ux-<key]='premium'`. Components with different STRUCTURE (icons, wheel vs stepper, Body layout, header) read a hook `useUx('<key>')` and render the matching variant; the classic variant is the existing code path, left in place.
- **Tokens:** new depth tokens (shadow levels, top highlight, hero wash, tile tint) go in `tokens.css` ONLY (the only home for colour literals). Premium CSS references tokens only. `UI_RULES.md` and `DESIGN_TOKENS.md` get the full Depth rule in Phase 96.
- **Guard tests** (`tests/guard/`): (a) no hex outside tokens, no `text-overflow`/`line-clamp`, no hue 250-350 in the new CSS; (b) a classic-integrity test: with every switch OFF the classic selectors, classes and component paths still exist (Phase 96 writes the list, later phases append to it); (c) every `ux.*` key has a Settings row and a default.
- **Owner-visible proof per phase:** screenshots of the touched screens in BOTH styles at 390x844 and 360x800, saved OUTSIDE the project folder (screenshots are not kept in the zip, see Standing gaps in `PHASE_STATUS.md`).

### 3.4 Rules for every phase
Member app UI only. `contract/` untouched. No Edge Function redeploy, no SQL, no new dependency unless the phase says so. Phase order may be changed only if a dependency forces it, and the reason is logged. One phase per session, split NN-a / NN-b when bigger than it looks. Version stays 1.2.0 until the gate (Phase 111).

## 4. Phases (full entries with Goal, Depends, Key files, Do, Verify, Standing gaps, Owner check are in `PHASES.md`, Milestone 12)
| Phase | Type | Title | Scope |
|---|---|---|---|
| 96 | E | Style system + Depth foundation | `appearance:ux` prefs, root attributes + inline early-apply, Settings "Interface style" master row + switches (Premium default), depth/hero/tint tokens, scrollbar-theme audit, `UI_RULES`/`DESIGN_TOKENS` updated, guard tests for 3.3 |
| 97 | E | Surfaces and grouped lists | 3 elevations, inset-grouped `RowGroup` variant, gold hero card (`ux.surfaces`) |
| 98 | E | Icons | ~80 Phosphor icons, premium mapping beside the untouched classic one, 32px tinted tiles (`ux.icons`) |
| 99 | E | Tab bar and headers | frosted bar with solid fallback, sliding gold indicator, large-title collapse header + back variant (`ux.tabbar`, `ux.headers`) |
| 100 | E | Controls kit | sliding segmented, new switch, unified chips, floating-label inputs, search with Cancel, button states, "..." action menu (`ux.controls`) |
| 101 | E | Wheel picker | reusable wheel for weight, reps, height, rest; "Use steppers instead" (`ux.wheels`); calendar sheet untouched |
| 102 | E | Sheets | fading scrim, finger-follow with velocity, rubber-band, medium/large detents, keyboard-aware padding (`ux.sheets`); calendar sheet's Month/Year dropdowns untouched |
| 103 | E | Motion I: navigation | directional push/pop (View Transitions API with fallback), swipe-from-left-edge back, shared-element library row to exercise page (`ux.motion`) |
| 104 | E | Motion II: feedback | count-up/draw-in audit, set-complete check, gold PR moment, gold skeleton shimmer, pull-to-refresh + sync pill, press feedback rules |
| 105 | E | Screens I | Me and Settings (grouped + tiles), Library, Train (`ux.layout`) |
| 106 | E | Screens II | Body (figure first, real repo figures, half-height muscle sheet, compact links), Exercise page, Progress; each with an in-page "View" switch |
| 107 | E | Workout logger (pre-split 107-a / 107-b) | wheels for weight and reps, sticky exercise header, swipe to delete/duplicate set rows, rest-timer dock, finish summary sheet; "Wheels / Steppers" in the page's "View" sheet |
| 108 | E | Onboarding polish + launch polish | "About you" with real selected state and sheet rows; splash, app icon, theme/status-bar colour, gold text selection, 8-point grid |
| 109 | D | Today decision | DONE 2026-11-26: verdict recorded in 2.3 (build all parts; liquid-gold Start button) |
| 110 | E | Today | build exactly what 2.3 decided; empty state included; `ux.layout` switch. UNBLOCKED 2026-11-26 |
| 111 | G | GATE, release 1.3.0 | overflow audit in BOTH styles at 320/360/390/414/430, tap targets, a11y labels, guard tests, classic-integrity check, `docs/OWNER_CHECKLIST_1.3.0.md`, version 1.3.0 |

Order: 96 first (everything reads its switches), then 97-102 (kit), 103-104 (motion), 105-108 (screens), 109-110 (Today), 111. Dependencies are listed per phase.

### 4.1 Where every approved item lands
A1, A2 -> 97. A3 -> 98. A4, A5 -> 99. B1, B2, B4, B6, B7 -> 100. B3 -> 101. B5 and sheets -> 102. C1 (push/pop), swipe-back, shared element -> 103. C2-C7 -> 104. D6, D7, D8 -> 105. D2, D4, D5 -> 106. D3 -> 107. D9, E -> 108. D1 -> 109 then 110. Scrollbar audit -> 96 (fixes follow in the phase that touches the surface). Standing gaps and the owner checklist -> 111.

## 5. How to ship (unchanged, LAUNCH_STATUS section 6)
Member: edit, `git add -A`, `git commit`, `git push`, then GitHub > Actions > Deploy > Run workflow. No Edge Function redeploy and no SQL are expected for this milestone. The owner tests on a real phone after each phase, then the next phase. Talk rules from `LAUNCH_STATUS.md` section 1 apply: short, plain English, ONE step per message, PowerShell for commands, never ask for a secret.

## 6. Risks
- **Frosted blur (`backdrop-filter`) can be slow on low-end Android.** Every use has a solid fallback and sits behind `ux.tabbar` / `ux.headers` / `ux.sheets`; the owner can switch it off in one tap. Not measured here.
- **Double CSS weight.** Classic and premium CSS both ship. Keep premium files small and token-only; check the build size against the `UI_RULES.md` budgets at the gate.
- **Classic drifting out of date.** Later fixes might touch only the premium path. The classic-integrity guard test and the "Classic is frozen" rule exist to stop that; any bug fix to a shared component must be checked in both styles.
- **Wheels under a thumb.** Scroll-snap feel, tick feel and mis-taps cannot be judged without a real phone. "Use steppers instead" is always one tap away.
- **iPhone has no vibration API.** Press feedback is visual only on iOS; never rely on haptics.
- **Upgrade surprise.** Existing 1.2.0 users land on Premium by decision. The switch back to Classic must be easy to find (Settings -> Appearance, and the in-page "View" sheets).
- **Reduced motion.** `ux.motion` ON must still obey the Motion setting and `prefers-reduced-motion` (no count-up, no draw-in, instant sheets).
- **Size of the milestone.** 16 phases; the logger (107) is the largest and is pre-split.
