# ILikeTrains

A browser-based railroad building and train running game. Single player. Inspired by Transport Tycoon and model railway planning software. Built for fun.

## Play

```
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

## What you can do

- **Draw track** — click tiles to lay track segments (straight, curves, junctions)
- **Build stations** — place 2-tile station units with auto-generated Old English names
- **Run trains** — add up to 4 trains, each with their own name, colour, and speed
- **Manage trains** — use the right-side panel to start/stop, reverse, and remove trains
- **Toggle switches** — select a junction tile and press Space to flip it
- **Delete tiles** — select a tile and press D (or the Delete button)
- **Scroll** — arrow keys or middle-mouse drag to pan the 80×80 tile grid

## Controls

| Input | Action |
|---|---|
| Click empty tile | Place active track tool |
| Click existing tile | Select it |
| Space | Toggle switch on selected tile |
| D | Delete selected tile |
| A / S | Cycle through track tools |
| Arrow keys | Scroll camera |
| Middle-mouse drag | Pan camera |

## Tech stack

- [Phaser 3](https://phaser.io/) — game framework
- [TypeScript](https://www.typescriptlang.org/) — strict mode
- [Vite](https://vitejs.dev/) — dev server and bundler

## Project structure

```
src/
  main.ts          # Entry point, Phaser config
  engine/          # Camera, input abstractions
  game/            # Grid, Track, Train, Station, GameScene
assets/            # Sprites, fonts (future)
features/          # One subfolder per feature, with spec
docs/decisions/    # Architecture Decision Records (ADRs)
```

## Feature status

| # | Feature | Status |
|---|---|---|
| 001 | Lay track + run one train | done |
| 002 | Track switches (junctions) | done |
| 002b | Tile selection + delete | done |
| 002c | Realistic track rendering | done |
| 003 | Multiple trains | done |
| 004 | Stations | done |
| 005 | Save & load layout | planned |
| 006 | Industries + cargo | planned |
| 007 | Visual style overhaul | planned |
| 008 | Sound | planned |
| 009 | Zoom levels | planned |
