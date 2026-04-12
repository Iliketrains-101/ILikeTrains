/**
 * Handles grid scrolling via middle-mouse drag or arrow keys.
 */
export class Camera {
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private scrollStart = { x: 0, y: 0 };

  constructor(private scene: Phaser.Scene) {
    this.registerPointerDrag();
  }

  private registerPointerDrag(): void {
    const cam = this.scene.cameras.main;

    this.scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown()) {
        this.isDragging = true;
        this.dragStart = { x: p.x, y: p.y };
        this.scrollStart = { x: cam.scrollX, y: cam.scrollY };
      }
    });

    this.scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        cam.scrollX = this.scrollStart.x - (p.x - this.dragStart.x);
        cam.scrollY = this.scrollStart.y - (p.y - this.dragStart.y);
      }
    });

    this.scene.input.on("pointerup", () => {
      this.isDragging = false;
    });
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
    const cam = this.scene.cameras.main;
    const speed = 8;

    if (cursors.up.isDown)    cam.scrollY -= speed;
    if (cursors.down.isDown)  cam.scrollY += speed;
    if (cursors.left.isDown)  cam.scrollX -= speed;
    if (cursors.right.isDown) cam.scrollX += speed;
  }
}
