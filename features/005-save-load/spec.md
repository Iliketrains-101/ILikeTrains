# Feature 005 — Save & Load Layout

## Overview

The player can save the complete game state to `localStorage` and restore it later. Saves are named automatically by date and time. Multiple save slots are supported (unlimited). A modal overlay lists all saves and lets the player load or delete them.

---

## Storage

- **Medium**: `localStorage` (survives browser restarts, cleared only if the user clears site data).
- **Size concern**: A full 80×80 grid of track is theoretical maximum ~6 400 segments × ~120 bytes ≈ ~750 KB. localStorage limit is ~5 MB per origin. Realistic layouts are far smaller; no problem expected.
- **Key pattern**: `iliktrains:save:<ISO timestamp>` e.g.
  `iliktrains:save:2026-04-11T14:32:05.412Z`
- **Index key**: `iliktrains:index` — a JSON array of ISO timestamp strings kept in insertion order, used to list slots without scanning all keys.

---

## What Gets Saved

Every save slot is a single JSON object:

```jsonc
{
  "savedAt": "2026-04-11T14:32:05.412Z",   // ISO string (also the key suffix)
  "displayName": "2026-04-11  14:32:05",   // human-readable label in the modal
  "segments": [ /* see below */ ],
  "trains": [ /* see below */ ]
}
```

### Segment record
Each entry in `segments` is a plain object derived from the in-memory `Segment` union:

```jsonc
// TrackSegment
{ "type": "track", "col": 5, "row": 3, "connections": [0, 2] }

// SwitchSegment
{ "type": "switch", "col": 7, "row": 4,
  "entry": 3, "exits": [1, 2], "activeExit": 1 }

// StationSegment
{ "type": "station", "col": 10, "row": 6,
  "connections": [1, 3], "stationId": "st0",
  "role": "entrance", "name": "Aldermere" }
```

Station occupancy is **not** saved — it is derived from train positions on load.

### Train record
```jsonc
{
  "id": "train_0",
  "name": "Big Engine",
  "colour": 16073788,       // 0xe74c3c as decimal
  "col": 5, "row": 3,
  "fromSide": 1,
  "progress": 0.42,
  "speed": 8,               // tiles per second
  "state": "moving"         // "moving" | "stopped" (at_station / blocked → saved as "stopped")
}
```

Trains in `at_station`, `waiting_station`, or `blocked` states are saved as `"stopped"` — they resume cleanly from rest when loaded.

---

## UI

### Save button

- Added to the **toolbar** alongside the track/switch/station buttons, separated by a divider on the right end.
- Label: `💾 Save`
- Clicking it saves immediately (no confirmation) and briefly flashes green ("Saved!") for 1 second.

### Load button

- Also in the toolbar.
- Label: `📂 Load`
- Clicking it opens the **Load modal**.

### Load modal

Full-screen semi-transparent overlay, centred card:

```
╔══════════════════════════════════╗
║  Saved Layouts                   ║
╠══════════════════════════════════╣
║  2026-04-11  14:32:05  [Load] [🗑]║
║  2026-04-11  09:15:44  [Load] [🗑]║
║  2026-04-10  21:03:11  [Load] [🗑]║
║                                  ║
║  (no saves yet)                  ║  ← shown when list is empty
╠══════════════════════════════════╣
║                        [Cancel]  ║
╚══════════════════════════════════╝
```

- Slots are listed **newest first**.
- **Load**: triggers the warning flow (see below).
- **🗑 Delete**: removes that slot from localStorage and the index immediately, list refreshes.
- **Cancel**: closes the modal, nothing changes.
- Modal can also be dismissed by pressing **Escape** or clicking the backdrop.

### Load warning

When the player clicks Load on a slot:

```
╔══════════════════════════════════╗
║  ⚠  Replace current layout?      ║
║                                  ║
║  This will clear all tracks and  ║
║  trains currently on the board.  ║
║                                  ║
║        [Cancel]   [Load anyway]  ║
╚══════════════════════════════════╝
```

- **Cancel**: returns to the slot list.
- **Load anyway**: clears the scene and restores the save.
- Warning is **skipped** if the board is empty (no segments, no trains).

---

## Save Flow

1. Player clicks `💾 Save`.
2. Serialise current state → JSON string.
3. Generate ISO timestamp → storage key.
4. Write JSON to `localStorage[key]`.
5. Prepend timestamp to the index array; write index back.
6. Flash the Save button green for 1 s.

## Load Flow

1. Player clicks `📂 Load` → modal opens.
2. Player picks a slot → warning shown (unless board is empty).
3. Player confirms → modal closes.
4. **Clear phase**: destroy all train sprites and containers; clear `TrackLayer`; reset `TrainRegistry`; remove any station name texts.
5. **Restore phase**:
   a. Rebuild segments from the `segments` array (call existing `TrackLayer.add`, `addSwitch`, `addStation` — using the saved `stationId` and `name` so station texts are recreated correctly).
   b. Recreate each train from the `trains` array (position, colour, name, speed, state).
   c. Rebuild tile occupancy in `TrainRegistry` from restored train positions.
6. Panel and controls update to reflect restored state.

---

## Data Model Changes

### New: `SaveManager` class (`src/game/SaveManager.ts`)
Owns all serialisation/deserialisation logic:
- `save(segments, trains): void`
- `listSlots(): SaveMeta[]` — reads the index, returns `{ key, displayName }[]` newest first
- `load(key): SaveData | null`
- `deleteSlot(key): void`

### `TrackLayer`
- Needs a `getSegments(): Segment[]` method (expose the internal map as an array).
- `addStation` needs to accept an optional `stationId` and `name` override so restored stations keep their original IDs and names.

### `GameScene`
- Adds `SaveManager` instance.
- Adds Save and Load toolbar buttons.
- Adds modal DOM overlay (hidden by default, shown on Load click).
- `clearAll()` helper: tears down everything cleanly before a load.

---

## Edge Cases

| Situation | Behaviour |
|-----------|-----------|
| localStorage full | Catch `QuotaExceededError`; show "Save failed — storage full" message |
| Corrupt/unreadable slot | Show "Could not read save" in slot row; Load button disabled for that slot |
| Save with 0 segments | Allowed — saves an empty layout |
| Delete while modal is open | List refreshes instantly |
| Browser private/incognito | localStorage works per-session only; warn user on first save ("Saves will be lost when this window closes") |
