# UI_RULES — Shield Fitness (binding)

## The five owner rules
1. **Dark + gold, premium.** See `DESIGN_TOKENS.md`. No purple/violet/magenta/pink, ever.
2. **No truncation.** Never `text-overflow: ellipsis`, `line-clamp`, `-webkit-line-clamp`, fixed-height text boxes that clip, or "...". Text wraps; cards grow to fit in a grid with `align-items: stretch`; long lists scroll or page. A guard test greps CSS and class names.
3. **Sleek cards, NO expansion.** Cards are fixed in their look and never expand/collapse, accordion, "show more", or flip in place. Detail = a slug page or a bottom sheet. Cards show the whole message; if content is too long for a card, the card design is wrong, split it.
4. **Super interactive.** See below.
5. **Great graphs.** In-house SVG chart kit (`CHART_KIT.md`, User Phase 50 / Admin Phase 20).

## Interaction standards
- **Press:** every tappable thing reacts within one frame: scale 0.97 + background shift + (Android) 8 ms haptic tick. iOS has no vibration API: use visual feedback only; never rely on haptics.
- **Transitions:** page = shared slide/fade (180 ms, spring); sheets drag to dismiss; lists enter with a short stagger (max 8 items animated).
- **Numbers count up** on first reveal (stat tiles, XP, volume). Rings and lines draw in. One-time per view, never looping.
- **Charts:** touch-and-drag scrub with a value readout; a light haptic tick when the scrub snaps to a point.
- **Pull-to-refresh** on data pages (triggers sync).
- **Swipe:** swipe a set row to delete/duplicate; swipe between days on the plan; swipe back is the browser's.
- **Optimistic UI:** actions show immediately; sync happens behind the quiet chip.
- **Skeletons** for anything that could take > 150 ms; never spinners over blank screens.
- **Reduced motion:** honour `prefers-reduced-motion` (no count-up, no draw-in, no stagger, instant sheets).
- **Celebrations** (PR, tier up, goal) are short, gold, restrained; no confetti in rainbow colours.
- **Empty states** say what to do next, in one line, with one gold button.

## Layout
- Phone first, 360–430 px; works at 320. No horizontal page scroll. Safe-area insets honoured. Bottom tab bar for the member app (Home, Workout, Progress, Level, Me); admin uses a bottom bar on phones (Home, Members, Scan, Money, More) and a side rail on wide screens.
- One-handed logging: Steppers and primary actions in the lower half; the set logger never needs two hands.
- Min touch target 44 x 44 px; spacing >= 8 px between targets.
- Text sizes: body >= 16 px; never below 12 px.
- Icons: Phosphor (regular + fill), inlined SVG; no emoji, no icon font.
- Strings via `t('key')`, wrapping allowed to 3x length (Kannada/Hindi later).

## Accessibility
Contrast per tokens; visible gold focus ring on keyboard focus; `aria-label` on icon buttons; charts expose a text summary; no information by colour alone (tier = name + colour).

## Performance budgets (checked in User Phase 64 / Admin Phase 46) [A]
- First-load JS <= 180 KB gzip (shell + login); each route chunk <= 60 KB gzip; chart kit lazy-loaded.
- Time to interactive on a mid-range Android over 4G <= 3 s (owner-measured), instant on repeat opens (precached).
- 60 fps scrubbing and page transitions; list rendering virtualised past 100 rows; no layout thrash.
- IndexedDB reads for any page < 50 ms typical.

## Forbidden list (a test greps for the first four)
`text-overflow`, `line-clamp`, hue 250–350 colours, hex literals outside tokens, accordion/collapse components, emoji, stock photos, cyan hologram palette from the prototypes, `<marquee>`, autoplay audio, Google Fonts / any CDN at runtime.

## Added after the owner's second brief
- **Compact and calm.** One main action per screen, big type for the key number, small secondary text; no more than ~7 elements visible in a card. Complexity is reached by navigating deeper, never by expanding in place.
- **Simple / Advanced.** `simple_mode` (default ON) hides RPE, tags, supersets, intensity details and raw numbers behind Settings -> Training -> Advanced. Same data, fewer controls.
- **Nothing bleeds.** No element may overflow its container or the viewport: no horizontal scroll, no clipped buttons, no text running under the tab bar or the notch, no sheet content hidden behind the keyboard. Use `min-width: 0`, wrapping, `overflow-x: clip` on the root, safe-area padding, `dvh` units. **Overflow audit (User Phase 64, Admin Phase 32 and 46):** a Playwright script visits every registered route at 320, 360, 390, 414 and 430 px wide and fails if any element's `scrollWidth > clientWidth` (except designed scrollers) or any interactive element is smaller than 44 px or outside the viewport.
- **Settings are sub-pages** (a list of groups -> each group its own page), never one long unstructured list. See `docs/SETTINGS_MAP.md`.
- **Machine photos:** fixed aspect-ratio frame (4:3), `object-fit: cover`, thumbs in lists, detail on the page, lazy loaded, `alt` from the manifest, a gold-outline placeholder when a photo is missing. Photos never carry text overlays.
- **Body figure:** always paired with a text list (never colour alone); touch targets for tiny muscles are enlarged with an invisible 44 px hit area and a zoom button.
- **Fonts and libraries are bundled** (self-hosted woff2, vendored three.js); the app makes no CDN request at runtime.

> **Depth rule APPROVED 2026-11-26 (Milestone 12, see `docs/UI_PREMIUM_PLAN.md`), implemented in Phase 96.** Rules 2 to 5 above still hold. The "no shadow, no glow" wording is replaced for the Premium style only: soft layered shadows + a faint 1px top highlight and ONE gold hero wash per screen, gold-only, tokens only. Classic keeps the flat look. Written in full in Phase 96:
>
> **Depth rule (Premium style only; Classic keeps flat outlined boxes).** 1) Three elevations by token: `--sh-1` (rows, chips), `--sh-2` (cards, tab bar), `--sh-3` (sheets, popovers); each is two soft layers, never a hard or coloured shadow. 2) A faint warm 1px top highlight, `--hl-top`, may be added inside a raised surface. 3) ONE gold hero per screen: a radial wash at `--hero-wash` (18%) plus a thin gold gradient border; never two. 4) Icon tiles use `--tile-tint`. 5) Gold only: no coloured glow in any other hue, no hue 250-350, no shadow that reads as a neon edge. 6) All of it lives in `src/ui/styles/premium/*.css`, every rule scoped under `:root[data-ux-<key>='premium']`, tokens only (guard-tested by `tests/guard/premium.test.ts`). 7) Classic CSS is frozen: never edit an existing classic rule; add a premium-scoped rule instead. 8) Scrollbars on every scroller (page, sheets, drawers, horizontal rows, swipe strips) are the slim gold bar from `base.css`; a strip that hides its bar must say why, and Premium shows it unless the plan says otherwise. 9) Switching style never reloads the page (`data-ux-*` root attributes, set before first paint by `index.html`).
