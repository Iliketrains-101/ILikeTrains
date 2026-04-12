# ADR-001: Use Phaser 3 as the game framework

**Date:** 2026-04-09
**Status:** Accepted

## Context
We need a game framework for a browser-based 2D tile game with a scrollable map, input handling, and a game loop.

## Decision
Use **Phaser 3**.

## Reasons
- Built-in game loop, canvas renderer, camera/scroll system, and input manager — all things we need
- Mature, well-documented, large community
- Works well with TypeScript
- Scales to our future needs (multiple scenes, tilemaps, animations)

## Alternatives considered
- **Plain Canvas API** — more control, but we'd rebuild what Phaser gives for free
- **Three.js** — overkill for 2D; adds complexity we don't need yet
- **PixiJS** — good renderer but no game loop or input; we'd need more glue code

## Consequences
- Bundle size is larger (~1MB) but acceptable for a browser game
- We depend on Phaser's scene lifecycle — all game subsystems receive `scene` as a dependency
