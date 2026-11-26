# SETTINGS_MAP — structured sub-pages, never one long list

Owner rule: settings have **sub-pages**, plus **About** and **Credits** that he will fill in later. Built in Phases 62-63 (gym connection group completed in 46).

`/settings` shows ONLY a list of groups (icon, name, one-line current state, chevron). Each group is its own slug page `/settings/<group>` with a back header (`SubPageHeader`). Inside a group rows are simple (toggle, segmented, stepper, link); nothing expands in place.

| Group | Slug | Contains |
|---|---|---|
| **Account** | `account` | Profile name, sex (for the body figure), height, weight, birth year (all optional), fitness level; in connected mode: member code, change password, sign out, active devices |
| **Training** | `training` | Units (kg/lb), default rest seconds, default rep range, overload mode default (linear / double / off), intensity (Light/Moderate/Hard/Beast), weight step for custom exercises, track |
| **Workout flow** | `workout-flow` | Suggestions on/off, warm-up/cooldown suggestions, "suggested next" chip, ask why on skip, auto-fill from last time, keep screen awake, rest-timer sound/vibration |
| **Body and goals** | `body` | Heatmap defaults (period, sex/view), recovery clock on/off, avoid/sore marks (opens `/body/marks`), balance card, goals shortcuts, protein/water targets |
| **Appearance** | `appearance` | Theme (dark; light later), motion (full / reduced), haptics, density (comfortable/compact), 3D low-power mode |
| **Simple / Advanced** | `mode` | One switch: Simple (default) hides RPE, tags, supersets, overload details; Advanced shows them. A short, honest description of what changes |
| **Data and backup** | `data` | Export all data (file), import/restore, wipe with typed confirmation, storage used, "request persistent storage" status |
| **Privacy** | `privacy` | What is stored and where (all on device in standalone), progress photos never leave the device, clear photos, analytics: none |
| **Reminders** | `reminders` | Local workout reminders (days/time); push (connected, if enabled) |
| **Gym connection** | `gym` | Standalone / connected status; Add a gym (scan/paste/link); gym name, policy version, last sync; Disconnect |
| **About** | `about` | App name, version, build, what this app is, links; text from `src/content/about.json` (owner fills later) |
| **Credits** | `credits` | Pre-filled legal credits + the owner's own credits; text from `src/content/credits.json` |

## Gym-locked rows
When connected and a feature is locked by the gym (`contract/policy.md`), the row stays visible, disabled, with the note "Set by your gym". Never hide a locked row silently.

## About and Credits (owner fills later)
- `about.json`: `{ appName, tagline, version (auto), description[], links[{label,url}], contact{...}, legal[] }` — all optional; missing parts simply don't render. Initial state shows a neutral "Shield Fitness" card and a visible, tidy "Owner will add details here" line (a Claude session adds the content when the owner says so; **do not invent copy**).
- `credits.json`: `{ ownerCredits[], thirdParty[{name,licence,url,note}] }`. **Pre-filled `thirdParty`:** BodyParts3D (CC BY 4.0, with citation and the licence URL from the prototype), human-atlas (MIT, ashemag), threejs-vanilla-holographic-material idea (MIT, ektogamat), three.js (MIT), MuscleMap (MIT), Phosphor Icons (MIT), the chosen fonts (their licences), React-free runtime libs (Preact MIT, wouter MIT, idb ISC, etc. generated from `package.json` by a script in Phase 63).
- A test fails if `thirdParty` omits any library with attribution requirements that ships in the bundle.
- Layout: two compact fixed cards per entry, long names wrap, no truncation, no expand.

## Prefs plumbing
`usePref(key)` reads IndexedDB `prefs`; every pref has a default and, where relevant, a feature key; the Settings UI never writes outside `prefs`. Gym locks only override at read time (`resolveFeature`), they never edit the stored pref.


## Added 2026-11-18
- **Schedule** group: rest-day hints on/off, default missed-day behaviour (shift/skip), week starts on, deload scaling (Phase 32).
- **Training** group: "separate PRs per grip" toggle, default setup behaviour (remember last setup per exercise) (Phase 22/37).
- **Privacy** group: clear recent searches, clear cached barcode products (Phases 20, 56).
- **Intake** group: barcode scanner on/off (unless locked by the gym).
- **Privacy** group: explains what Share plan sends and never sends; "sender name" default for shares (Phase 42).
- **AI review** (under Training): intro prompt text and on/off, include options (notes, RPE, setups, PRs, muscle shares; bodyweight, name, body stats off by default), units (Phase 40).
- **Pocket tools** (under Workout flow): bar weights and plate inventory, warm-up ramp percentages and on/off, rest timer learning on/off, big-number mode (Phase 38).
- **Streaks** (under Training): weekly target, grace week on/off (Phase 53).
- **Equipment mode** default (Phase 19); **Form cues** reset dismissed cards (Phase 21).
- **Body and goals:** sex (male/female/prefer not to say) and bodyweight are required for **muscle badges** (Phase 47); "Muscle badges" page: show/hide, show rusty tags, show kg or x bodyweight.
