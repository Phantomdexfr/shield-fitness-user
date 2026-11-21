# CLAUDE MUST READ — Shield Fitness USER APP — Start Here, Every Session

You are working on the **User app** (the member-facing PWA). A separate **Admin app** has its own zip and its own sessions. You never touch it and never need it. What the two share is the read-only `contract/` folder.

---

## 0. Who you are in this session
You were handed a zip with the whole User project as it stands. Work out the next phase (`PHASE_STATUS.md` -> Current state), do ONLY that phase, leave the project clean, update `PHASE_STATUS.md`, re-zip. You have no memory of other sessions. If something you need is not in the zip, **stop and say so**. Never invent owner data (zones, weight steps, logos, gym keys). See `PHASE_STATUS.md` -> "Awaiting from owner".

## 1. Reading order
1. This file. 2. `PHASE_STATUS.md` (Current state + your row). 3. `PHASES.md` (your phase). 4. `DEPENDENCY_VERSIONS.md`. 5. Only the docs the phase names: `MASTERPLAN.md`, `PROJECT_STRUCTURE.md`, `API_CONTRACTS.md`, `contract/*`, `docs/*`.

## 2. What the User app is
A premium dark-and-gold PWA for people who train: a flexible, offline workout tool built on a real exercise dataset (634 exercises, 55 machines with photos, 34 detailed muscles). Core ideas: **tap a body to find or build training**, **routines with any number of days**, **sessions that never lock you into an order**, **heatmaps of what you have trained**, **suggestions and swaps**, **your own exercises**, a **3D atlas of what each muscle does in daily life**. It works **standalone** (no gym, no login, all on the device). It can later be **connected** to a gym (an Admin app's Supabase) by scanning a code, with no code change, which adds membership, QR check-in, gym programs, announcements and admin locks. Installable on any phone incl. iOS; blocked until installed.

```
Browser (installed PWA)
  UI pages (slug routes)                src/pages/*, src/ui/*
   | uses only
   v
  Domain (pure TS, no DOM/network)      src/shared/*   <- Vitest; mirrors contract/engines.md
   |
  Dataset (compiled JSON, lazy chunks)  src/dataset/*  <- built from contract/dataset by scripts/compile-dataset
  Local store (IndexedDB + outbox)      src/data/local/*  <- UI reads/writes HERE first
   | only in connected mode, lazy-loaded
   v
  Gym link (policy, auth, sync)         src/data/gym/*   <- the ONLY code importing @supabase/supabase-js
```
**Hard rules**
- `src/shared/*` is pure (no DOM, no fetch, no Node built-ins, no clock: time is a parameter).
- UI never imports Supabase or `src/data/local/db.ts` directly; it uses `src/data/repos/*`.
- `@supabase/supabase-js` is imported only under `src/data/gym/` and only via dynamic `import()`, so standalone users never download it.
- Standalone mode is the default and must be complete on its own. Connected mode only ADDS or LOCKS things (`contract/policy.md`).
- No service key, KEK or pepper anywhere. No CDN requests at runtime (fonts, three.js, everything is bundled).

## 3. Non-negotiable build rules
1. **Zero cost.** No paid service. Static hosting (GitHub Pages first, Vercel-ready).
2. **Offline-first.** After first load everything works with no network; writes never get lost (autosave per set).
3. **Slugs.** Every addressable thing has a stable lowercase slug route: `/exercise/<slug>`, `/machine/<slug>`, `/routine/<id>`, `/muscle/<id>`. Routes live in the registry (`src/app/routes.ts`) with a feature flag key from `contract/features.catalogue.json`.
4. **Flexible by design.** No screen may force an order or a single path. A session never blocks on one exercise; a routine day is a suggestion, not a lock; every list can be skipped, reordered, searched.
5. **Feature switches.** Every feature has a key in `contract/features.catalogue.json` and is gated by `useFeature(key)`, which applies `contract/policy.md` resolution (locks only exist when connected).
6. **Dataset is read-only source.** The app reads compiled JSON only. Custom (user) exercises live in IndexedDB beside it and merge at query time.
7. **Time, units, money.** Weights kg 2 dp via `roundKg()`; times UTC stored, `Asia/Kolkata` shown; the gym day is IST midnight; money (connected, display only) integer paise.
8. **Machine photos are shown** (owner decision): thumbs in lists, detail on the page, lazy, fixed frame, from `public/machines/` via the manifest. Never upload photos; progress photos stay on the device.
9. **Install gate.** Nothing but the install screen renders until the app runs installed (`docs/PWA_INSTALL_GATE.md`).
10. **Dark + gold, no truncation, no expand cards, compact, nothing bleeds, settings are sub-pages** — see `docs/design/UI_RULES.md` and `DESIGN_TOKENS.md` (binding). Strings via `t('key')`.

---

## NEVER REWRITE FILES — read this before touching anything

**Do not rewrite any existing file in full. Ever.** No `cat > file.md << 'EOF'`, no re-typing a whole existing file. Not `PHASE_STATUS.md`, `API_CONTRACTS.md`, `PROJECT_STRUCTURE.md`, nor any source file that already exists. A rewrite burns the whole file's tokens; `str_replace` sends only the changed lines, and the owner is on the FREE Claude plan.

**Correct pattern:** read only the section you need (`grep -n '^#'` then `sed -n 'A,Bp'`, or `unzip -p archive.zip path`), then `str_replace` only the changed lines. Append-only additions (log entries, rows) go at the bottom via `str_replace` on the last unique line. Exceptions: creating a brand-new file; a file so broken that an earlier `PHASE_STATUS.md` entry anticipated a rewrite.

---

## ONE PHASE PER SESSION — FREE-PLAN BUDGET (owner rule)

- Do exactly ONE phase per session. **Never start the next phase**, even with time left. Each phase in `PHASES.md` is already sized for one free session.
- Read only the phase's "Key files", this file, and the phase entry. Never read a file over ~300 lines whole. In `PHASE_STATUS.md` read only "Current state" and your phase row.
- **Phase types:** `[D]` = decision/spec, DOCS ONLY (no code, no typecheck, no tests). `[E]` = execution. `[G]` = gate (checks + owner checklist). A `[D]` phase freezes contracts so `[E]` phases never re-think. If an `[E]` phase meets an unfrozen decision, it records an **[A]** assumption in `PHASE_STATUS.md`, takes the simplest option, and moves on.
- **If the session gets long** (many files read, a test failing after two tries): STOP at the next clean step boundary, write done/left in `PHASE_STATUS.md`, re-zip, hand over. A partial phase that re-zips cleanly is a success; an exhausted session is a failure.
- No big commands: typecheck ONCE, only the named tests, no full suite, no `npm install` unless the phase adds a dependency, no dev server unless the phase says so.
- If a phase is bigger than it looks, split it (NN-a / NN-b), log it, finish the first half.

## SESSION EFFICIENCY PROTOCOL
- Do not unzip the whole archive; `unzip archive.zip "path"` or `unzip -p`. Do not `unzip -l` everything; the layout is in `PROJECT_STRUCTURE.md`. `node_modules` is never in the zip.
- Mandatory minimum reading: this file, `PHASE_STATUS.md` (Current state + your row), your phase entry. Other docs only for the sections your phase names. **Do not read any skill `.md` files.**
- **The `contract/` folder is read-only here** unless the phase is a contract phase (it says so). It is identical in both apps' zips. Never edit it alone.
- **Dataset CSVs in `contract/dataset/` are read-only source data.** Never hand-edit; never load them whole into context (use `head`, `grep`, a script).
- The phase entry's "How to verify" wins over generic wording.
- Honesty: the sandbox has no phone, no Safari, no real Supabase. Say what tests proved and list the rest as a **standing gap for the owner**. Never claim what was not run.

## Re-zipping — exact command
From the project's parent directory (replace NN with the phase just completed, or `NN-partial`):
```bash
zip -r shield-fitness-user_phaseNN.zip shield-fitness-user \
  -x "shield-fitness-user/node_modules/*" -x "shield-fitness-user/dist/*" -x "shield-fitness-user/dist-pwa/*" \
  -x "shield-fitness-user/coverage/*" -x "shield-fitness-user/.git/*" -x "shield-fitness-user/secrets/*" -x "shield-fitness-user/.env"
```
Always include `package-lock.json`. Put the zip in the outputs folder and present it.

## Documentation duties every phase
`PHASE_STATUS.md` (status, date, decisions, [A] assumptions, known issues, what was NOT run, next phase) · `PROJECT_STRUCTURE.md` (new files, one line each) · `API_CONTRACTS.md` (extend first, then implement) · `docs/FEATURES.md` (tick delivered ids) · version bump only where the phase says (see `GITHUB_UPDATE_PUSH.md`).

## Before you finish — checklist
- [ ] Only this phase's scope touched; existing files edited in place
- [ ] `typecheck` once + the phase's own tests ran (anything not run is a listed standing gap)
- [ ] No floats for money; no service key/secret in the repo; no CDN request at runtime
- [ ] No purple/violet/magenta/pink/cyan-hologram palette, no truncation CSS, no expand/collapse cards, no hex outside tokens
- [ ] New routes registered with a slug + feature flag; new strings in `src/i18n/en.ts`
- [ ] `contract/` untouched (or changed identically per a contract phase)
- [ ] `PHASE_STATUS.md`, `PROJECT_STRUCTURE.md`, `API_CONTRACTS.md`, `docs/FEATURES.md` updated in place
- [ ] Exactly ONE phase done; the next NOT started
- [ ] Whole project re-zipped per the command above and presented

Then hand the zip back. That is the end of your session's job.
