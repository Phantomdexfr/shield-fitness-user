# DEPENDENCY_VERSIONS — Shield Fitness USER APP

**Locked version manifest. Every session installs exactly these versions. Do not upgrade without updating this file and recording the reason in `PHASE_STATUS.md`.**

**Provenance — read honestly:** versions were looked up on the npm registry on **2026-11-16**. Peer ranges were read from registry metadata. The set was **NOT install-tested together** (planning session, docs only). **Phase 1's first job is the real `npm install`, then record in the "Install-test log" (bottom) what actually happened and adjust pins in place if anything failed.**

Rule applied: where a newer major exists (TypeScript 7, Tailwind 4, Preact 11, Vite 8, Zod 4) we stay on the proven previous major unless a reason is logged. Zero-cost, boring, small bundle.

---

## Runtime environment

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `>=22.12.0 <23` | `.nvmrc` = `22`. Vitest 5 requires `^22.12 \|\| ^24 \|\| >=26`. |
| **npm** | `>=10` | npm 10.9 ships with Node 22. No yarn/pnpm. |
| **Browsers (target)** | iOS Safari 16.4+ installed PWA, Android Chrome 110+ installed PWA | iOS < 16.4 cannot do web push; the app still works. |

---

## Exact package versions

### Build, language, UI

| Package | Exact version | Install | Notes |
|---|---|---|---|
| `vite` | `7.3.8` | `npm i -D vite@7.3.8` | Vite 8 exists; not used (keep the proven line unless Phase 1 proves 8 works). |
| `@preact/preset-vite` | `2.10.6` | `npm i -D @preact/preset-vite@2.10.6` | Accepts Vite 2–8. |
| `preact` | `10.29.8` | `npm i preact@10.29.8` | Do NOT use Preact 11 (new major, untested here). |
| `typescript` | `5.9.3` | `npm i -D typescript@5.9.3` | **Do NOT use TypeScript 7.** |
| `tailwindcss` | `3.4.19` | `npm i -D tailwindcss@3.4.19` | **Do NOT use Tailwind 4**; tokens are CSS variables, v3 is enough. |
| `postcss` | `8.5.33` | `npm i -D postcss@8.5.33` | |
| `autoprefixer` | `10.6.2` | `npm i -D autoprefixer@10.6.2` | |
| `wouter-preact` | `3.13.0` | `npm i wouter-preact@3.13.0` | Tiny router, base-path aware (GitHub Pages). Native Preact build of wouter (replaces `wouter`, Phase 4, see A26). |
| `@phosphor-icons/core` | `2.1.1` | `npm i -D @phosphor-icons/core@2.1.1` | Source SVGs only; a build script inlines the used icons (no runtime icon font). |

### Data, sync, validation

| Package | Exact version | Install | Notes |
|---|---|---|---|
| `@supabase/supabase-js` | `2.119.0` | `npm i @supabase/supabase-js@2.119.0` | Imported ONLY in `src/data/gym/supabaseRemote.ts` (dynamic `import()`; added in Phase 67). |
| `idb` | `8.0.4` | `npm i idb@8.0.4` | IndexedDB wrapper for the local store. |
| `zod` | `3.25.76` | `npm i zod@3.25.76` | **Use 3.x**, not 4.x. Validates function payloads and imports. |
| `papaparse` | `5.7.1` | `npm i -D papaparse@5.7.1` | Dataset compiler script only (build time, not shipped). |
| `jsqr` | `1.4.0` | `npm i jsqr@1.4.0` | Scanning the gym QR (iOS Safari has no `BarcodeDetector`). |
| `qrcode-generator` | `2.0.4` | `npm i qrcode-generator@2.0.4` | Membership QR card, offline (connected mode). |

### 3D atlas (vendored, no CDN)
| Package | Exact version | Install | Notes |
|---|---|---|---|
| `three` | `0.147.0` (installed in Phase 60, exact) | `npm i three@0.147.0` | **Same version as the owner's prototype** (it uses `examples/js/controls/OrbitControls.js`, present in r147). Import only in the lazy `/atlas` chunk. Vendoring/ESM import path is decided in User Phase 60 (r147 ships `examples/jsm/controls/OrbitControls.js` too); the model asset is a separate file. Not looked up on npm in Phase 0: **verify it installs in Phase 60.** |

### Fonts
Self-hosted woff2 only (no Google Fonts at runtime). **Picked in Phase 2 (looked up with `npm view` on 2026-11-19, both OFL-1.1):**

| Package | Exact version | Use | Notes |
|---|---|---|---|
| `@fontsource-variable/inter` | `5.3.0` | UI face, variable 100-900 | dev dependency = source of the woff2 only; the latin file is copied to `src/ui/fonts/` |
| `@fontsource/barlow-condensed` | `5.3.0` | display / big numerals, weights 500, 600, 700 | same; latin files copied to `src/ui/fonts/` |

No mono face (not needed yet). Latin subset only: no Devanagari/Kannada, and no U+20B9 (rupee sign) glyph, so a rupee sign falls back to the system font (matters only in connected mode, display-only money).

### PWA

| Package | Exact version | Install | Notes |
|---|---|---|---|
| `vite-plugin-pwa` | `2.0.0` | `npm i -D vite-plugin-pwa@2.0.0` | Peers: `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, Vite 3–8. **Strategy = `injectManifest`** with our own `src/sw.ts`. If 2.0.0 misbehaves in Phase 5, fall back to the latest 1.x and log it. |
| `workbox-build` | `7.4.1` | `npm i -D workbox-build@7.4.1` | |
| `workbox-window` | `7.4.1` | `npm i workbox-window@7.4.1` | |
| `workbox-precaching` | `7.4.1` | `npm i workbox-precaching@7.4.1` | Used in `src/sw.ts`. |
| `workbox-routing` | `7.4.1` | `npm i workbox-routing@7.4.1` | Used in `src/sw.ts`. |
| `workbox-strategies` | `7.4.1` | `npm i workbox-strategies@7.4.1` | Added in Phase 5 (A33): `CacheFirst` for machine photos and atlas in `src/sw.ts`. |

### Test

| Package | Exact version | Install | Notes |
|---|---|---|---|
| `@types/three` | `0.147.0` | `npm i -D @types/three@0.147.0` | Added in Phase 60 (types for the lazy atlas chunk; dev only). `three` r147 installs from npm and ships `examples/jsm/controls/OrbitControls.js`; the app imports that ES module, so the prototype's CDN `examples/js` file is not used. |
| `vitest` | `5.1.0` | `npm i -D vitest@5.1.0` | |
| `happy-dom` | `21.0.4` | `npm i -D happy-dom@21.0.4` | DOM for component tests. |
| `fake-indexeddb` | `6.2.8` | `npm i -D fake-indexeddb@6.2.8` | Local store tests. |
| `@types/node` | `22` (latest 22.x) | `npm i -D @types/node@22` then pin exact | Phase 1 records the resolved exact version here. |

**Playwright is NOT a project dependency.** The overflow audit (User Phase 64) uses the Playwright already installed in the Claude sandbox (`require('playwright')`).

**Not used on purpose:** any chart library (in-house SVG kit), any UI kit, any state library beyond Preact signals/hooks (decide in Phase 3 if `@preact/signals` is needed; if so pin it here first), any date library (use `Intl`), Playwright (no e2e in the sandbox; owner device checklists instead).

---

## Install-test log
*(Phase 1 fills this in: what was installed, what failed, what was adjusted.)*

| Date | Phase | Result |
|---|---|---|
| 2026-11-19 | 1 | Installed exact pins for Phase-1 packages (preact 10.29.8, vite 7.3.8, @preact/preset-vite 2.10.6, typescript 5.9.3, tailwindcss 3.4.19, postcss 8.5.33, autoprefixer 10.6.2, vitest 5.1.0, @types/node 22.20.5). Plain `npm i vitest@5.1.0` crashed npm 10.9.9 (arborist `edgesOut`); fixed with `legacy-peer-deps=true` in `.npmrc`. Typecheck and 1 vitest test pass. Build not run (owner rule). Pins unchanged. Resolved: @types/node = 22.20.5. |
| 2026-11-19 | 2 | Installed `@fontsource-variable/inter@5.3.0` and `@fontsource/barlow-condensed@5.3.0` (dev). Install clean. Latin woff2 copied to `src/ui/fonts/` with OFL licence files. Not exercised in a build. |
| 2026-11-19 | 3 | Installed `@phosphor-icons/core@2.1.1` (dev, source SVGs for `scripts/build-icons.mjs`) and `happy-dom@21.0.4` (dev, component tests via `// @vitest-environment happy-dom`). Both clean with `legacy-peer-deps`. Work: 28 UI tests pass. Not exercised in a build. |


## Added 2026-11-18
| Package | Version | Use | Note |
|---|---|---|---|
| barcode-detector | 3.2.4 | WASM ponyfill for iOS/unsupported browsers; lazy chunk, Phase 56 | Installed 2026-11-20 (`npm i barcode-detector@3.2.4 --legacy-peer-deps`); ponyfill + its WASM loaded in headless Chromium with a fake camera; production build NOT run |
| zxing-wasm | 3.1.7 | The ponyfill's own dependency, now declared directly so the app can bundle `zxing_reader.wasm` (`?url`) instead of the ponyfill's default CDN fetch (Phase 56) | Same version the lockfile already held; no new download |

No fuzzy-search library: search is our own pure code (`EN` 14). No AI/ONNX/transformers packages (dropped by the owner).
