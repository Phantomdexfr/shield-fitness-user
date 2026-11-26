# SECURITY_MODEL — User app

Binding for every phase. The server side (RLS, functions, secrets) is owned by the Admin zip; here are the client rules.

1. **No secrets in the client or repo.** Only public values: gym `url` and `anon` key received through `SFCFG1`, never service keys, KEKs or peppers.
2. **Standalone makes zero background network requests.** Allowed: loading its own static files; the YouTube link the user taps (opened outside the app); the **plan-share relay calls** (Share/Receive, only on tap, only ciphertext and a derived id leave the device), and the **barcode lookup**, which fires only when the user taps Scan/Look up and sends only the barcode number to Open Food Facts (no account, no identifiers). No analytics, no telemetry, no CDN fonts/scripts.
3. **Gym config is untrusted input:** validate `v`, hosts end with `.supabase.co`, contract MAJOR, show the host and require confirmation; optional `ALLOWED_GYM_HOSTS` pin; never follow URLs inside it other than its three endpoints.
4. **Policy is a preference, not code:** zod-validate; render every string as text (no `innerHTML`); links must be `https:`; ignore unknown keys; keep the last good policy on error.
5. **Credentials:** the app never creates or stores a password; the login form posts to the gym via the SDK; sessions live in IndexedDB; sign-out clears them; `must_change_password` forces the change screen; no password in logs, URLs or the outbox.
6. **Personal data:** body stats, health notes, marks and photos stay on the device in standalone mode. Progress photos never leave the device even when connected. The UI states this plainly.
7. **Backups contain personal data:** warn, no cloud upload, file only.
8. **Untrusted text:** custom exercise names/notes, routine names, gym announcements and policy text render as text, length-limited; user YouTube links must be `https://www.youtube.com/…` or `https://youtu.be/…` (else rejected).
9. **CSP** (meta tag on Pages; header on Vercel): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co https://world.openfoodfacts.org; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. `wasm-unsafe-eval`/`blob:` only if the 3D decode needs them (decide in Phase 60 and record).
10. **QR input** (gym QR) is parsed, never navigated to. 
11. **Install gate** is a soft gate (`docs/PWA_INSTALL_GATE.md`); do not describe it as security.
12. **Health content** (Atlas, cautions, suggestions) is educational, never medical advice; wording tests ban "cure/treat/diagnose".
13. **Licences:** third-party credits (BodyParts3D CC BY 4.0, MIT libraries) are shown in Credits; the BodyParts3D SA/BY ambiguity is an open owner item.

14. **Barcode data** is third-party: render as text, never as HTML; validate numbers; show the ODbL credit; cached products stay on the device.

15. **Plan sharing:** encrypt on the device (AES-GCM; key never leaves the device or the QR/link/code); the secret lives only in the URL fragment, typed code or QR; never log it; envelope parsed with zod and treated as untrusted (text only, length limits, library slugs resolved locally, no URLs followed); preview before import; never overwrite existing data; 3-minute single-use semantics are server-enforced but the UI must not promise more than that.

16. **AI review text** is built on the device and only copied to the clipboard or share sheet by an explicit tap; the app never sends it anywhere; default content excludes name, photos, body stats and account data; the preview states that the receiving service's privacy rules apply.
17. **Routine image / recap cards** are rendered locally on a canvas; no network; no personal data beyond what the user sees on screen.

## Standing gaps (owner checklists)
Real device storage eviction, iOS standalone quirks, real gym server behaviour, 3D performance on low-end phones.
