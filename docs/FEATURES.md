# FEATURES — USER APP (final scoped map)

Tick `[x]` when delivered (edit in place). **Scope:** MVP = in the numbered phases; LATER = flag exists, nothing built; SKIP = cut. **Mode:** SA = works standalone, CN = needs a gym connection. Feature keys are in `contract/features.catalogue.json`. Every feature has a switch.

## 1. Foundations
| ID | Feature | Phase | Mode |
|---|---|---|---|
| U-01 | [x] Install gate (iOS Safari/other, Android, in-app browser, desktop QR); nothing runs until installed (code done Phase 5; real-device install unverified until Phase 64) | 5 | SA |
| U-02 | [ ] Offline-first: shell, dataset, reads, writes, autosave per set | 5, 6 | SA |
| U-03 | [ ] Slug routes everywhere + 404 fallback + offline deep links | 4, 5 | SA |
| U-04 | [ ] Dark + gold premium UI, tokens only, no truncation, no expand cards, nothing bleeds | 2, 3, 64 | SA |
| U-05 | [ ] Feature switches for everything + gym locks (standalone defaults + hook point done in Phase 4; locks in 66) | 4, 66 | SA/CN |
| U-06 | [ ] Standalone mode: no login, no server, anyone can use | all | SA |
| U-07 | [ ] Simple / Advanced mode | 62 | SA |
| U-08 | [ ] i18n-ready strings (English at launch) | 12 | SA |

## 2. Dataset and library (634 exercises, 55 machines, 34 muscles)
| ID | Feature | Phase |
|---|---|---|
| L-01 | [ ] Compiled dataset, lazy chunks, offline search | 7-11 |
| L-02 | [ ] Library browse: exercises and machines, search-as-you-type, filters (muscle, equipment, category, kind, difficulty, track, unilateral, beginner-friendly, injury-safe) | 19 |  <!-- Phase 19 delivered: /library tabs, search, category/sub chips, kind, difficulty, machine, unilateral, beginner filters, recents. Still open: muscle, track and injury-safe filters in the library (muscle and track exist in the Muscle Lab) -->
| L-03 | [x] Exercise page per slug: muscles on a mini body, machine, variations, easier/harder, cues, cautions, history, **YouTube link** | 21 |
| L-04 | [ ] Machine page per slug: photos (thumb + detail), status, muscles, exercises on it | 21 |
| L-05 | [x] Favourites, "never show", personal notes, my go-tos | 26 |
| L-06 | [ ] Variations as first-class: pick a variation, it changes the logged muscles | 21, 38, 43 |
| L-08 | [ ] **Setup options:** grips, widths, handles, positions, benches per exercise; changes logged muscles; reverse modes linked | 8, 10, 13, 22 |
| L-09 | [x] **Fuzzy search** (typos, aliases, setup words, machines, muscles) | 8, 20 |
| L-07 | [ ] Custom exercises: tap muscles on the body, pick machine/none, rep range, YouTube link; counted in suggestions and heatmap | 27 (creator, edit, delete, search, suggestions done; heatmap joins in 43) |

## 3. Body tools (2D Muscle Lab + heatmap)
| ID | Feature | Phase |
|---|---|---|
| B-01 | [x] Body Picker component (male/female, front/back, pick/heat/recovery/marks/view modes, text twin) | 16, 17 |
| B-02 | [x] **Muscle Lab:** tap a muscle -> Suggested for you, then Built for you (priority), then More (shuffled), + "Surprise me" + filters | 18 |
| B-03 | [x] "Muscles worked": pick an exercise or machine, see primary/secondary on the body | 18 |
| B-07 | [x] **Machine Lab map:** what each machine can reach, filter by bench/attachment/position, modes | 23 |
| B-04 | [ ] **Heatmap** by day / week / month / custom range / all time, gold bands, tap a muscle for why, compare two periods, neglected muscles, balance card | 43, 44, 49 (the balance card is on `/body/recovery`, not on the heatmap page, so left unticked) |
| B-05 | [x] Recovery clock (fatigued / recovering / ready / fresh) | 48, 49 |
| B-06 | [x] Avoid / sore marks that filter suggestions and swaps | 48, 49 |

## 4. Routines and sessions (super flexible)
| ID | Feature | Phase |
|---|---|---|
| R-01 | [x] **Routine builder:** 2-7 days or flexible, optional weekdays, split styles (PPL, upper/lower, full body, bro, custom), rename/retarget/reorder days, own + library exercises, several routines, one active | 30, 31 |
| R-13 | [x] **Flexible schedule:** any days, any split label, weekdays / cycle (T/A/M/R) / every N days / let recovery decide / A-B weeks / deload; missed-day shift or skip | 29, 32 |
| R-14 | [x] Rest-day hints from the recovery clock (on by default, never blocks) | 32, 49 (connected in 49; the hint card itself was not seen on screen) |
| R-15 | [ ] Three-metric PRs (weight, reps, volume) + PR board. Engine and board page done in 37; the toast line is ready (`prToastText`) but shown only once the logger (38) and summary (39) exist | 37, 38, 39 |
| R-16 | [x] **Share plan** by QR / link / typed code: encrypted, 3-minute, single-use, deleted on receipt; preview before adding | 41, 42 |
| R-02 | [x] Week view with rest-day hint and planned volume per muscle | 31 |
| R-03 | [x] **Day builder:** muscles or split label + time box (30/45/60) -> warm-up, compounds, isolation, finisher, cooldown | 33 |
| R-04 | [ ] Suggested day (what's recovered), choosable workout forms | 31, 33, 49 (Today card uses the clock; the Train page's Suggested badge still follows the rotation pointer, so left unticked) |
| R-05 | [x] **Flexible session:** all items as cards, any order, add on the fly, skip, later shelf, finish anytime, resume after kill | 34 |
| R-06 | [x] **Skip -> smart alternatives:** reasons (busy, pain, no time, too hard), same-variation family first, then same muscle; never auto-swap | 35 |
| R-07 | [x] "Machine busy for this session" | 35 |  <!-- Phase 35: hides the machine in alternatives only; the add sheet and the session menu do not use it yet -->
| R-08 | [x] Set logger: weight/reps (RPE, tags in Advanced), auto-fill, rest timer, supersets, cardio rows | 38 |
| R-09 | [ ] Progressive overload suggestions (linear / double / off), 1RM, PR detection, plateau/deload hints, intensity dial | 36, 38 |
| R-10 | [x] Session summary, history calendar, repeat a session, PR board | 39 |
| R-11 | [ ] Warm-up and cooldown suggestions matched to the day | 33 |
| R-12 | [ ] Superset suggestions from the pairs data | 31, 33 |

## 5. Progress
| ID | Feature | Phase |
|---|---|---|
| P-01 | [x] Chart kit: line/area/bar/stacked/ring/heat grid/stat tile with touch scrub | 50-52 |  <!-- Phase 50: spec done (docs/design/CHART_KIT.md); Phase 51: line, area, bar, sparkline built; Phase 52: ring, gauge, heat grid, stat tile, stacked bar built (no real page uses them until Phase 53) -->
| P-02 | [x] Per-exercise progress (weight, reps, e1RM), weekly volume, consistency grid | 53 |
| P-03 | [x] Body stats (weight, body fat, measurements, BMI) + goals | 54 |
| P-04 | [x] Protein + water quick-add with rings (generic typed log) | 55 |
| P-06 | [x] **Barcode scanner:** scan packaged food, see nutrition card, optional "add protein"; no food log, no AI recognition | 56, 57 |
| P-05 | [x] Progress photos (device only) with side-by-side compare | 55 |

## 6. Body Holo Lab (3D atlas)
| ID | Feature | Phase |
|---|---|---|
| H-01 | [x] 3D hologram, tap/list select, daily-life role of each muscle (and when it is weak/tight) | 58-60 |
| H-02 | [x] Lazy load, low-power mode, WebGL fallback to 2D, vendored three.js | 60 |
| H-03 | [x] The 5 fitted (approximate) muscles flagged in 3D; 2D fallback for units without a drawn region is text-only (spec frozen in 58) | 60 |

## 7. Settings, About, Credits
| ID | Feature | Phase |
|---|---|---|
| S-01 | [x] (62: six groups; 63: data, privacy, reminders, gym, about, credits) Settings as sub-pages (Account, Training, Workout flow, Body and goals, Appearance, Simple/Advanced, Data and backup, Privacy, Reminders, Gym connection, About, Credits) | 62, 63 |
| S-02 | [x] Export / import / wipe data | 63 |
| S-03 | [x] About + Credits driven by editable JSON, licences pre-filled | 63 |
| S-04 | [~] Local workout reminders (saved choice only, nothing fires yet) | 63 |

## 8. Gym connection (CN)
| ID | Feature | Phase |
|---|---|---|
| G-01 | [x] (67: connect and disconnect built; never run on a real gym) Add a gym by QR / link / paste, confirm host, disconnect | 65, 66 (paste, QR and link up to the confirm screen done in 66; connect and disconnect in 67) |
| G-02 | [ ] (66: wired; 69 did not change or re-test it) Policy locks/defaults, library overrides, machine status | 66, 69 |
| G-03 | [x] (67: against a fake remote only; offline session restore relies on the Supabase client's stored session) Login (admin-issued), forced password change, offline session | 67 |
| G-04 | [x] (67: push and policy pull; personal-table pull not built) Sync engine + chip | 67 |
| G-05 | [ ] Membership card (offline QR), days left, payments list | 68 | (card, days left and QR built in 68; the payments list was not)
| G-06 | [x] Attendance calendar/streak, announcements/inbox, requests | 68 |
| G-07 | [x] (69: follow, copy, ignore, ended built; the "Not available" tag + Swap on a hidden item is not; never run on a real gym) Gym programs as a routine source (follow/copy/ignore) | 69 |
| G-08 | [x] (69: fake store and fake push only; never run on a real gym) Propose a custom exercise to the gym; upload history once | 69 |
| G-09 | [ ] Tiers / XP / tracks from the gym (feature `tiers`) | 69 |
| G-10 | [ ] Push notifications | LATER |

## 9. Convenience and delight (added 2026-11-18)
| ID | Feature | Phase |
|---|---|---|
| X-01 | [x] **Copy for AI review:** session, past session, date range, single-exercise trend as plain text | 40 |
| X-02 | [x] **Movement map:** geometric start/end pose diagram per exercise, joint angles, muscles | 24, 25 |
| X-03 | [x] Today card on Home | 32 |
| X-04 | [x] Why-this-exercise chips (rendered in 18; only the reasons that need no session history are produced so far) | 15, 18 |
| X-05 | [x] Machine finder by muscle (built in 18; ticks when Phase 23 finishes the reach filters) | 18, 23 |
| X-06 | [ ] Equipment mode (hotel / home / minimal) | 19 |  <!-- Phase 19: preset switch + filtering in the library only; suggestions, day builder and swaps still to wire in their phases -->
| X-07 | [x] Form cue card | 21 |
| X-08 | [x] Workout in a pinch + superset swipe | 33 |
| X-09 | [x] Plate calculator, warm-up ramp, smart rest timer, big-number mode, last-time inline | 38 |
| X-10 | [x] PR celebration + PR wall | 39 |
| X-11 | [x] Weak-spot finder | 44 |
| X-12 | [x] Streaks + consistency ring | 53 |
| X-13 | [x] Year-in-review, muscle of the week, routine image | 61 |
| X-14 | [x] **Muscle badges:** Wood to Olympian per muscle, bodyweight-relative (allometric) strength tiers, profile page | 45, 46, 47 |

## 10. Backup and recovery (Milestone 10, spec frozen in Phase 74; nothing built yet)
Spec: `docs/SYNC_SPEC.md` PHASE 74 SPEC, `docs/GYM_CONNECTION.md` PHASE 74 SPEC. Catalogue keys (contract 1.1.0): `cloud_backup`, `free_account`, `auto_restore`.
| ID | Feature | Phase |
|---|---|---|
| K-01 | [x] (73: restore button for a gym member from the existing delta pull; never run on a real Supabase) Restore safety net: empty or shrunk phone is never pushed over a good copy | 73 |
| K-02 | [x] (75: pure engine + local build/apply, fixtures and fake IndexedDB only; no server) Chunk engine: IST-month chunks, compact encoding, gzip, hash, merge, three-way plan (`cloud_backup`) | 75 |
| K-03 | [x] (76: dirty set, triggers, push, resumable restore, chip and Data status line; proven on fake remote and fake fetch only, started only for a gym-connected member; the free-account mode is 78) Backup runtime: dirty set, triggers, push, status line (`cloud_backup`) | 76 |
| K-04 | [x] New-device automatic restore for a gym member (`auto_restore`) | 77 |
| K-05 | [x] (78: R1 home, R2 consent, R4 show-once password, R5 sign in, R11 delete, first backup, reinstall restore; fake server only; recovery questions are 79) Free backup account: consent, show-once password, sign in, delete (`free_account`) | 78 |
| K-06 | [x] (79: R3 recovery questions, R7 forgot, R8 status + cancel, R9 new password; fake server only, prompts are placeholders) Recovery questions and forgot-password flow (`free_account`) | 79 |
| K-07 | [x] (80: ordered free to gym move, R10 switch, R12 block; fake ports only) Free to gym transition and Switch to free backup | 80 |

## Skipped / Later
**Cut:** store/retail, food database, food log, AI/photo food recognition, sleep/steps/mood, machine photo upload in the app, wearables, geofence check-in, share cards, leaderboards, challenges, strength standards.
**Later (flag or hook exists):** classes/PT booking, Kannada/Hindi, extra muscle detail (neck/serratus on the 2D figure), exercise video hosting, calories/supplements via the typed intake log, push.

- Phase 87 (UX, no new feature id): collapsible sections on the long pages (Exercise, Machines, Library, Body, Recovery, Marks, Heatmap, Progress, Goals, Settings, Backup); settings rows with 4+ options open a sheet list.
- Phase 86 (UX, no new feature id): Today, Train, Routines, Routine week and day, Quick workout, Session, Session summary and History declutter with collapsible sections; Today shows a week strip and a Quick grid.
- Phase 85 (UX, no new feature id): first-run `/welcome` onboarding (name, date of birth, sex + figure, height, weight, units, level, backup choice, optional gym), re-runnable from Settings -> Account.
- Phase 84 (UX, no new feature id): every date is chosen on one calendar picker; no native or typed date field remains (guard test `tests/ui/datePicker.test.tsx`).

## Milestone 12 "Premium UI" feature ids (planned 2026-11-26, all unticked; plan: `docs/UI_PREMIUM_PLAN.md`)
| ID | Feature | Phase | Mode |
|---|---|---|---|
| U-UX-01 | [x] Interface style master (Premium default / Classic / Custom) + `appearance:ux` prefs, early apply, Settings switches, Depth tokens, scrollbar audit | 96 | SA |
| U-UX-02 | [x] `ux.surfaces`: 3 elevations, inset-grouped lists, gold hero card | 97 | SA |
| U-UX-03 | [x] `ux.icons`: ~80 correct Phosphor icons + tinted tiles (classic 21-icon set kept) | 98 | SA |
| U-UX-04 | [x] `ux.tabbar` frosted bar with sliding indicator and `ux.headers` large-title collapse | 99 | SA |
| U-UX-05 | [x] `ux.controls`: sliding segmented, switch, unified chips, floating-label inputs, search with Cancel, button states, "..." action menu | 100 | SA |
| U-UX-06 | [x] `ux.wheels`: wheel picker for weight, reps, height, rest (+ "Use steppers instead"; logger Wheels/Steppers switch) | 101, 107 | SA | (101 done: wheel, height and rest rows; weight and reps in the logger: 107-a)
| U-UX-07 | [x] `ux.sheets`: fading scrim, finger-follow, rubber-band, detents (calendar sheet unchanged) | 102 | SA |
| U-UX-08 | [x] `ux.motion`: directional page transitions, swipe-back, shared element, count-up, draw-in, shimmer, PR moment, pull-to-refresh | 103, 104 | SA | (103 done: push / pop slide, shared title, back swipe; 104 done: count-up and draw-in once per view, set tick, PR mark, gold skeleton, pull-to-refresh on Today and Progress, press feedback)
| U-UX-09 | [x] `ux.layout`: figure-first Body, new Exercise / Progress / Train / Me / Library layouts, Today (after the owner's verdict) with per-page "View" switches | 105, 106, 107, 108, 110 | SA |
| U-UX-10 | [x] Classic style kept and provably intact (classic-integrity guard test; release 1.3.0 gate) | 96, 111 | SA |
| U-UX-11 | [x] `ux.tidy` "Tidy layout": tenth, separate, default-ON switch (one-line sub-page header, compact figure controls, Library controls, no repeated labels, equal stat tiles, Appearance rows only under Custom, tab bar marker, caption contrast) | 113 | SA |
| U-UX-12 | [x] Plan day picker (this week only), Body collapsible list + link chips, slidable chip rows, wheel tap-to-arm, logged() buzz, Train logger choice, History Change date | 114 | SA |
