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

## What Upto is NOT

- Not a social fitness tracker (no GPS live-tracking, no activity feed)
- Not an AllTrails clone (route discovery is a supporting feature, not the product)
- Not a gear marketplace
