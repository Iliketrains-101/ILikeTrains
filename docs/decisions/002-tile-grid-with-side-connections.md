# ADR-002: Tile grid with side-based track connections

**Date:** 2026-04-09
**Status:** Accepted

## Context
We need a data model for track layout on a grid, including future support for switches.

## Decision
Each tile stores a track segment as a pair of **sides** it connects (e.g. `[North, South]` for a straight NS track). Sides are numbered 0–3 (N/E/S/W).

A train always enters from one side and exits the other. For switch tiles (future), a tile can hold multiple connection pairs and the active one is player-selected.

## Key invariants
- A tile holds exactly one segment (or nothing)
- A segment connects exactly two sides
- A train's `fromSide` is always the opposite of the side it exited the previous tile from

## Why not a node/edge graph?
A side-based tile model naturally supports switches (one entry, two possible exits), is easy to render (each tile draws its own rails), and maps cleanly to a grid UI where players click tiles.

## Consequences
- `OPPOSITE` and `NEIGHBOR_DELTA` lookup tables are central to train movement
- Switches will extend this model by allowing a tile to hold two connection pairs
