# LAUNCH_STATUS: Shield Fitness (live since Nov 2026). READ THIS FIRST.

This file is in BOTH zips (member app = "user", staff app = "admin"). It records what is live, what the owner tested on real
devices, what broke at launch and how it was fixed, and how to ship changes. It overrides older docs wherever they disagree
(`docs/OWNER_SETUP.md`, the two earlier briefs). No secrets are in this file; secrets are named, never valued.

## 1. The owner and how to talk to him
- Owner of Shield Fitness, Basavangudi (a gym). Not a coder. Casual ALL-CAPS Hinglish, swears as style: stay friendly, short,
  plain English, do not mirror or comment on the swearing.
- Annoyed by repeated or basic questions and long explanations. Do not re-ask what he answered. Skip basics.
- ONE step per message, ending with what to look for. "done" is ambiguous: ask once for the visible check, then accept.
- Windows PC, VS Code, **PowerShell** (not bash: no `for ... do ... done`, no `&&`; use `foreach ($f in "a","b") { ... }` and one command per line).
- Never ask him to paste a secret. If he pastes a `service_role` / `sb_secret_` key, `PEPPER`, `RESET_PEPPER` or `PURGE_SECRET`, tell him to rotate it.
  `sb_publishable_...` keys are public by design.
- Owner rules (never suggest changing): zero cost, dark and gold UI, offline-first, only admins create passwords, install gate on phones,
  no store or food-log features.

## 2. What is live
| Piece | Where |
|---|---|
| Member app (public repo `Phantomdexfr/shield-fitness-user`) | https://phantomdexfr.github.io/shield-fitness-user/ (GitHub Pages, workflow `Deploy`) |
| Staff app (private repo `Phantomdexfr/shield-fitness-admin`) | https://shield-fitness-admin-y4oh.vercel.app (Vercel Hobby, auto-deploys on every push to `main`) |
| Project A (core + all 29 Edge Functions) | ref `koghxmeuxnyzevblbbvl`, dashboard name "shield-a" |
| Project B (train shard) | ref `hqvpexugteernjsbjgsz` (same Supabase account as A) |
| Project F1 (free-account backups) | ref `drsqlvgqpvaepywdofew`, dashboard "shard f1", a DIFFERENT Supabase account the owner controls |
| Public URLs + publishable keys | `src/shared/shards.ts` in the admin app (read them there) |
| Super admin | phantomdx9@gmail.com (password set by the owner) |
- Free Supabase accounts allow 2 active projects each: A and B share one account, F1 is on another. 3 accounts in total.
- Local folders (Windows): admin `C:\Users\ankit shukla\OneDrive\Desktop\shields fitness club\admih\admin release`,
  member `...\shields fitness club\user\user release`.
- Vercel Hobby is "personal, non-commercial use only". The owner was told, chose it anyway and accepted the risk. Fallback: Cloudflare Pages (about 15 minutes). Do not re-argue.

### GitHub settings in place
- Member repo, Variables: `VITE_CORE_FUNCTIONS_URL` (= A's `/functions/v1`), `VITE_CORE_ANON_KEY` (A's publishable key), `VITE_FREE_SHARDS` (JSON `[{"id":"F1","url":...,"anonKey":...}]`). Pages environment: Deployment branches and tags = No restriction.
- Admin repo, Variables: `SHARD_A_URL`, `SHARD_A_ANON_KEY`, `SHARD_B_URL`, `SHARD_B_ANON_KEY`, `SHARD_F1_URL`, `SHARD_F1_ANON_KEY` (keepalive, every 3 days), `FREE_PURGE_URL` (= A's `/functions/v1/free-purge`).
  Admin repo, Secrets: `FREE_PURGE_SECRET` (must equal the function secret `PURGE_SECRET`).
- Both robots were run by hand and passed: Keep Supabase alive (A, B, F1 all `/auth/v1/health` 200) and Purge free accounts (HTTP 200, `ok:true`).

### Edge Function secrets on project A (names only; values live in the owner's password manager)
`PEPPER` (NEVER change: breaks every login), `ALLOWED_ORIGINS` (`https://phantomdexfr.github.io,https://shield-fitness-admin-y4oh.vercel.app`; add any new domain here, origins only),
`SHARD_B_URL`, `SHARD_B_SERVICE_KEY`, `SHARD_F1_URL`, `SHARD_F1_ANON_KEY`, `SHARD_F1_SERVICE_KEY`, `PURGE_SECRET`, `RESET_PEPPER` (NEVER change).
Not set: `VAPID_*` (web push is off). A's own `SUPABASE_*` secrets are automatic: do NOT set `SHARD_A_*`.

## 3. Tested by the owner on real hardware (Windows Chrome + one Android phone + real Supabase)
- Admin app: staff sign-in on desktop and Android phone, forced password change, home screen loads.
- First super admin via `tools/shield-cli.mjs init-super-admin` and `shard-load` (both ran clean after the SQL fixes).
- Member app: installed on Android Chrome, exercise library, machines and body maps show (after clearing the old cached copy).
- Gym connection by QR; first policy published (version 1); Create member in admin; member signs in on the phone, sets own password; data syncs to project B.
- Free accounts (no gym): sign-up, backup shows "Last backed up", wipe app data, "Already have a backup? Sign in", data restored.
- GitHub robots: keepalive and free-purge, both green with real responses.
- Local checks on the final zips: both apps typecheck clean and build (member app 230 precached files).

## 4. NOT tested (do not claim these work)
iOS Safari / any iPhone (Add to Home Screen, install gate); airplane-mode offline use; install gate in a plain browser tab on a phone;
forgot-password with admin approval (checklist F); free-to-gym move (G); wrong-password limits; plan share (`share_*`); web push (off);
`bulk-import`, `approve-pending`, `request-join`, `reset-password`, `set-status`, `revoke-sessions`, `grant-xp`, `assign-shard`, `push-send` (deployed, never called);
adding shard C/D; the owner checklists `docs/OWNER_CHECKLIST_1.1.0.md` in both zips (still pending).
Unit tests: Admin 4 fail (`tests/heat.test.ts` fixtures, `tests/chartKit.test.tsx`); User 14 fail (`tests/dataset/compile.test.ts` fixtures, `tests/app/routes.test.ts`). All are stale test fixtures, not app bugs, and neither deploy path runs them except the admin repo's own `deploy.yml` (see section 6).

## 5. Bugs found at launch and how each was fixed (all verified on real projects)
1. **`src/sw.ts` / PWA build**: literal `self.__WB_MANIFEST` (already in earlier zips). Admin `.npmrc` for `npm ci`.
2. **Supabase projects created in 2026 give `service_role` NO table access by default** (HTTP 403 "permission denied"). Fix: `grant ... to service_role` on A, B and F1. See `supabase/LAUNCH_FIXES.sql` (admin zip). RUN IT on any new project.
3. **Member app reads `gym_settings` (`policy`, `contract_version`) before sign-in with the public key**, but RLS allowed only signed-in users, so connecting said "gym server is asleep". Fix: column grant + RLS policy for `anon` limited to those two keys (same SQL file, section 1b).
4. **`profiles.branch_id` was NOT NULL with no default**, while `createMemberFlow` never sets it, so Create member failed ("failed and was undone", log code 23502). Fix: `alter table profiles alter column branch_id set default sf_branch_id();` (section 1c).
5. **Edge Functions crashed on start (OPTIONS 500, SFE099, shown in the browser as a CORS error)**: `supabase/functions/_shared/clients.ts` loaded supabase-js with a VARIABLE specifier, which `supabase functions deploy --use-api` does not bundle. Fix: literal `await import('npm:@supabase/supabase-js@2')` with `// @ts-ignore` (so `tsc` still passes). Every function shares this file: after editing it, redeploy ALL functions.
6. `src/shared/levels.ts` imports now end in `.ts` (Deno needs it for `grant-xp`).
7. Member repo `.gitignore` no longer ignores `src/dataset/generated/` (the compiled exercise data must be committed: the workflow does not run `npm run dataset`). Missing it gives an EMPTY library on the live site.
8. Admin `vercel.json`: removed `"git": {"deploymentEnabled": false}` so pushes auto-deploy.
9. Admin tests: `tests/guard/design.test.ts` skips `src/shared/shards.ts` (owner data holds real URLs); `tests/freeShards.test.ts` accepts a configured F1.
10. All 29 functions are deployed with `--no-verify-jwt` (the new publishable keys are not JWTs and the gateway check rejected callers). Safe: each signed-in function verifies the caller itself in `_shared/auth.ts` (`requireCaller`).
11. `tools/` in the admin zip MUST stay (it holds `shield-cli.mjs`). Older briefs saying to delete it are wrong.

## 6. How to ship changes (PowerShell)
**Member app** (public repo): edit, then
```
git add -A
git commit -m "what changed"
git push
```
then GitHub > Actions > Deploy > Run workflow (or push a tag `v1.x.y`). Wait for the green tick. Phones may need the app reopened once or twice, or Clear data if stuck on an old copy.
**Admin app**: `git add -A`, `git commit`, `git push`: Vercel deploys by itself. Do NOT push a `v*` tag to the admin repo (its `deploy.yml` runs `npm test`, which has 4 known failures, and Pages on a private repo needs a paid plan).
**Edge Functions** (any change under `supabase/functions` or a file they import such as `src/shared/*.ts`): a push does NOT update them. Redeploy from the admin folder:
```
npx supabase functions deploy FUNCTION-NAME --project-ref koghxmeuxnyzevblbbvl --use-api --no-verify-jwt
```
All 29 at once (answer Yes if it asks "Deploy 1 Function?"; a misclick on No skips that function):
```
foreach ($f in "approve-pending","assign-shard","bulk-import","change-password","create-member","free-delete","free-lookup","free-purge","free-recovery-set","free-reset-approve","free-reset-cancel","free-reset-redeem","free-reset-request","free-reset-status","free-signup","grant-xp","ingest","lookup-login","publish-policy","push-send","request-join","reset-password","revoke-sessions","set-status","share_cancel","share_claim","share_create","share_status","sync-summary") { npx supabase functions deploy $f --project-ref koghxmeuxnyzevblbbvl --use-api --no-verify-jwt }
```
**Database changes**: no migration tool is used. SQL is run by hand in each project's SQL editor; put any new SQL in `supabase/` AND in the repo so a rebuild stays correct.
**CLI** (`tools/shield-cli.mjs`): service keys are asked at a prompt that does NOT hide pasted text on his terminal; run `cls` afterwards and never screenshot it. Use the Legacy `service_role` key (starts with `eyJ`).
**Debugging a function**: errors are deliberately swallowed (no personal data in logs). Use project A > Logs > API Gateway to see which request failed (that is how bugs 2 to 5 were found). A browser CORS error on a function usually means the function crashed on start, not a real CORS problem.

## 7. Open items and warnings
- **NEXT WORK (planned 2026-11-22): see section 8.** Do not start it until the owner says which phase.
- Owner still to do: iPhone/Safari test, both `OWNER_CHECKLIST_1.1.0.md` lists, a second real phone. Treat the whole system as a **beta** until done.
- Public repo means public forever, including old commits. Machine photos in `public/machines/` are public. BodyParts3D licence note on the Credits page is unresolved.
- One unexplained log line: a single `GET /rest/v1/gym_settings` 401 "permission denied" on project A shortly after launch (the phone connect itself works). If connecting ever fails again, check it first.
- The `PURGE_SECRET` value was briefly pasted as a plain GitHub Variable and appeared in a chat screenshot. The owner chose to keep it. If he ever wants peace of mind: change it in project A and in the admin repo Secret together.
- Free-account data lives in the F1 account (the one he controls). Keep access to that account.
- Free Supabase projects pause after about a week idle: the keepalive workflow prevents it. GitHub disables scheduled workflows after 60 days with no repository activity: a commit or manual run restarts them.
- Edge Function count: 29 deployed. Supabase docs conflict on the free-plan limit (25 vs 100); the deploy of all 29 succeeded.

## 8. Next: Milestone 11 "Native feel and a calmer UI" (planned 2026-11-22, nothing built yet)
Plan, design spec and owner decisions: `docs/UX_REDESIGN_PLAN.md` (same file in both zips). Read it before any phase of this milestone. User app = Phases 82-88, Admin app = Phases 56-59, one phase per session, release 1.2.0 at the gates (88 and 59).
Why: the owner's first live feedback was (1) no visible Share/Copy workout by QR, and free users cannot see it at all (the member build has no share relay address; fix = fall back to project A's functions, no new secret), (2) no onboarding for new users, (3) dates must be picked from a calendar everywhere in BOTH apps, never typed or native, (4) UI too stacked and heavy, naked text buttons, 4-way segmented rows, and long pages (Library, Exercise, Machines, Workout and every page that scrolls) must show sections below the first block as stacked, closable bars (`Collapsible`), (5) pinch-zoom must be off so it feels native, (6) heatmap and body figures must follow the male/female choice from onboarding (they hard-code male today).
Order: 82 (zoom lock, share fix, figure follows profile) > 83 (button kit) > 84 (calendar) > 85 (onboarding) > 86-87 (declutter) > 88 (gate). Admin 56-59 follow the same order and can run in parallel with the member side.
Shipping is unchanged (section 6). No Edge Function redeploy and no SQL are expected for this milestone. If a phase wants `contract/` changed, stop and tell the owner first.
Owner talk rules from section 1 still apply: ONE step per message, short, plain English, PowerShell, never ask for a secret.
