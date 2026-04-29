---
type: feature
status: shipped
related: [src/services/what3words.ts, src/components/what3words/, src/components/forms/AdventureLocationStep.tsx]
tags: [what3words, location, safety, emergency]
---

# What3words Integration

3m × 3m precision location addresses (e.g. `///filled.count.soap`) for parking, primary, and emergency-exit points. Critical for emergency services — NZ SAR and Police both accept w3w.

## Why w3w matters here

Upto is a safety-critical app. Lat/lng pairs are error-prone over voice/SMS; w3w addresses are designed for voice clarity and universal phonetics. We show **both** coordinates and 3-word address side-by-side — never rely on one alone.

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `What3wordsInput` | `src/components/what3words/What3wordsInput.tsx` | Accepts lat/lng OR 3-word string, auto-detects, validates, suggests |
| `LocationDisplay` | `src/components/what3words/LocationDisplay.tsx` | Side-by-side coordinate + w3w rendering, copy buttons, voice pronunciation, emergency-mode high-contrast |
| `EmergencyLocationShare` | `src/components/what3words/EmergencyLocationShare.tsx` | Modal for share-via-SMS/email/phone during incidents |

## Service wrapper

`src/services/what3words.ts` wraps `@what3words/api`:
- `coordsToWords(lat, lng)` / `wordsToCoords(words)`
- Client-side cache to avoid duplicate lookups
- Input validation (3-word regex, WGS84 bounds)
- Offline detection — degrades gracefully, hides w3w UI if no key or no network
- Rate-limit guard

## API key

- `VITE_WHAT3WORDS_API_KEY` — from [developer.what3words.com](https://developer.what3words.com/)
- Frontend-only since the library is client-side; no backend proxy
- App functions (reduced) if the key is missing — coords still work, w3w fields hide

## Wizard integration

`AdventureLocationStep.tsx` collects three w3w-powered locations:
1. **Parking** — where the group leaves their car
2. **Primary** — main activity location (summit, hut, lake)
3. **Emergency exit** — planned bail-out point

Each is saved on the TripLink and rendered in the public/emergency views.

## Header emergency button

Always-accessible button in `Header.tsx` opens `EmergencyLocationShare` with the user's current GPS position — works even outside the wizard.

## Known gaps

- No offline-cached w3w lookup (if network drops mid-trip, new addresses can't resolve)
- Voice pronunciation uses `SpeechSynthesis` — browser-dependent quality
