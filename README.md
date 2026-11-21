# Shield Fitness — USER APP (Phase 0 docs + dataset + assets)

A premium dark-and-gold, offline workout PWA. **Works standalone for anyone**; can later be connected to a gym (QR / link / code) with no code change. The Admin app lives in a separate zip; both share the identical `contract/` folder.

## What is in this zip
Docs (`CLAUDE_MUST_READ.md`, `PHASES.md` — 72 phases, `PHASE_STATUS.md`, `docs/*`), `contract/` (shared rules + the exercise dataset), `public/machines/` (55 machines, 128 WebP photos), `reference/prototypes/` (the two owner prototypes, reference only). No app code yet: Phase 1 scaffolds it.

## Start a Claude session (free plan: one phase per session)
1. Unzip, attach the zip (or its folder) to a new Claude chat.
2. Paste:
> Read CLAUDE_MUST_READ.md and do exactly the next phase in PHASE_STATUS.md. Update PHASE_STATUS.md, then give me the updated zip.
3. Take the returned zip as the new project. Repeat.

[D] phases write specs, [E] phases write code, [G] phases are gates with checklists for you.

## Order notes
Phases 1-64 need nothing else (that gives the standalone 0.1.0). Phases 65-70 (connect to a gym) need the Admin zip's phases 9-18 done and its `contract/` copied here. If `contract/CHECKSUMS.txt` does not match between the two zips, stop and re-copy.

## Publish
See `GITHUB_UPDATE_PUSH.md` (GitHub Pages, Vercel-ready; repo `shield-fitness-user`).

## You will be asked for
Zone names, weight steps, gym logo, UPI id, About/Credits text, a decision on the BodyParts3D licence. Nothing is invented meanwhile.
