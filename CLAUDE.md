# ILikeTrains — Claude Code Project Context

## What this is
A browser-based railroad building and train running game. Single player. Inspired by Transport Tycoon and model railway planning software. Built for fun.

## Tech Stack
- **Phaser 3** — game framework (canvas, game loop, input, camera)
- **TypeScript** — strict mode
- **Vite** — dev server and bundler

## Project Structure
```
src/
  main.ts          # Entry point, Phaser config
  engine/          # Camera, input abstractions, core loop helpers
  game/            # Game logic: Grid, Track, Train, GameScene
  ui/              # HUD elements, menus (future)
assets/            # Sprites, fonts (future)
features/          # One subfolder per upcoming feature
docs/
  decisions/       # Architecture Decision Records (ADRs)
```

## Conventions
- One class per file
- Phaser scene is the glue — pass `scene` into subsystems
- Grid coordinates: `col` (x) and `row` (y), integer tile positions
- World coordinates: pixel positions, center of tile = `col * TILE_SIZE + TILE_SIZE/2`
- Track sides: 0=North 1=East 2=South 3=West
- Never mutate Phaser internals directly — always go through the class API

## Dev Commands
```
npm install
npm run dev      # http://localhost:3000
npm run build
```

## Current State (v0.1)
- Scrollable tile grid
- Click to place track segments (6 shapes: NS, EW, NE, NW, SE, SW)
- One train that moves along track, stops at end, reverses on right-click

## Architectural decisions
See `docs/decisions/` for ADRs.
