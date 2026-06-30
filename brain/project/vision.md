---
type: project
status: shipped
tags: [vision, product]
---

# Vision

Upto is an **outdoor trip planning and safety app** for New Zealand recreationalists and outdoor professionals (expanding globally). The product centres on **TripLinks** — detailed trip plans with route info, emergency contacts, check-in schedules, and precise what3words locations — shared with contacts who need to know *where* you are and *when* to expect you back.

## Users

| Segment | Needs | Priority |
|---------|-------|----------|
| NZ day-hikers | Quick plans, DOC track data, what3words for rescue | ★★★ Must |
| NZ multi-day trampers | Huts, check-in schedules, emergency escalation | ★★★ Must |
| Outdoor guides (IFMGA) | Professional time estimates (GuidePace), shareable with clients | ★★ Should |
| Climbers / skiers | Technical route time estimates, hazard marking | ★★ Should |
| International users | OSM-backed trails outside NZ | ★ Could |

## Safety-first posture

Upto is a **safety-critical app**. Design decisions favour accuracy, graceful degradation, and emergency-service-friendly outputs:

- Location data uses what3words for 3m×3m precision (compatible with NZ emergency services)
- DOC alerts are **never cached** — always fetched live
- The app must work usable without an internet connection (planning offline, recent plans cached)
- Coordinate + 3-word format shown together — never rely on one alone

## North star

> A tramper in Tongariro shares a TripLink with their partner. Partner gets notified if the check-in at Ketetahi Hut is missed. Search & Rescue, if called, gets exact hut name, what3words parking address, and planned emergency exit within two taps.

## Direction (see [ADR 010](../decisions/010-product-direction-safety-first-social-leash.md))

Upto is **safety-first, social-curious**. The safety/check-in tool is the product and the
homepage message. A *thin* social layer is legitimate only where it reduces real
coordination friction for a trip:

- **In scope:** invite / accept / join a TripLink (replaces the pre-mission group chat);
  a private post-trip recap card.
- **Next major bet:** live GPS — a watcher seeing the traveller's position during an
  active trip. Framed as **safety**, delivered via a Capacitor mobile shell
  ([ADR 011](../decisions/011-capacitor-mobile-shell.md)). Starts only after the safety
  core is hardened.
- **Parked:** a "squad feed" (needs its own design session before any build).

## What Upto is NOT

- Not a social network — **no activity feed, no leaderboards, no KOMs/segments, no
  streaks, no viral growth loop**. (The full "Anti-Strava" spec is explicitly rejected —
  see [squad-social-vision.md](../features/squad-social-vision.md).)
- Not an AllTrails clone (route discovery is a supporting feature, not the product)
- Not a gear marketplace
