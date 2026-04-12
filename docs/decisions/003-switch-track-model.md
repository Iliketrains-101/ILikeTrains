# ADR-003: Switch track data model — toe + two branches

**Date:** 2026-04-09
**Status:** Accepted

## Context
Switch tracks (turnouts) split one track into two. We need a data model that works with the existing tile/side system and supports the train choosing a route.

## Decision
A `SwitchSegment` has:
- `entry: Side` — the single "toe" end (where the train chooses)
- `exits: [Side, Side]` — two branch ends (`exits[0]` = straight/default, `exits[1]` = branch)
- `activeExit: Side` — which branch is currently active (player-toggled)

**Train movement rules:**
- Entering from `entry` (toe) → use `activeExit`
- Entering from either branch → always exit through `entry` (trailing movement, no choice)

## Visual
- Active route: full silver rails + sleepers
- Inactive route: dim gray, thin, no sleepers
- Yellow arrow indicator (dot + line + arrowhead) at the toe side, pointing toward `activeExit`
- Slightly darker ballast background to distinguish switches from plain track

## Alternatives considered
- **Three-way T-junction** (symmetric Y, no "toe"): less railroad-like, doesn't model trailing moves
- **Two separate TrackSegments sharing a tile**: breaks the one-segment-per-tile invariant

## Consequences
- `Segment = TrackSegment | SwitchSegment` union type; `isSwitch()` type guard used everywhere
- `exitSideFor(seg, fromSide)` helper in Train encapsulates both regular and switch movement
- 4 switch tool types added to toolbar: toe=W (exits E+S, E+N) and toe=N (exits S+E, S+W)
- Clicking a switch tile always toggles it, regardless of active tool
