# Bug — Toolbars zoom with the camera

## Summary

When the player presses O/P or clicks the zoom indicator, the bottom toolbar
and right-side TrainPanel scale up or down along with the game world.
They should remain pixel-perfect at all zoom levels.

## Steps to reproduce

1. Launch the game (zoom starts at 1×).
2. Press **O** to zoom out to ½×.
3. Observe that the toolbar buttons and TrainPanel shrink visibly.
4. Press **O** again to reach ⅛× — both panels become very small.

## Expected behaviour

Toolbar and TrainPanel are fixed UI elements. Their size and position should
be identical at all three zoom levels.

## Root cause

Phaser's camera zoom scales the entire scene, including game objects whose
`scrollFactor` is set to 0. `scrollFactor(0)` prevents scrolling (translation)
but does **not** prevent zoom scaling. The toolbar buttons and HUD label are
Phaser `Graphics` / `Text` objects attached to the main camera, so they shrink
and grow with it.

## Proposed fix

Render all fixed UI in a **dedicated secondary camera** set to `zoom = 1` and
`ignore`-d by the main camera. Alternatively, counter-scale each HUD object by
`1 / zoom` on every zoom transition. The secondary-camera approach is cleaner
and scales to future HUD additions.

## Affected elements

- Bottom toolbar (track / switch / station buttons, A/S key hints)
- Zoom indicator (`ZoomHUD`) — bottom-right corner
- Right-side TrainPanel (DOM overlay, may be unaffected — needs verification)
- Delete button and status text in the toolbar area
