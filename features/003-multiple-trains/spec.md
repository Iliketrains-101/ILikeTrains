# Feature 003 — Multiple Trains

## Overview

Support up to four simultaneous trains on the layout. Each train is independent: its own name, colour, speed, and direction. Trains block each other — a train will stop automatically before entering a tile occupied by another train, and the player resolves deadlocks manually by reversing one of them.

---

## Train Panel (UI)

A fixed panel on the **right edge** of the screen, always visible.

```
┌─────────────────────┐
│  TRAINS             │
│                     │
│  ● Big Engine    ▶  │  ← selected (highlighted)
│  ● Steamy Roller    │
│  ● The Puffster     │
│                     │
│  [+ Add Train]      │
├─────────────────────┤
│  Speed  ━━━●━━  8  │
│  [▶ Start] [⇄ Rev] │
│  [🗑 Remove Train]  │
└─────────────────────┘
```

- **Train list**: up to 4 rows, each showing the train's colour dot, name, and a small arrow icon (▶/⏹) reflecting current state.
- **Add Train button**: disabled (greyed out) when 4 trains exist or when the player hasn't clicked a valid tile yet.
- **Controls section** (bottom of panel, only visible when a train is selected):
  - Speed slider (1–20, same as current)
  - Start / Stop button (toggles, colour-coded green/red)
  - Reverse button (blue, disabled when stopped)
  - Remove Train button (red, with confirmation — click once to arm, second click to confirm, or auto-confirm after 3 s)
- The existing top-bar train controls are **removed**; everything moves into this panel.

---

## Adding a Train

1. Player clicks **+ Add Train** — button enters "placement mode" (cursor changes, panel shows hint text "Click a track tile to place").
2. Player clicks any **track or station tile** that is:
   - Not a switch tile
   - Not currently occupied by another train
3. Train spawns at the clicked tile, `progress = 0`.
4. **Starting direction** is determined by the tile's connections:
   - EW track (or H station) → train faces **West** (`fromSide = East`, moving westward)
   - NS track (or V station) → train faces **South** (`fromSide = North`, moving southward)
5. The new train is immediately selected in the panel.
6. Placement mode is cancelled if the player clicks an invalid tile or presses Escape.

---

## Train Colours

Each train is assigned the next available colour in order. Colours are reused if a train is removed.

| Slot | Colour  | Hex       |
|------|---------|-----------|
| 1    | Red     | `#e74c3c` |
| 2    | Blue    | `#2980b9` |
| 3    | Yellow  | `#f1c40f` |
| 4    | White   | `#ecf0f1` |

The colour is applied to the **locomotive body** (replaces the current fixed dark green). Passenger cars inherit the same colour, slightly darker.

---

## Train Names

Assigned randomly on creation (without repeating until the list is exhausted). Inspired by funny British steam locomotive nicknames:

| | | |
|---|---|---|
| Big Engine | Steamy Roller | The Puffster |
| Sir Tootsalot | Chugsworth | The Iron Biscuit |
| Lord Smokington | Baron Von Puff | The Whistler |
| Boiler McBoilface | Thunderclap | The Flying Kipper |
| Old Wheezington | Clinker | Duchess of Soot |
| Captain Coalbin | Rusty Bumper | The Screaming Kettle |
| Hufflepuffer | Sir Belchington | The Cinder Queen |
| Smokestacks McGee | Wobblesworth | The Grand Toaster |
| Colonel Puffington | Lady Cinderbottom | Old Smokey |
| Ember | The Belching Baron | The Midnight Rambler |

---

## Collision Detection

Trains must not enter a tile occupied by another train.

### Tile occupancy
- `TrackLayer` (or a new `TrainRegistry`) maintains a `Map<tileKey, trainId>` of occupied tiles.
- A train **claims** a tile when it begins entering it (`progress = 0`).
- A train **releases** its previous tile when it claims the next one.
- A train occupies **one tile at a time** (the tile its locomotive is currently traversing). Cars do not claim tiles — only the locomotive does.

### Blocking rule
Before advancing to the next tile, a train checks whether that tile is claimed by another train. If it is:
- The train enters `"blocked"` state (similar to `"waiting_station"`).
- It stops at `progress = 1` of the current tile (at the boundary).
- It polls each frame; when the tile becomes free it resumes automatically.

### Head-on deadlock
If two trains are blocked waiting for each other's tile, neither can resume automatically. The player must select one train and press **Reverse** to break the deadlock.

### No collision with own cars
Car positions are visual only — they do not claim tiles and cannot trigger blocking.

---

## Removing a Train

1. Select the train in the panel.
2. Click **Remove Train**.
3. First click arms the button (turns red, shows "Confirm?").
4. Second click (or 3 s timeout → auto-confirm) destroys the train:
   - Loco and car sprites are destroyed.
   - Tile occupancy is released.
   - Station occupancy is released if the train was dwelling.
   - The train is removed from the panel list.
5. If no trains remain, the panel shows only **+ Add Train**.

---

## Data Model Changes

### `Train`
- Add `id: string` (e.g. `"train_0"`)
- Add `name: string`
- Add `colour: number` (Phaser hex)
- Add state `"blocked"` to `TrainState`
- Expose `currentTileKey(): string` for occupancy queries
- Accept a `TrainRegistry` reference for tile-claim calls

### `TrainRegistry` (new class)
- Owns `Map<tileKey, string>` (tile → trainId)
- `claim(key, trainId)` — returns `false` if already claimed by a different train
- `release(key)` — removes claim
- Passed to all `Train` instances

### `GameScene`
- Replaces single `train: Train` with `trains: Train[]`
- Adds `TrainRegistry` instance
- Removes top-bar DOM controls
- Adds the `TrainPanel` DOM element (or Phaser-based UI)

---

## Edge Cases

| Situation | Behaviour |
|-----------|-----------|
| Click switch tile to place | Rejected — flash hint text |
| Click occupied tile to place | Rejected — flash hint text |
| Train deleted while at_station | Station released, tile released |
| Train deleted while blocked | Blocked tile released; waiting train resumes |
| Train deleted while cars are on a station | No effect (cars don't occupy stations) |
| 4 trains exist | Add Train button disabled |
| All 4 colours taken, one removed | Released colour becomes available for next add |
