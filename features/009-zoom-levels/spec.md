# Feature 009 — Zoom Levels

## Summary

Three fixed zoom levels, switchable via keyboard or a persistent on-screen button.
At the farthest zoom the renderer switches to a simplified "overview" mode so the
map stays legible at 8 px per tile.

---

## Zoom Levels

| Level | Name | Tile size | Camera zoom |
|-------|------|-----------|-------------|
| 1 | Near | 64 px | 1.0× |
| 2 | Mid  | 32 px | 0.5× |
| 3 | Far  | 8 px  | 0.125× |

Near (1.0×) is the current default view. The tile size is logical — it is the
result of Phaser's camera zoom applied to the 64 px world tile.

---

## Interaction

### Keyboard
- **O** — zoom out (Near → Mid → Far, clamps at Far)
- **P** — zoom in  (Far → Mid → Near, clamps at Near)

### Zoom indicator (lower-right corner)
- A small fixed HUD element displays the current level: `1×` / `½×` / `⅛×`
- Clicking it cycles forward through the three levels (Near → Mid → Far → Near)
- Always visible, never scrolls with the map

---

## Zoom Anchor

Zoom centres on the **mouse cursor position** at the moment the key or button is
pressed. The world point under the cursor stays stationary on screen.

If the cursor is outside the game canvas (e.g. zoom triggered via HUD click) the
anchor falls back to the screen centre.

---

## Camera Clamping

At every zoom level the camera must be clamped so the viewport cannot scroll
outside the 80 × 80 tile grid. Clamping is re-evaluated immediately after each
zoom transition.

---

## Rendering Modes

### Near and Mid (64 px and 32 px tiles)
Standard rendering — ballast, sleepers, two-tone rails, switch fading, station
name labels — unchanged. Phaser's camera zoom handles the scaling automatically.

### Far (8 px tiles) — Overview Mode

At 8 px per tile the detailed sprite graphics become unreadable. The renderer
switches to a simplified schematic overlay drawn in **screen space** (so line
weights stay consistent regardless of zoom):

| Element | Appearance |
|---------|------------|
| Straight track (NS, EW) | 2 px line, mid-grey (`#888888`) |
| Curve track (NE, NW, SE, SW) | 2 px arc following the curve direction, mid-grey |
| Switch (any orientation) | Same as track; active branch shown, inactive branch omitted |
| Station tile (entrance or second) | 3 px line or filled rect, blue (`#4488FF`) |
| Station name label | **Hidden** |
| Train locomotive | Filled circle, 5 px diameter, train's assigned colour |
| Train cars | Not shown |
| Grid lines | Not shown |

The simplified overlay is drawn on top of a plain dark background matching the
normal empty-tile colour. The existing Phaser tile graphics are hidden while in
overview mode.

---

## Track Interaction in Overview Mode

Construction, selection, deletion, and switch-toggling work at all zoom levels
including Far. Mouse clicks map from screen → world coordinates using the camera's
existing `getWorldPoint` utility, so tile targeting stays accurate.

---

## Transition

Zoom changes are **instant** — no tween or animation.

---

## Out of Scope

- Fractional / continuous zoom (mouse-wheel pinch)
- Per-zoom scroll speed changes
- Minimap (separate feature)
- Saving the zoom level as part of the layout (save/load feature handles its own
  scope)
