# ILikeTrains — Game Design Document

## Vision
A fun, relaxing browser game about building railroads and running trains. Inspired by Transport Tycoon and model railway planning software. Starts simple, grows gradually.

## v1 Scope (current)
- Blank scrollable tile grid
- Player places track tiles (6 segment types)
- One train runs along the track
- Train stops at end of track; player triggers reversal
- Train loops forever on a closed loop

## Planned Features (backlog)
- Multiple trains
- Track switches (junctions) — player-controlled direction
- Stations
- Industries and cargo
- Economy (revenue, costs)
- Improved visual style / possible isometric view
- Sound

## Core Rules
- Tracks snap to grid
- Each tile holds one track segment connecting exactly two sides
- A train always enters from one side and exits the other
- At a switch tile: player chooses which of two exit paths is active
- End of track: train stops, waits for player to depart it (reverses direction)
- Closed loop: train runs indefinitely

## Controls
| Action | Input |
|---|---|
| Place track | Left-click tile |
| Scroll map | Middle-mouse drag or arrow keys |
| Reverse stopped train | Right-click |
| Select tool | Toolbar buttons |
