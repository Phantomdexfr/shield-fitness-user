# PROTOTYPE_NOTES — what the owner's two prototypes contain and what we reuse

Files (kept untouched, for reference only; **never ship them**): `reference/prototypes/muscle_lab_2d.html` (about 680 KB) and `reference/prototypes/holo_body_3d.html` (about 3.5 MB; replaced by a newer owner file that models the 5 muscles the first one lacked). Read them with `grep -n` / `sed -n`; lines can be hundreds of KB long (base64 data), so clip with `cut -c1-200`.

## muscle_lab_2d.html — "Shield Fitness · Muscle Lab"
- **What:** a flat 2D body (SVG regions from MuscleMap, MIT) for male/female, front/back; **Explorer** (tap a muscle -> list of exercises) and **Muscles worked** (pick an exercise or machine -> highlighted regions) modes; a bottom sheet (half/full); a muscle search list; swipe to flip front/back.
- **Reuse:** the SVG figure paths and unit ids (-> `src/ui/body/figures/*`), the region-to-muscle idea (now data: `contract/dataset/detailed_muscles/html_unit_to_detailed.csv`), the explorer + "muscles worked" interaction, the clear/approx/list honesty tiers for muscles without a drawn region (FALLBACK).
- **Do NOT reuse:** the embedded base64 machine photos (51; we use `public/machines/` WebP files), its embedded old exercise data (`D.ex`; the dataset replaces it), Google Fonts links, the cyan/orange palette.

## holo_body_3d.html — "Holo Body"
- **What:** WebGL (three.js r147 via CDN) hologram of a male anatomy model (BodyParts3D, simplified, about 3.5 MB; 5 muscles are procedurally fitted approximations in `META2` / `FITGRP`), tap/list selection, front/back/side views, hologram shader, credits sheet.
- **Reuse:** the model data (extracted to a binary asset), mesh -> muscle mapping (`GMAP`), the `FITGRP` list (`MISSING` is now empty), the shader ideas (gold-ified), the selection UX.
- **Do NOT reuse:** CDN script tags, cyan colour, its empty `EXERCISES` hook (the atlas shows daily-life roles only), the disabled female model.
- **Licence note (kept visible):** BodyParts3D is CC BY 4.0 (credit + citation required); legacy OBJ comments mention CC BY-SA 2.1 Japan; the prototype's own note says "to be confirmed before commercial release". Because a paying gym is commercial, **the owner should confirm** (BodyParts3D licence page and the human-atlas repo) before launch. Logged as an open item in `PHASE_STATUS.md`.

## Shared lessons
- Heavy HTML prototypes hide their weight in base64: extract assets to files so they can be cached, lazy-loaded and measured.
- Both prototypes assume a network (fonts, CDN scripts). The app must not.
