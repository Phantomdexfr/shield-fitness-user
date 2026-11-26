# HEATMAP — what you trained, painted on the body

Maths is in `contract/engines.md` sections 2-5 (shared with the Admin app). This doc is the UI/product spec. Built in Phases 43 (engine), 30 (page), 31-32 (recovery, marks).

## Purpose
Show at a glance which muscles got trained over **any period**: a day, a week, a month, a custom range or all time. Tap a muscle to see exactly why it is that colour. Compare two periods. Spot neglected muscles. Know what is recovered before choosing today's training.

## Screen `/heatmap`
- **Period chips:** Day · Week · Month · Custom · All. Day/Week/Month have prev/next arrows (IST calendar). Custom opens a range sheet (two date fields + presets: last 7/14/30/90 days).
- **Figure:** `<BodyPicker mode="heat">`, front/back/sex controls, gold legend with 5 bands labelled "Light … Heavy" (not numbers), and a muscle text list twin sorted by heat.
- **Tap a muscle** -> sheet: muscle name, band, number of sets, top exercises that hit it (with variation if logged), last trained date, recovery state, buttons "Train this" (opens the Muscle Lab list for it) and "Add to today".
- **Compare:** toggle "Compare to" a second period; per-muscle delta shown as gold (more) / steel (less) tint; legend explains. Never red.
- **Neglected strip:** muscles with zero heat in the selected period, ordered by how long since last trained.
- **Balance card:** push vs pull, upper vs lower, front vs back as simple three bars with plain-words verdicts ("Pull is 40% of your push work").
- **Empty state:** "Log a session to see your map" with one gold button.

## Rules
- Warm-up sets never count. Variation choice changes the weights (e.g. incline press adds upper chest) per `variation_muscle_shift.csv`; the sheet says "variation adjusted" when it applied.
- Custom exercises count using the user's own muscle picks.
- All colours from `--heat-*`; the legend and a text list make it readable without colour.
- Data comes only from local sessions (and synced history when connected). Nothing leaves the device in standalone mode.
- Cardio/timed rows count 1 set per 5 minutes. The reference ("what is full") adapts to the user's own history, so a beginner's "heavy" is theirs, not an athlete's.

## Related screens
- **Recovery clock** (`/body/recovery`): same figure in `recovery` mode; feeds the "Suggested day" and the day builder.
- **Avoid / sore marks** (`/body/marks`): tap areas to mark; respected by suggestions, swaps and the day builder.
- **Session summary** mini body shows that session's muscles.
