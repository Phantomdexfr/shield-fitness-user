# DESIGN_TOKENS — Shield Fitness

Owner direction: **extremely premium, dark and gold.** No generic "AI" colours. **Forbidden anywhere (CSS, SVG, charts, images, gradients): purple, violet, indigo, magenta, pink, and any blue-to-purple gradient.** Phase 2 enforces this with a guard test (any colour literal outside `tokens.css`, or any hue in 250°–350° with saturation > 10%, fails).

All tokens live in `src/ui/styles/tokens.css` as CSS variables on `:root`. Components reference tokens only. Values below are the starting spec; Phase 2 may nudge them by eye but must keep the families.

## Surfaces (warm near-black, never blue-black)
| Token | Value | Use |
|---|---|---|
| `--bg-void` | `#070707` | app background, status bar area |
| `--bg-base` | `#0D0C0A` | page |
| `--bg-raised` | `#14120E` | cards |
| `--bg-card` | `#1A1711` | highlighted card / sheet |
| `--bg-hover` | `#24201A` | pressed / hover |
| `--line` | `#2E2A20` | hairlines |
| `--line-strong` | `#4A4332` | focus / emphasis borders |

## Text
`--text` `#F4EEDC` (ivory) · `--text-2` `#BDB49C` · `--text-muted` `#857D69` · `--text-on-gold` `#120F06`. Minimum contrast 4.5:1 for body, 3:1 for large text and icons (tested in Phase 2 with a contrast helper).

## Gold ramp (the accent)
`--gold-100 #F7EBC3` · `-200 #EBD58B` · `-300 #E0C06A` · **`-400 #D4AF37` (core)** · `-500 #B8922A` · `-600 #8F6F1E` · `-700 #6A5217`. Metallic effect = a subtle linear gradient between gold-300 and gold-500 at ~135° (gold only), plus `--glow-gold: 0 0 24px rgba(212,175,55,.22)`. Use gold sparingly: primary actions, active states, key numbers, the tier hero.

## Semantic (muted, never neon)
`--ok #7FB069` sage · `--warn #E0A03A` amber · `--danger #C8442F` brick · `--info #7FA6B8` steel. (No pink-reds: danger is brick/orange-red.)

## Tier colours (fixed; none purple)
| Tier | Value | Look |
|---|---|---|
| Bronze | `#B0713A` | copper |
| Silver | `#C0C4C8` | cool grey |
| Gold | `#D4AF37` | core gold |
| Platinum | `#E5E4E2` | pale platinum, slight shimmer |
| Diamond | `#9AD7E6` | ice cyan, faceted highlight |
| Shield Elite | black `#0A0A0A` with gold-300 border + glow | top tier crest |

## Chart series ramp (colour-blind aware, no purple)
1 `#D4AF37` gold · 2 `#F4EEDC` ivory · 3 `#7FA6B8` steel · 4 `#B0713A` copper · 5 `#7FB069` sage · 6 `#BDB49C` sand. Gridlines `--line`, axis text `--text-muted`. Fill under lines = series colour at 12–18% alpha.

## Shape, space, type, motion
- Radii: `--r-sm 8px`, `--r-md 14px`, `--r-lg 20px`, `--r-xl 28px`, `--r-pill 999px`.
- Spacing: 4 px base, `--sp-1 … --sp-10`. Touch target >= 44 px.
- Shadows: `--sh-card: 0 1px 0 rgba(255,255,255,.03) inset, 0 10px 30px rgba(0,0,0,.45)`; `--sh-press`: inset darker; `--glow-gold` as above.
- Type: UI = Inter variable (OFL), display/numerals for big stats = a refined serif or condensed display face (OFL, self-hosted, latin subset woff2; Phase 2 picks one and records it here). `font-variant-numeric: tabular-nums` for all numbers. Scale `--text-xs 12 / sm 14 / md 16 / lg 20 / xl 28 / 2xl 40 / 3xl 56`.
- Motion: `--ease-spring: cubic-bezier(.2,.9,.25,1.15)`, `--ease-out`, `--dur-fast 90ms`, `--dur-base 180ms`, `--dur-slow 320ms`. `prefers-reduced-motion` zeroes durations and disables count-up/draw-in.
- Backgrounds: flat near-black with a very faint warm vignette (`radial-gradient` gold at 4% alpha). No photos of people, no stock imagery. **Machine photos ARE used** (owner decision, reversing Phase 0): only on machine and exercise pages, as WebP thumbs/details from `public/machines/`, in a fixed-ratio frame with a dark vignette so they sit inside the gold look.
- Theme: dark is the product. A light theme is optional LATER; the token names are semantic so a light set can be added without touching components.

## Heat ramp (heatmap, recovery, 2D/3D body) — gold only, NO red/pink/purple
Bands 0-5 for muscle heat (`--heat-0 … --heat-5`): 0 = `--bg-card` surface with a hairline outline; 1 `#4A3B14`; 2 `#8F6F1E`; 3 `#D4AF37`; 4 `#EBD58B`; 5 `#F7EBC3` plus `--glow-gold`. Compare mode (two periods): gain = gold ramp, loss = steel `#7FA6B8` ramp (never red).
Recovery clock states: fatigued `#B0713A` copper, recovering `#E0A03A` amber, ready `#D4AF37` gold, fresh `#F4EEDC` ivory outline. Avoid-mark: hatched ivory stripes + `--danger` brick outline; sore-mark: amber hatch.

## Body Picker and hologram look (owner's prototypes are cyan: we re-colour them)
The two prototypes use cyan/orange. In the app they are re-themed: figure outline `--line-strong`, idle regions `--bg-raised`, hover/press `--gold-300`, selected primary `--heat-5` with glow, secondary `--heat-3`. The "hologram" feel is kept with gold scanlines (4% alpha), a soft gold base ellipse and slow flicker — all disabled by `prefers-reduced-motion`. **The cyan hologram palette must not be copied from the prototypes.**


## Phase 2 implementation notes (2026-11-19)
Tokens are in `src/ui/styles/tokens.css`. Fonts picked: **Inter Variable** (UI) and **Barlow Condensed 500/600/700** (display/numerals), self-hosted latin woff2. The general tier colours above are `--rank-*`; the muscle-badge set below is `--tier-*`. Loss ramp `--loss-1..5` (steel) was added for compare mode. Guard rules live in `tests/guard/`.

## Muscle tier badge colours (added 2026-11-19; tokens only, no purple/violet/magenta/pink)
`--tier-wood #7A5638` · `--tier-beginner #A39E93` · `--tier-bronze #B87333` · `--tier-silver #C3CAD3` · `--tier-gold #D4AF37` · `--tier-platinum #E6E8EA` · `--tier-diamond #8EC5E8` (ice blue) · `--tier-master #E0883A` (ember) · `--tier-olympian #F7EBC3` with a gold glow and laurel mark. Badges are crests (shield shape) with the tier name always written (never colour alone). Rusty muscles are desaturated with a small "rusty" tag. Reduced-motion: promotion is a static highlight.

> **Depth rule approved 2026-11-26 (Milestone 12, see `docs/UI_PREMIUM_PLAN.md`), implemented in Phase 96:** new depth tokens (shadow levels, top highlight, hero wash 18%, tile tint) are added to `tokens.css` only. Added in Phase 96 (premium CSS only; classic never reads them):
>
> | Token | Value | Use |
> |---|---|---|
> | `--sh-1` | two soft black layers (1px/2px and 2px/6px) | rows, chips |
> | `--sh-2` | two soft black layers (2px/4px and 8px/20px) | cards, tab bar |
> | `--sh-3` | two soft black layers (4px/8px and 16px/40px) | sheets, popovers |
> | `--hl-top` | inset 1px warm-white line at 6% | top highlight of a raised surface |
> | `--hero-wash` | gold 212,175,55 at 18% | the ONE hero wash per screen |
> | `--tile-tint` | gold 212,175,55 at 10% | tinted 32px icon tiles |
>
> Values live in `src/ui/styles/tokens.css` only; no hex outside it.
