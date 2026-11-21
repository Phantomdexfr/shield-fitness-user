# POLICY — what an Admin app publishes and a User app obeys

One JSON document, stored by the Admin app in Shard A (`gym_settings`, key `policy`), read by the connected User app, cached locally, refreshed on open (cheap: one row, ETag-style `version` integer). Standalone apps use the built-in default policy (everything unlocked, defaults from `features.catalogue.json`).

```jsonc
{
  "contract": "1.0.0",
  "version": 12,                       // integer, +1 on every publish
  "published_at": "2026-11-17T10:00:00Z",
  "gym": { "name": "Shield Fitness", "slug": "shield-fitness", "timezone": "Asia/Kolkata" },
  "features": {                        // keys from features.catalogue.json
    "custom_exercises": { "enabled": true,  "locked": false },
    "rpe_logging":      { "enabled": false, "locked": true  }
  },
  "defaults": { "units": "kg", "rest_seconds": 90, "intensity": "moderate", "simple_mode": true },
  "library": {
    "hidden_exercise_slugs": ["example-slug"],
    "youtube_overrides": { "lat-pulldown": "https://www.youtube.com/watch?v=..." },
    "machine_status": { "leg-press-plate-loaded": { "status": "maintenance", "note": "Back in 2 days" } },
    "extra_exercise_slugs": ["my-gym-special-1"]   // promoted custom exercises, defined in the connected tables
  },
  "programs_published": ["fat-burn-8-weeks"],       // slugs of approved programs members can follow
  "branding": { "short_name": "Shield", "support_phone_display": null }
}
```

## Resolution rule (the whole thing in four lines)
1. `needsConnection` features are hidden when standalone.
2. If `features[key].locked` is true, the admin's `enabled` value wins and the user cannot change it (the Settings row shows "Set by your gym").
3. If not locked, the user's own setting wins; the admin's `enabled` is only the starting default for new connections.
4. Unknown keys are ignored (forward compatible); missing keys fall back to the catalogue default.

## Library overrides
- `hidden_exercise_slugs` removes exercises from search, suggestions and the day builder (existing history stays readable).
- `youtube_overrides` replaces the default YouTube search link for that exercise.
- `machine_status` marks a machine `active | maintenance | out_of_order`; exercises needing it show a badge and are replaced in suggestions.
- Overrides never delete data and never edit the bundled dataset.

## Validation
Both apps validate with the same zod schema (written in User Phase 62 and Admin Phase 35 from this file). An invalid policy is ignored and the last good cached policy stays in force.


## Added 2026-11-18
Library override `hidden_setup_values` (optional): `{ [exerciseSlug]: string[] }` with entries `axis:value` from `engines.md` section 13. Unknown axes/values are ignored. New feature keys are listed in `features.catalogue.json`.
