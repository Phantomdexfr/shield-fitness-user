# PWA_INSTALL_GATE — "blocked until installed on the phone" (User app)

## Behaviour
On every cold start, before the router, the policy layer, the dataset or any gym client exists, `detectInstallState()` (pure, `src/pwa/installGate.ts`) decides. Only `installed` continues. Everything else renders **one screen**, `InstallGate`, which makes no data call and no network call except the app's own static files. Applies in **both** standalone and connected modes.

## Detection (pure function of an `env` object, fully unit-testable)
`installed` when any of: `matchMedia('(display-mode: standalone)')` · `fullscreen` · `minimal-ui` · `navigator.standalone === true` (iOS home-screen app).
Otherwise classify for instructions:
| State | How detected | Screen |
|---|---|---|
| `android-promptable` | Android + `beforeinstallprompt` captured | One big "Install" button (calls `prompt()`), fallback steps below |
| `android-other` | Android, no prompt event | Menu -> Install app / Add to Home screen steps |
| `ios-safari` | iOS/iPadOS Safari | Animated 3-step guide: Share -> Add to Home Screen -> open from the icon |
| `ios-other` | iOS Chrome/Edge/Firefox | "Open in Safari" (copy-link button) or Share -> Add to Home Screen where supported |
| `in-app-browser` | Instagram/Facebook/WhatsApp/etc. UA markers | "Open in your browser" first |
| `desktop` | no touch + wide screen | "Open on your phone": QR of the URL (generated offline) |
| `unsupported` | no service worker / IndexedDB | Plain-words message |

## After install
The installed app is a separate storage context on iOS: it starts empty. That is fine: the gate runs first, so all data lives in the installed app. Backup/restore (file) moves data between phones in standalone mode; connected users re-login and history returns from the gym.

## Developer bypass
Dev builds only: `?bypass-gate` (compiled out of production builds; a test asserts the string is absent from `dist/`).

## Honest limit
A **soft gate**: a technical person can spoof standalone mode. It stops casual browser use and shapes the product (offline, home-screen presence). It is not security; data stays local and, when connected, protected by login and the gym's row-level rules.

## Manifest
`display: standalone`, `scope`/`start_url` = base path, `name` "Shield Fitness", `short_name` "Shield", theme/background from tokens, icons 192/512 + maskable, stable `id`.

## Owner device checklist (User Phase 64)
Install on iPhone Safari, iPhone Chrome, Android Chrome; open in a normal tab after install (blocked); open from an Instagram link (warns); uninstall + reinstall (starts empty; restore a backup file).
