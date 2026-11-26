# BARCODE (BC) — scan packaged food, see nutrition (no food log)

Phase 56/57. Owner decision (2026-11-18): **barcode scanner only; no AI/photo recognition, no food log.**

## Flow
Intake -> Scan. Camera preview with a frame; on a hit, lookup; result card; optional "Add protein to today". Manual barcode field always present (camera denied/unsupported).

## Tech
- Detector: native `BarcodeDetector` when the browser has it, else the `barcode-detector` WASM ponyfill loaded lazily only when the scanner opens. Formats: EAN-13, EAN-8, UPC-A, UPC-E, Code-128.
- Data: Open Food Facts public API (`https://world.openfoodfacts.org/api/v2/product/<barcode>.json`, no key, ODbL, credit shown on the card). Request only fields needed (name, brands, quantity, serving size, nutriments per 100 g and per serving).
- **Network rule:** the only deliberate exception to "Standalone makes no network requests". Fires only after the user taps Scan/Look up; never in the background; fails gracefully offline.
- Cache: last 50 looked-up products in IndexedDB (device only; not synced).

## Result card
Name, brand, serving; calories, protein, carbs, fat, sugar, salt (per 100 g and per serving, one toggle); "unknown" shown as a dash, never zero. No judgement words ("healthy", "bad").

## Not built
Food log, calorie goals, meal plans, photo/AI recognition, saved foods, product contributions.

## Gym control
Feature `barcode_scan` can be locked off by the gym. When off, the Intake page shows only protein and water.
