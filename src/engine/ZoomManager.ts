const ZOOM_LEVELS = [1.0, 0.5, 0.125] as const;
const ZOOM_LABELS = ["1×", "½×", "⅛×"] as const;

export class ZoomManager {
  private levelIndex = 0;

  get zoomFactor(): number { return ZOOM_LEVELS[this.levelIndex]; }
  get label(): string { return ZOOM_LABELS[this.levelIndex]; }
  get isOverview(): boolean { return this.levelIndex === 2; }

  zoomIn(scene: Phaser.Scene, pointer?: Phaser.Input.Pointer): void {
    if (this.levelIndex === 0) return;
    this.applyZoom(scene, this.levelIndex - 1, pointer);
  }

  zoomOut(scene: Phaser.Scene, pointer?: Phaser.Input.Pointer): void {
    if (this.levelIndex === ZOOM_LEVELS.length - 1) return;
    this.applyZoom(scene, this.levelIndex + 1, pointer);
  }

  cycleForward(scene: Phaser.Scene, pointer?: Phaser.Input.Pointer): void {
    this.applyZoom(scene, (this.levelIndex + 1) % ZOOM_LEVELS.length, pointer);
  }

  private applyZoom(
    scene: Phaser.Scene,
    newIndex: number,
    pointer?: Phaser.Input.Pointer
  ): void {
    const cam     = scene.cameras.main;
    const newZoom = ZOOM_LEVELS[newIndex];

    const inBounds = pointer
      && pointer.x >= 0 && pointer.x <= scene.scale.width
      && pointer.y >= 0 && pointer.y <= scene.scale.height;

    let anchorWorldX: number;
    let anchorWorldY: number;
    let anchorScreenX: number;
    let anchorScreenY: number;

    if (inBounds && pointer) {
      anchorWorldX  = pointer.worldX;
      anchorWorldY  = pointer.worldY;
      anchorScreenX = pointer.x;
      anchorScreenY = pointer.y;
    } else {
      anchorScreenX = scene.scale.width  / 2;
      anchorScreenY = scene.scale.height / 2;
      anchorWorldX  = cam.scrollX + anchorScreenX / cam.zoom;
      anchorWorldY  = cam.scrollY + anchorScreenY / cam.zoom;
    }

    cam.setZoom(newZoom);
    cam.scrollX = anchorWorldX - anchorScreenX / newZoom;
    cam.scrollY = anchorWorldY - anchorScreenY / newZoom;

    this.levelIndex = newIndex;
  }
}
