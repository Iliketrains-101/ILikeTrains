# ADR-004: Realistic track rendering — layered ballast, sleepers, two-tone rails

**Date:** 2026-04-10
**Status:** Accepted

## Context
The initial track rendering was a single brown rectangle with a thin centerline and 3 gray sleepers. It read as functional but not visually convincing. The goal was to upgrade to something that feels like a real top-down railroad without losing the flat-vector aesthetic.

## Decision

### Drawing order (painter's algorithm, bottom to top)
1. **Ballast bed** — warm gravel fill (`0x9b8b72` for track, slightly darker `0x887a62` for switches)
2. **Sleepers** — 5 per tile, each drawn as two overlapping lines: wide dark oak base (`0x3d2b15`) + narrower lighter highlight (`0x5e4122`) suggesting a worn top face
3. **Rail bases** — wide (3px) gray (`0x7c7c7c`) I-beam web/flange, at `RAIL_OFFSET=6` from centerline
4. **Rail heads** — narrow (1.5px) bright silver (`0xd0d0d0`) on top of the base, same path

### Switch inactive route
- Drawn before sleepers and active rails so it's always beneath them
- Thin (2px) rust-brown rails (`0x7a5535`) at 42% alpha — clearly a possible path, but obviously unused
- No sleepers, no ballast redraw — reads as "track is there but cold"
- Updates immediately on toggle (full `redraw()` on every state change)

### Straight vs curved
- Straight: perpendicular sleepers evenly spaced along track vector; rail lines offset by `±RAIL_OFFSET`
- Curved: sleepers are radial lines at arc positions; rails are arcs at `half ± RAIL_OFFSET` radius

## Alternatives considered
- **Textured sprites**: more realistic but breaks the vector aesthetic and adds asset pipeline complexity
- **Inner ballast strip** (darker fill between rails): adds visual richness but requires clipping/masking for curves — deferred

## Consequences
- `SLEEPER_COUNT` increased from 3 → 5; `SLEEPER_HALF=10` added
- `drawRoute()` unified helper removed; replaced with `drawSleepers()`, `drawActiveRails()`, `drawInactiveRails()` each with straight/curved variants
- All drawing constants consolidated at top of `Track.ts` for easy tuning
