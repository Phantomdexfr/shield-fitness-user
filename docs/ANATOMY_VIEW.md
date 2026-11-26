# Anatomy View (Phase 91)

Where: Body > Muscle Lab > Anatomy View (`/anatomy`). Same feature flag as the Holo Lab (`holo_atlas`).

- Model: 962 parts, 15 body systems, one male body shape. Files in `public/anatomy/` (`mesh.bin`, `meta.json`, `info.json`), about 9 MB. Downloaded on first open (asks first on data saver or low power), then cached by the service worker.
- Tabs: Layers, Find, Info, View. Buttons: Spin, Isolate, Reset. Tap a part to select it.
- Settings are saved on the phone only (`sf_anat_*`).
- Holo Lab fix: a Sheet ignores backdrop clicks for 450 ms after it opens (`BACKDROP_GUARD_MS` in `Overlay.tsx`).

Owner check: open it on a real phone, wait for the model, tap a muscle (Info opens), try Isolate and a theme; then open /atlas and tap a muscle (info sheet stays open).
