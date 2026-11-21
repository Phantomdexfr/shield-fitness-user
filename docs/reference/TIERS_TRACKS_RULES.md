# TIERS_TRACKS_RULES — defaults [A], editable as data (Admin Phase 41) and frozen with the engines

Two independent axes, as the owner asked:
- **Track** = the TYPE of training (what you do).
- **Tier** = the EARNED rank badge (how far you have come).
A member has one active track + an intensity dial, and a tier from XP.

## Tracks (7 core; more are just rows with `is_active`)
| Slug | Name | Rep range | Sets | Rest (s) | Notes |
|---|---|---|---|---|---|
| `beginner` | Beginner / Foundation | 10–15 | 2–3 | 60–90 | Full body 3x/week, machines first, default intensity Light |
| `intermediate` | Intermediate | 8–12 | 3–4 | 75–105 | Upper/lower or push-pull-legs 4x/week |
| `athlete` | Athlete / Performance | 3–8 + conditioning | 3–5 | 90–180 | Strength + power + conditioning blocks |
| `fat_loss` | Weight Loss / Fat Burn | 12–20 | 3 | 30–60 | Circuits, cardio finishers, higher frequency |
| `cardio` | Cardio / Endurance | time/distance | — | — | Zone-based sessions, treadmill/bike/elliptical/rower |
| `muscle_gain` | Muscle Gain / Hypertrophy | 6–12 | 4 | 90–120 | Volume focus, split by muscle |
| `strength` | Strength / Powerlifting | 3–6 | 4–5 | 150–240 | Low reps, linear progression default |
Inactive extras (config rows, later): Functional/Calisthenics, Senior/Low-impact, Rehab, Women-specific.

## Tiers
| Tier | Min XP | Perks (editable text, examples) |
|---|---|---|
| Bronze | 0 | Welcome |
| Silver | 500 | Priority support |
| Gold | 1500 | 1 guest pass / month |
| Platinum | 3500 | Free PT session / quarter |
| Diamond | 7000 | Renewal discount [owner sets] |
| Shield Elite | 12000 | Top crest, owner-defined perks |
Calibration: about 4 sessions/week earns roughly 250–300 XP/week -> Silver in ~2 weeks, Gold ~5 weeks, Platinum ~3 months, Diamond ~6 months, Shield Elite ~10 months. Thresholds are rows in `tiers`; admins edit them (monotonic increasing) in Admin Phase 41.

## XP rules (defaults)
| Event | XP | Limits |
|---|---|---|
| Gym check-in (QR) | 10 | once per gym day |
| Workout completed (>= 20 min or >= 3 exercises) | 30 | once per session, max 2 sessions/day count |
| Volume bonus | 1 per 1000 kg | max 20 per session |
| Personal record | 20 | max 3 per day |
| Weekly plan met (planned sessions done) | 50 | once per week |
| 7-day streak | 25 | once per streak milestone |
| 30-day streak | 150 | once per streak milestone |
| Goal achieved | 100 | per goal |
| Assessment completed | 25 | once |
| Admin grant / correction | any | needs reason; outside the daily cap |
**Daily cap (excluding admin grants and goal bonuses): 150 XP.** Enforced on device (`capDaily`) and by `sync-summary` [A6].
No decay at launch (SKIP). Tier never goes down except by admin override.

## Streaks
A streak day = a gym day (IST) with a check-in OR a completed workout. A single rest day is forgiven per 7 days ("rest token") [A]; two consecutive missed days reset.

## Track recommendation (assessment -> track)
Score per track from: goal (weight loss, muscle gain, strength, endurance, athletic performance, general fitness), experience level (never/<6 months/6–24 months/>2 years), days per week, injuries (injury flags downgrade intensity and exclude barbell-heavy picks). Rules in Admin Phase 41; output = ranked tracks with plain-words reasons; trainer/admin can override.

## Badges (~15 fixed, on/off in Admin Phase 41)
First workout · 7/30/100-day streak · 10/50/100 workouts · first PR · 10 PRs · first 100 kg total on a lift · protein target 7 days · water target 7 days · goal achieved · tier-ups. Names and icons defined in Admin Phase 41 (gold/ivory only).

**Standalone mode:** tracks are personal presets the user can pick or ignore; tiers/XP are OFF by default (feature `tiers`) and exist only when a gym turns them on.
