import type { ZoomManager } from "../engine/ZoomManager";

export class ZoomHUD {
  private bg:   Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private hit:  Phaser.GameObjects.Rectangle;

  private readonly W = 40;
  private readonly H = 24;
  private readonly x: number;
  private readonly y: number;

  constructor(scene: Phaser.Scene, private zoom: ZoomManager, onCycle: () => void) {
    this.x = window.innerWidth  - this.W - 10;
    this.y = window.innerHeight - this.H - 10;

    this.bg = scene.add.graphics().setScrollFactor(0).setDepth(10);

    this.text = scene.add
      .text(this.x + this.W / 2, this.y + this.H / 2, zoom.label, {
        fontSize: "13px", fontFamily: "monospace", color: "#ffffff",
      })
      .setScrollFactor(0).setDepth(10).setOrigin(0.5, 0.5);

    this.hit = scene.add
      .rectangle(this.x, this.y, this.W, this.H)
      .setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true })
      .setOrigin(0, 0);

    this.hit.on("pointerdown", onCycle);
    this.hit.on("pointerover", () => this.redrawBg(true));
    this.hit.on("pointerout",  () => this.redrawBg(false));

    this.redrawBg(false);
  }

  update(): void {
    this.text.setText(this.zoom.label);
  }

  destroy(): void {
    this.bg.destroy();
    this.text.destroy();
    this.hit.destroy();
  }

  private redrawBg(hover: boolean): void {
    this.bg.clear();
    this.bg.fillStyle(hover ? 0x444444 : 0x222222, 0.85);
    this.bg.fillRoundedRect(this.x, this.y, this.W, this.H, 4);
    this.bg.lineStyle(1, 0x666666, 1);
    this.bg.strokeRoundedRect(this.x, this.y, this.W, this.H, 4);
  }
}
