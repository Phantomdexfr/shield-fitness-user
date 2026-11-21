# GITHUB UPDATE PUSH — Deploy guide for Claude and the owner

Read when a phase says "bump version" or the owner asks for a change to reach phones. **Status: written in Phase 0, never run. User Phase 1 wrote the deploy files (not run: no build in the sandbox); User Phase 64 is the first real deploy.**

---

## 1. The setup in one paragraph
Code lives in a **public** GitHub repo (default `<owner>/shield-fitness-user`). Pushing a tag like `v0.1.0` (or running the workflow by hand) starts `.github/workflows/deploy.yml`, which builds `dist/` and publishes it to **GitHub Pages**. Phones fetch `version.json` (no-cache, ~100 bytes) when the app opens; if it changed, the new service worker installs in the background and the app shows "Update ready — reload". Nothing is built on the owner's PC. **Pushes to `main` do not deploy** (saves Actions minutes and keeps the live app stable between milestones).

| Thing | Value |
|---|---|
| Live URL (Pages project site) | `https://<owner>.github.io/shield-fitness-user/` |
| Base path | `VITE_BASE=/shield-fitness-user/` (workflow sets it) |
| Slug fallback | `postbuild` copies `index.html` to `404.html` |
| Cache headers | Pages sets its own; correctness comes from hashed filenames + `version.json` check; do not rely on custom headers on Pages |
| Token | none; the workflow uses the automatic `GITHUB_TOKEN`. Never put a token or key in the repo or a message |

## 2. What Claude must do for EVERY change that must reach phones
1. Make the change with `str_replace` (never rewrite whole files).
2. Bump the version where the phase says (`package.json` `version`, and the two spots at the top of `package-lock.json`).
3. Run only the phase's tests (see the phase). Do not run a full build unless the phase says so.
4. Append a short entry to `PHASE_STATUS.md` (what changed, new version, what was NOT run).
5. Hand back BOTH: a **changed-files zip** (`shield-fitness-user_vX.Y.Z_changed_files.zip`, only changed files with their folders) and the **full zip** (`shield-fitness-user_phaseNN.zip`, per `CLAUDE_MUST_READ.md` section 8).
6. End the reply with the push steps below, real version filled in.

## 3. Push steps for the owner
```
cd <your local shield-fitness-user folder>
# extract the changed-files zip over it (overwrite), then:
git add -A
git commit -m "vX.Y.Z: <short summary>"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z      # this starts the deploy
```
Then open GitHub -> Actions -> "Deploy" and wait for green (about 1-2 minutes). On the phone, open the app twice (first open fetches the update, second runs it).

## 4. One-time Pages setup (owner)
GitHub repo -> Settings -> Pages -> Source = **GitHub Actions**. Repo -> Settings -> Actions -> General -> allow workflows. The repo must be public for free Pages.

## 5. No keep-alive here
The User app has no servers of its own. The keep-alive cron lives in the Admin repo.

## 6. Moving to Vercel later (non-open-source)
1. Make the repo private (Pages stops; fine) or deploy from a private copy.
2. Vercel -> import the repo -> framework "Other" -> uses `vercel.json` (build `npm run build`, output `dist`, `VITE_BASE=/`, SPA rewrites, security headers, long cache for `/assets/*`, no-cache for `sw.js`, `index.html`, `version.json`, `manifest.webmanifest`).
3. `git.deploymentEnabled` is false in `vercel.json`: deploy by tag or manually, so pushes do not burn builds.
4. If members are connected to a gym, tell the gym admin the new User-app origin (their Supabase Auth URL configuration and function CORS must allow it).
5. **Terms warning:** Vercel Hobby is for non-commercial use. A gym charging members is commercial. Either stay on Pages, or accept the risk, or move to a paid plan later.
6. Members must re-install the app (a new origin means a new installed app and new local data). Use the backup/restore file (User Phase 63) to carry data over. Plan the switch for a quiet day and tell members.

## 7. Do not touch unless asked
`deploy.yml`, `keepalive.yml`, `vercel.json`, `scripts/postbuild.mjs`, `public/manifest.webmanifest` `scope`/`start_url` — they take several rounds to get right.
