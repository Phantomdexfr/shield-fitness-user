# EXERCISE_PAGE — every exercise has its own page

Route `/exercise/<slug>` (custom: `/exercise/my-<slug>`). Machine pages: `/machine/<slug>`. Built in Phases 21-27.

## Layout (compact, no expansion, nothing truncated)
1. **Header:** name (wraps fully), chips: category · sub-category · kind · difficulty (1-3 as three gold dots) · movement pattern · unilateral · beginner-friendly.
2. **Muscles:** mini `<BodyPicker mode="view">` with primary (bright) and secondary (mid) regions, and a text list "Primary: … · Secondary: … · Stabilisers: …" with emphasis words (High/Medium/Low). Contested rows get a small "Evidence is mixed" label (from the dataset `note`).
3. **Machine card (if any):** thumb photo, machine name, status badge (Active / Maintenance / Out of order), tap -> `/machine/<slug>`. No machine: "No equipment needed".
4. **Variations:** list of variation names; tapping one marks it as "the variation I'm doing" (stored with the logged sets and used by the heatmap shift). Where a muscle shift exists, a small note shows ("raises upper chest").
5. **Easier / Harder:** two buttons, choose from family members by `difficulty` and shared pattern/muscle.
6. **How-to:** setup/cues text, rep range, track fit.
7. **Cautions:** `injury_cautions` as a plain notice (never parsed).
8. **Watch it (YouTube):** one prominent button that opens YouTube directly in a new tab/app: `https://www.youtube.com/results?search_query=<name>+exercise+form` (URL-encoded). If a policy override or the user's own link exists, that exact URL is used instead. Never embedded (offline, cost, privacy). Feature key `youtube_links`.
9. **Your history:** last session, best set, PRs, a small progress line chart (when charts exist).
10. **Actions:** Add to today · Add to a routine day · Favourite · Hide ("never show") · Note (personal) · Substitutes (from `substitution_groups.csv` / computed).

## Machine page `/machine/<slug>`
Photo gallery (primary + up to 3 angles from the manifest; thumb first, detail on open), name, category, zone (blank = hidden), status + note (policy), muscles trained, list of exercises on this machine (cards), "Mark busy for this session". Photos in a 4:3 `PhotoFrame`, lazy, `alt` from the manifest, gold placeholder if missing. Feature key `machine_photos` can hide photos (text-only fallback layout).

## Data
Static detail from the compiled dataset chunk; user state (favourite/hidden/note/variation/history) from IndexedDB; overrides from policy (connected). Opening the page loads one detail chunk (<= ~60 exercises) and at most one detail photo.
