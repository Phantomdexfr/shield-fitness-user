# MACHINE DATA NOTES - Shield Fitness

Status: Stages 1-5 all delivered. **Input gap:** `shield-fitness_phase0_docs.zip` was NOT in the upload (only the image zip arrived). So `seed/machines.template.csv`, `seed/exercises.template.csv`, `TIERS_TRACKS_RULES.md`, `PROGRESSIVE_OVERLOAD_RULES.md` and FEATURES B6/B7 were never read. CSV headers were taken from the task brief. The draft weekly plans are NOT checked against TIERS_TRACKS_RULES.md; re-check them when the docs are available.

## How things were identified
- 80 JPGs in 41 folders (121 zip entries incl. folders). Built 7 labelled contact sheets (12 thumbnails each), reviewed all, and opened full size only folders 08 and 29, plus 6 machines for logo checks.
- Folders 30, 32, 33, 35 and 40 each hold several different items, so they were split into separate rows. Folders 28 and 39 hold several angles or models of one thing.
- Folder 24 ("Flies machine (fan)") contains the byte-identical file of folder 04 (Pec deck). Folder 33 battle-rope photos are byte-identical to folder 39. Duplicates were kept once.
- Brand "Jerai Fitness" is filled only where the logo is legible on the machine in the image. Blank = not legible (leg press, hip thrust, hack squat, elliptical, cable attachments, barbell, EZ bar, battle rope, kettlebells, balls, tubes, TRX, roller, jump rope, ab wheel, mat). Model names that appear only in file names (JE7, UBX, RBX, JCT-700, PRO) were NOT used.
- weight_step_kg: none readable, all blank. zone: blank for the owner. quantity: 1 for everything except Adjustable Bench = 2 (folder name says "(2)" and the two photos show two models).
- Names are plain standard names. "Plate Loaded" appears in a name where plates are visibly loaded on the machine.

## needs_owner_check
| Folder | What I saw | What I need from the owner |
|---|---|---|
| 08 Standing fly and deltoids | Standing machine with two high lever arms, back pad and plate stack; the label reads like "Multi Flight" | Which movements it supports. I wrote NO exercises for it until confirmed. |
| 04 Pec deck and 24 Flies machine (fan) | Same photo file in both folders | Is folder 24 a second machine/unit or just a duplicate? Kept as one machine, quantity 1. |
| 05 Lateral pulldown dual pulley | High pulley with bar plus a seat/thigh roller; "dual pulley" in the name | Is there also a low-row pulley on this stack? Only lat pulldown exercises were written. |
| 15 Reverse front lat pulldown | Plate-loaded machine with high handles, chest pad and seat | Confirm the correct name and whether the arms move independently. Named "Front Lat Pulldown (Plate Loaded)". |
| 26 Reclineable treadmill | Standard motorised treadmill with console | Does it have an incline? "Treadmill Incline Walk" assumes yes. |
| 28 Adjustable benches (2) | Two models: Super Bench and Deluxe Super Bench (with leg roller) | Confirm quantity 2, and whether either can decline. |
| 29 Flat bench | Flat/incline combo bench with a bench rack, close to folder 11 | Is it a separate unit from the Olympic Flat Bench? Listed separately with no exercises (duplicates). |
| 31 Dumbbell racks | Empty two-tier rack photo only | Dumbbell weight range, pairs, and what plates/collars exist. Plates are assumed from plate-loaded machines. |
| 32 Grips and bars | 17 attachment photos | No rope attachment and no ankle strap were photographed, so no rope or ankle-strap exercises were written. Confirm if they exist. Photos not kept: straight D-handle small/big, straight handle big, rowing handle, D rowing handle, square handle, EZ curl handle, MAG small/large, accessories curve D small. Some were kept as 4 images max. |
| 33 jx fit battle rope jungle | Round base plate with a central post and handles; unidentified | What it is. No row or exercises written. |
| 33 Medicine and wall balls | Two medicine ball sets (coloured 1-5 kg; black leather 1-3 kg) and a soft wall-ball set | Which balls are slam-rated. A caution is written on the slam exercise. |
| 33 Suspension trainer, resistance tubes | Straps and tubes with door/anchor straps | Where can the suspension trainer be anchored safely? Anchor must be confirmed before the rows are used. |
| 34 Yoga mats | Flat illustration, not a photo | A real photo if you want one. |
| 35 Power cage | Cage with barbell loaded; no pull-up bar clearly visible | Is there a pull-up bar, and is a bench usable inside? No pull-up or inside-the-cage bench rows were written. |
| Weight plates | No plates were photographed on their own; plate exercises (neck work, Plate Halo, Plate Pinch Hold, plate-loaded machines) assume loose Olympic plates exist and are listed under the Flat Bench or Olympic Barbell | Plate sizes available, and whether small (1.25-2.5 kg) plates exist for neck work. |
| All machines | Weight stack plates unreadable | Weight step per plate for each stack; zone for each machine. |

## Privacy findings
- Contact sheets of all 80 images and OCR on all 64 kept detail images: no people or faces, no phone numbers, no URLs, no member names, no other gym's logo or watermark found. Nothing needed blurring; nothing was blurred.
- Visible text is only the supplier's own "JERAI / JERAI FITNESS" branding on the equipment, plus weight labels. This is supplier branding, not another gym. The owner should decide whether he is happy to show it.
- Limits: OCR is imperfect on small text. A last quick look at the images in the app is recommended.
- No EXIF, XMP or ICC data in any output WebP (checked byte-level).

## RIGHTS - owner question
These look like supplier or catalogue product renders (file names like `strength_club_line_plus_...`, white studio backgrounds, supplier branding, one stock illustration). **Owner: please confirm that you have the right to use these images in your own app (for example a licence or permission from Jerai Fitness).** If not, replace them with your own photos before publishing.

## Sources
No web search was used. All exercise content comes from general training knowledge (standard exercise names and setups). No external sources to list.

## Assumptions
- Bodyweight rows that need equipment keep that machine in `machine_name` (e.g. Suspension Row, Soft Box Jump, Bench Dip). Pure floor/bodyweight rows have blank `machine_name`. "Mountain Climber" is kind=cardio with blank machine.
- Hold exercises (Plank, Side Plank) use rep_min/rep_max as seconds; this is stated in the cues.
- Core muscle ids in main CSVs, except neck rows (primary `neck`, proposed, flagged). Where core ids lose detail, `exercises_extended.csv` has an extra `proposed_muscles` column (front/side/rear delts, upper/lower chest, abductors, adductors, hip flexors). Hip Adduction has no core id: quads is a placeholder in the main CSV and `adductors` is tagged as proposed.
- `track_fit` is computed from a simple rule (difficulty, beginner_friendly, movement pattern, cardio kind). It is not from TIERS_TRACKS_RULES.md and should be reviewed.
- Rep ranges are generic, not progressive-overload rules (that doc was not read).
- Substitutions use the same first primary muscle on a different machine; superset pairs are hand-chosen from existing exercises.
- Holds also include Wall Sit, Hollow Hold, Bear Crawl, Plate Pinch Hold and Neck Isometric Hold (reps = seconds).
- `exercise_variations.csv` lists every grip / stance / angle / attachment option, one per row.
- Anti-bloat: grip, stance, bench angle and unilateral options are in `variations`; separate rows only where emphasis or pattern changes.

## Counts
- Machines/equipment rows: 55 (bodyweight 1, cable 2, cardio 9, free_weight 13, other 10, strength_machine 20)
- Exercises: 199 (bodyweight 39, cardio 27, strength 133)
- Substitution rows: 199; superset pairs: 38
- Per muscle:

| Muscle | Status | Machines primary | Exercises primary | Machines secondary | Exercises secondary |
|---|---|---|---|---|---|
| chest | core | 14 | 19 | 7 | 9 |
| back | core | 11 | 14 | 12 | 18 |
| lats | core | 4 | 5 | 16 | 20 |
| shoulders | core | 11 | 22 | 26 | 58 |
| biceps | core | 11 | 14 | 14 | 18 |
| triceps | core | 10 | 13 | 18 | 25 |
| forearms | core | 4 | 6 | 16 | 25 |
| abs | core | 3 | 10 | 13 | 40 |
| obliques | core | 4 | 7 | 2 | 4 |
| glutes | core | 5 | 6 | 22 | 52 |
| quads | core | 13 | 22 | 13 | 24 |
| hamstrings | core | 7 | 8 | 15 | 28 |
| calves | core | 5 | 6 | 5 | 11 |
| lower_back | core | 2 | 4 | 9 | 18 |
| traps | core | 4 | 5 | 10 | 22 |
| full_body | core | 4 | 7 | 2 | 2 |
| cardio | core | 10 | 27 | 0 | 1 |
| upper_chest | proposed | 5 | 5 | 0 | 0 |
| lower_chest | proposed | 1 | 1 | 0 | 0 |
| front_delts | proposed | 10 | 12 | 0 | 0 |
| side_delts | proposed | 5 | 7 | 0 | 0 |
| rear_delts | proposed | 6 | 9 | 0 | 0 |
| adductors | proposed | 2 | 3 | 0 | 0 |
| abductors | proposed | 1 | 1 | 0 | 0 |
| hip_flexors | proposed | 1 | 4 | 0 | 0 |
| neck | proposed | 1 | 4 | 0 | 0 |

`neck` is covered by 4 rows (3 plate/dumbbell rows on the Flat Bench and 1 hand-resistance isometric). They use `neck` (a proposed id) as primary in the main CSV and are flagged in `proposed_muscles`. Every neck row is very light-load and needs trainer supervision at first.

## Images
- Machines with images: 55; primary images: 55; total WebP files: 128 (thumb + detail)
- Total size: 1.65 MB (budget 8 MB); largest file: battle-rope-1.detail.webp (64.6 KB)
- Only one photo existed for most machines. Secondary angles: adjustable bench (2), cable attachments (4 total), barbell, kettlebells, medicine ball, stability ball, battle rope.

## Validation output
```
PASS  every exercise machine exists (or blank for pure bodyweight)
PASS  rows with blank machine are only kind=bodyweight (or the one no-equipment cardio row)
PASS  all muscle ids in taxonomy - []
PASS  main CSVs use core ids (a proposed id only when flagged in proposed_muscles)
PASS  machine muscle_groups ids valid
PASS  proposed ids valid
PASS  rep_min <= rep_max
PASS  cardio rows have blank reps; non-cardio rows have reps
PASS  machine slugs unique + kebab
PASS  exercise slugs unique + kebab
PASS  no duplicate machine names
PASS  no duplicate exercise names
PASS  extended joins 1:1 by name
PASS  machines: no empty required cells (muscle_groups blank allowed only for attachments/roller/mat) - []
PASS  exercises: no empty required cells - []
PASS  extended: no empty required cells - []
PASS  enum values valid
PASS  track_fit slugs valid
PASS  every machine has >=3 exercises or a stated reason - 37 machines below 3; reasons listed below
       - Incline Chest Press (Plate Loaded): 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Decline Chest Press (Plate Loaded): 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Vertical Chest Press: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Pec Fly / Rear Delt Machine: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Lat Pulldown: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Seated Cable Row: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Standing Multi Flight: 0 exercise(s); reason: function not verifiable from the photo; owner must confirm (exercises withheld)
       - Olympic Incline Bench: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Olympic Flat Bench: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Preacher Curl Bench: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Shoulder Press Machine (Plate Loaded): 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Biceps Curl Machine: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Front Lat Pulldown (Plate Loaded): 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Seated Calf Raise: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Prone Leg Curl: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Hip Adductor / Abductor: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - 45 Degree Leg Press: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Hip Thrust Machine: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Hack Squat: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Leg Extension: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Back Extension: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Flat Incline Combo Bench: 0 exercise(s); reason: duplicate bench station: its exercises are already listed under Olympic Flat Bench, Olympic Incline Bench and Adjustable Bench
       - Cable Attachments: 0 exercise(s); reason: accessories used on cable machines; exercises are listed under Cable Crossover, Lat Pulldown and Seated Cable Row
       - Lifting Platform: 1 exercise(s); reason: single-purpose: barbell deadlift (variations recorded in the variations column)
       - Curve Treadmill: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Elliptical Cross Trainer: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Rowing Machine: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Ski Erg: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Upright Bike: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Recumbent Bike: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Wall Ball: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Half Stability Ball: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Foam Roller: 0 exercise(s); reason: recovery tool, not a strength or cardio exercise
       - Jump Rope: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Ab Wheel: 1 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
       - Yoga Mat: 0 exercise(s); reason: floor surface only; floor exercises are listed as bodyweight rows with blank machine_name
       - Soft Plyo Box: 2 exercise(s); reason: single-purpose machine/accessory: other variations are recorded in the variations column, nothing padded
PASS  every core muscle covered
INFO  uncovered proposed ids: 
PASS  every machine has a primary image (thumb+detail)
PASS  every manifest file exists
PASS  manifest size/dimensions match files - []
PASS  no image over its size target (and no upscaling beyond target width) - []
PASS  no EXIF/XMP/ICC metadata in any WebP - []
PASS  no orphan image files
PASS  per-machine images <= 3 secondary
PASS  total image size <= 8 MB - 1.65 MB, 128 files, largest battle-rope-1.detail.webp 64598 bytes
PASS  every manifest alt text non-empty
ALL PASS
```
