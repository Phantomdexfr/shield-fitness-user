# AI_REVIEW_EXPORT (AI) — copy your training as plain text for any AI

Spec of record: `contract/engines.md` section 18. Phase 40.

## What the user sees
- After a workout: **Copy for AI review** on the session summary. Pick it, see the exact text in a preview (editable), tap Copy, paste into Claude, ChatGPT or any chat.
- Any past session: the same button on every history entry.
- A period: **Review a period** -> last 7 days / 30 days / this month / custom range -> one combined text (weekly totals, muscles, compact sessions, trends).
- One exercise: **Copy this lift's progress** on the exercise page (last 8 sessions by default).

## The text (plain, no formatting)
Starts with an optional intro prompt (editable, can be turned off), then CONTEXT (goal, experience, units), then the session/period, exercises with setups, sets x reps at weights, notes, skipped/swapped items, PRs and muscle shares. Example intro: "Review my training below. Tell me what is going well, what to change, and what to try next. Keep advice practical."

## Options (Settings -> Training -> AI review, and in the preview)
Include: notes (on), RPE (on), setups (on), PRs (on), muscle shares (on), bodyweight (off), name (off), body stats (off). Units follow settings. Intro prompt text and on/off. Length: long ranges auto-compact; hard cap 12,000 characters with a visible "trimmed" note.

## Privacy and honesty
- Built on the phone; nothing is sent anywhere by the app. The text goes only where the user pastes it.
- Default text has no name, photos, body stats, gym or account details.
- The preview screen says: "Once you paste this into another service, that service's privacy rules apply."
- The app does not claim the AI's advice is medical advice.

## Not built
Direct API calls to any AI, keys, accounts, automatic sending, image export of workouts (that is the routine image in Phase 61).
