import { TILE_SIZE, tileToWorld, curveCorner, tileKey } from "./Grid";
import { TrackLayer, Segment, Side, OPPOSITE, NEIGHBOR_DELTA, isSwitch, isStation } from "./Track";
import { TrainRegistry } from "./TrainRegistry";

export type TrainState = "moving" | "stopped" | "at_station" | "waiting_station" | "blocked";

// ── Train geometry constants ───────────────────────────────────────────────────
const CAR_SPACING   = 48;  // px, center-to-center between consecutive units
const NUM_CARS      = 2;
const STOP_PROGRESS = (CAR_SPACING * NUM_CARS / 2) / TILE_SIZE; // = 0.75

// ── History entry ─────────────────────────────────────────────────────────────
interface TileHistoryEntry { col: number; row: number; fromSide: Side; }

export class Train {
  private col: number;
  private row: number;
  private fromSide: Side;
  private progress: number = 0;
  private state: TrainState = "moving";
  private speed = 0.006; // tile-fractions per ms

  private container: Phaser.GameObjects.Container;
  private cars: Phaser.GameObjects.Container[] = [];
  private tileHistory: TileHistoryEntry[] = [];

  private stationTimer = 0;
  private pendingEntry: { col: number; row: number; fromSide: Side; stationId: string } | null = null;
  private dweltAtStationId: string | null = null;

  // Derived colour variants
  private readonly darkColour: number;
  private readonly carColour: number;
  private readonly carDarkColour: number;

  private overviewDot: Phaser.GameObjects.Graphics;
  private overviewMode = false;

  // All tiles currently claimed by this train (loco + car positions)
  private claimedTiles = new Set<string>();

  constructor(
    private scene: Phaser.Scene,
    private trackLayer: TrackLayer,
    private registry: TrainRegistry,
    readonly id: string,
    readonly trainName: string,
    readonly colour: number,
    startCol: number,
    startRow: number,
    startFromSide: Side
  ) {
    this.col       = startCol;
    this.row       = startRow;
    this.fromSide  = startFromSide;

    this.darkColour    = this.darken(colour, 0.67);
    this.carColour     = this.darken(colour, 0.80);
    this.carDarkColour = this.darken(colour, 0.53);

    // Claim starting tile
    const startKey = tileKey(this.col, this.row);
    this.registry.claim(startKey, this.id);
    this.claimedTiles.add(startKey);

    this.overviewDot = this.scene.add.graphics().setDepth(6).setVisible(false);
    this.container = this.buildLoco();
    for (let i = 0; i < NUM_CARS; i++) this.cars.push(this.buildCar());
    this.draw();
  }

  get tileCol(): number { return this.col; }
  get tileRow(): number { return this.row; }
  get trainState(): TrainState { return this.state; }
  get currentSpeed(): number { return Math.round(this.speed * 1000); }

  setSpeed(tilesPerSecond: number): void {
    this.speed = tilesPerSecond / 1000;
  }

  start(): void {
    if (this.state !== "stopped") return;
    this.state = "moving";
  }

  stop(): void {
    if (this.state === "stopped") return;
    this.pendingEntry = null;
    this.state = "stopped";
  }

  reverse(): void {
    if (this.state === "stopped") return;
    const seg = this.trackLayer.get(this.col, this.row);
    if (!seg) return;
    const exitSide    = this.exitSideFor(seg, this.fromSide);
    this.fromSide     = exitSide;
    this.progress     = 1 - this.progress;
    this.tileHistory  = [];
    this.pendingEntry = null;
    this.state        = "moving";
    this.updateOccupancy(); // history cleared → release old car tiles
    this.draw();
  }

  update(delta: number): void {
    if (this.state === "at_station") {
      this.stationTimer -= delta;
      if (this.stationTimer <= 0) {
        this.stationTimer = 0;
        this.state = "moving";
      }
      this.draw();
      return;
    }

    if (this.state === "waiting_station") {
      if (this.pendingEntry && !this.trackLayer.isStationOccupied(this.pendingEntry.stationId)) {
        this.doEnterStation();
      }
      this.draw();
      return;
    }

    if (this.state === "blocked") {
      // Retry advancing — succeeds once the blocking train moves away
      this.advanceToNextTile();
      this.draw();
      return;
    }

    if (this.state !== "moving") return;

    this.progress += this.speed * delta;

    if (this.progress >= 1) {
      this.progress = 1;
      this.draw();
      this.advanceToNextTile();
    } else {
      // Dwell check: am I on the far tile of a station (past the midpoint)?
      const seg = this.trackLayer.get(this.col, this.row);
      if (seg && isStation(seg) && seg.stationId !== this.dweltAtStationId
          && this.progress >= STOP_PROGRESS) {
        const pd = NEIGHBOR_DELTA[this.fromSide];
        const prevSeg = this.trackLayer.get(this.col + pd.dc, this.row + pd.dr);
        if (prevSeg && isStation(prevSeg) && prevSeg.stationId === seg.stationId) {
          this.progress        = STOP_PROGRESS;
          this.dweltAtStationId = seg.stationId;
          this.stationTimer    = 4000;
          this.state           = "at_station";
        }
      }
      this.updateOccupancy();
      this.draw();
    }
  }

  setOverviewMode(overview: boolean): void {
    this.overviewMode = overview;
    this.container.setVisible(!overview);
    for (const car of this.cars) car.setVisible(!overview);
    this.overviewDot.setVisible(overview);
    if (!overview) this.overviewDot.clear();
    this.draw();
  }

  /** Release all claims and destroy sprites. Call before removing from the scene. */
  destroy(): void {
    for (const key of this.claimedTiles) this.registry.release(key);
    this.claimedTiles.clear();

    // Release station occupancy if the loco is inside a station
    const seg = this.trackLayer.get(this.col, this.row);
    if (seg && isStation(seg)) {
      this.trackLayer.setStationOccupied(seg.stationId, false);
    }

    this.overviewDot.destroy();
    this.container.destroy();
    for (const car of this.cars) car.destroy();
  }

  // ── Movement ──────────────────────────────────────────────────

  private advanceToNextTile(): void {
    const seg = this.trackLayer.get(this.col, this.row);
    if (!seg) { this.state = "stopped"; return; }

    const exitSide     = this.exitSideFor(seg, this.fromSide);
    const d            = NEIGHBOR_DELTA[exitSide];
    const nextCol      = this.col + d.dc;
    const nextRow      = this.row + d.dr;

    if (!this.trackLayer.has(nextCol, nextRow)) { this.state = "stopped"; return; }

    const nextSeg      = this.trackLayer.get(nextCol, nextRow)!;
    const nextFromSide = OPPOSITE[exitSide];
    const nextKey      = tileKey(nextCol, nextRow);

    // ── Collision check: is the next tile claimed by another train? ──
    if (!this.registry.claim(nextKey, this.id)) {
      this.state = "blocked"; // stays at progress = 1; polled each frame
      return;
    }

    // ── Station occupancy check ────────────────────────────────────
    if (isStation(nextSeg) && !isStation(seg)) {
      if (this.trackLayer.isStationOccupied(nextSeg.stationId)) {
        // Release the registry claim we just made — we're not moving yet
        this.registry.release(nextKey);
        this.pendingEntry = { col: nextCol, row: nextRow, fromSide: nextFromSide, stationId: nextSeg.stationId };
        this.state = "waiting_station";
        return;
      }
      this.trackLayer.setStationOccupied(nextSeg.stationId, true);
    }

    // ── Commit the move ────────────────────────────────────────────
    this.tileHistory.unshift({ col: this.col, row: this.row, fromSide: this.fromSide });
    if (this.tileHistory.length > 6) this.tileHistory.pop();

    // Leaving station
    if (isStation(seg) && (!isStation(nextSeg) || nextSeg.stationId !== seg.stationId)) {
      this.trackLayer.setStationOccupied(seg.stationId, false);
      this.dweltAtStationId = null;
    }

    this.col      = nextCol;
    this.row      = nextRow;
    this.fromSide = nextFromSide;
    this.progress = 0;

    // Recompute full-train occupancy; releases tiles the cars no longer cover
    this.updateOccupancy();
  }

  private doEnterStation(): void {
    if (!this.pendingEntry) return;
    const { col, row, fromSide, stationId } = this.pendingEntry;
    const nextKey = tileKey(col, row);

    // Another train might have grabbed this tile while we were waiting
    if (!this.registry.claim(nextKey, this.id)) return;

    this.tileHistory.unshift({ col: this.col, row: this.row, fromSide: this.fromSide });
    if (this.tileHistory.length > 6) this.tileHistory.pop();

    this.trackLayer.setStationOccupied(stationId, true);

    this.col      = col;
    this.row      = row;
    this.fromSide = fromSide;
    this.progress = 0;
    this.state    = "moving";
    this.pendingEntry = null;

    this.updateOccupancy();
  }

  /**
   * Recompute which tiles the entire train (loco + 2 cars) occupies and
   * update registry claims accordingly.
   *
   * Car 1 centre is CAR_SPACING (48 px) behind the loco.
   * Car 2 centre is 2×CAR_SPACING (96 px) behind the loco.
   * Available backwards in the current tile = progress × TILE_SIZE.
   *
   *   tileHistory[0] is always needed (either car 1 or car 2 is always there).
   *   tileHistory[1] is needed only when progress < 0.5
   *                  (car 2 centre extends beyond tileHistory[0]).
   */
  private updateOccupancy(): void {
    const desired = new Set<string>();

    desired.add(tileKey(this.col, this.row));

    if (this.tileHistory.length >= 1) {
      desired.add(tileKey(this.tileHistory[0].col, this.tileHistory[0].row));
    }

    if (this.tileHistory.length >= 2 && this.progress < 0.5) {
      desired.add(tileKey(this.tileHistory[1].col, this.tileHistory[1].row));
    }

    // Release tiles the train no longer covers
    for (const key of this.claimedTiles) {
      if (!desired.has(key)) this.registry.release(key);
    }

    // Claim any newly covered tiles (already-ours claims are no-ops)
    for (const key of desired) {
      this.registry.claim(key, this.id);
    }

    this.claimedTiles = desired;
  }

  private exitSideFor(seg: Segment, fromSide: Side): Side {
    if (isSwitch(seg)) {
      return fromSide === seg.entry ? seg.activeExit : seg.entry;
    }
    const [a, b] = seg.connections;
    return fromSide === a ? b : a;
  }

  // ── Rendering ─────────────────────────────────────────────────

  private computePosRot(
    seg: Segment, progress: number, fromSide: Side
  ): { x: number; y: number; rot: number } {
    const exitSide = this.exitSideFor(seg, fromSide);
    const { x: cx, y: cy } = tileToWorld(seg.col, seg.row);
    const half     = TILE_SIZE / 2;
    const straight = OPPOSITE[fromSide] === exitSide;

    if (straight) {
      const entry = this.sidePoint(cx, cy, fromSide, half);
      const exit  = this.sidePoint(cx, cy, exitSide, half);
      return {
        x:   entry.x + (exit.x - entry.x) * progress,
        y:   entry.y + (exit.y - entry.y) * progress,
        rot: Math.atan2(exit.y - entry.y, exit.x - entry.x),
      };
    }

    const corner = curveCorner(cx, cy, fromSide, exitSide, half);
    const entry  = this.sidePoint(cx, cy, fromSide, half);
    const exit   = this.sidePoint(cx, cy, exitSide, half);

    const startAngle = Math.atan2(entry.y - corner.y, entry.x - corner.x);
    const endAngle   = Math.atan2(exit.y  - corner.y, exit.x  - corner.x);
    let delta = endAngle - startAngle;
    if (delta >  Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    const ang = startAngle + delta * progress;
    return {
      x:   corner.x + half * Math.cos(ang),
      y:   corner.y + half * Math.sin(ang),
      rot: Math.atan2(-Math.sin(ang) * Math.sign(delta), Math.cos(ang) * Math.sign(delta)),
    };
  }

  private getCarPosition(distanceBehind: number): { x: number; y: number; rot: number } | null {
    let remaining = distanceBehind;

    const seg0 = this.trackLayer.get(this.col, this.row);
    if (!seg0) return null;
    const availNow = this.progress * TILE_SIZE;
    if (remaining <= availNow) {
      const p = (availNow - remaining) / TILE_SIZE;
      return this.computePosRot(seg0, p, this.fromSide);
    }
    remaining -= availNow;

    for (const h of this.tileHistory) {
      const seg = this.trackLayer.get(h.col, h.row);
      if (!seg) return null;
      if (remaining <= TILE_SIZE) {
        const p = (TILE_SIZE - remaining) / TILE_SIZE;
        return this.computePosRot(seg, p, h.fromSide);
      }
      remaining -= TILE_SIZE;
    }

    return null;
  }

  private draw(): void {
    const seg = this.trackLayer.get(this.col, this.row);
    if (!seg) return;

    const { x, y, rot } = this.computePosRot(seg, this.progress, this.fromSide);
    this.container.setPosition(x, y).setRotation(rot);

    for (let i = 0; i < this.cars.length; i++) {
      const pos = this.getCarPosition((i + 1) * CAR_SPACING);
      if (pos && !this.overviewMode) {
        this.cars[i].setVisible(true).setPosition(pos.x, pos.y).setRotation(pos.rot);
      } else {
        this.cars[i].setVisible(false);
      }
    }

    if (this.overviewMode) {
      // 5px diameter at zoom 0.125 → 40px world diameter → 20px radius
      this.overviewDot.clear();
      this.overviewDot.fillStyle(this.colour, 1);
      this.overviewDot.fillCircle(x, y, 20);
    }
  }

  // ── Sprite builders ───────────────────────────────────────────

  private buildLoco(): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();

    // ── Wheels ──────────────────────────────────────────────────
    g.fillStyle(0x1a1a1a, 1);
    for (const wx of [-9, 0, 9]) {
      g.fillEllipse(wx, -9, 8, 4);
      g.fillEllipse(wx,  9, 8, 4);
    }
    g.fillStyle(0x444444, 1);
    for (const wx of [-9, 0, 9]) {
      g.fillEllipse(wx, -9, 5, 2);
      g.fillEllipse(wx,  9, 5, 2);
    }
    g.lineStyle(2, 0x555555, 1);
    g.beginPath(); g.moveTo(-13, -9); g.lineTo(13, -9); g.strokePath();
    g.beginPath(); g.moveTo(-13,  9); g.lineTo(13,  9); g.strokePath();

    // ── Cab ─────────────────────────────────────────────────────
    g.fillStyle(this.colour, 1);
    g.fillRect(-18, -8, 12, 16);
    g.fillStyle(this.darkColour, 1);
    g.fillRect(-18, -8, 12, 2);
    g.fillRect(-18,  6, 12, 2);
    g.fillStyle(0x7ec8e3, 1);
    g.fillRect(-16, -7, 5, 5);
    g.fillRect(-16,  2, 5, 5);
    g.lineStyle(1, this.darkColour, 1);
    g.strokeRect(-16, -7, 5, 5);
    g.strokeRect(-16,  2, 5, 5);

    // ── Boiler ──────────────────────────────────────────────────
    g.fillStyle(this.colour, 1);
    g.fillRect(-6, -6, 18, 12);
    g.fillStyle(this.darkColour, 1);
    g.fillRect(-2, -6, 2, 12);
    g.fillRect( 5, -6, 2, 12);
    g.fillStyle(this.colour, 0.5);
    g.fillRect(-6, -6, 18, 3);

    // ── Smokebox ────────────────────────────────────────────────
    g.fillStyle(0x111111, 1);
    g.fillRect(12, -6, 7, 12);
    g.lineStyle(1.5, 0x333333, 1);
    g.strokeCircle(15, 0, 4);

    // ── Chimney ─────────────────────────────────────────────────
    g.fillStyle(0x090909, 1);
    g.fillRect(6, -14, 5, 9);
    g.fillRect(4, -16, 9, 3);

    // ── Steam dome ──────────────────────────────────────────────
    g.fillStyle(0xc8a200, 1);
    g.fillCircle(1, 0, 5);
    g.fillStyle(0xf0d060, 1);
    g.fillCircle(0, -1, 2);

    // ── Safety valve ────────────────────────────────────────────
    g.fillStyle(0xa08000, 1);
    g.fillRect(5, -10, 3, 5);

    // ── Headlamp ────────────────────────────────────────────────
    g.fillStyle(0xf5cba7, 1);
    g.fillCircle(19, 0, 3);
    g.fillStyle(0xfff8dc, 1);
    g.fillCircle(19, 0, 2);

    // ── Rear buffer ─────────────────────────────────────────────
    g.fillStyle(0x333333, 1);
    g.fillRect(-20, -6, 2, 12);
    g.fillStyle(0x555555, 1);
    g.fillRect(-20, -5, 2, 3);
    g.fillRect(-20,  2, 2, 3);

    const c = this.scene.add.container(0, 0, [g]);
    c.setDepth(5);
    return c;
  }

  private buildCar(): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();

    // ── Bogies (wheel trucks) ────────────────────────────────────
    g.fillStyle(0x1a1a1a, 1);
    for (const bx of [-11, 11]) {
      g.fillEllipse(bx, -8, 9, 4);
      g.fillEllipse(bx,  8, 9, 4);
    }
    g.fillStyle(0x444444, 1);
    for (const bx of [-11, 11]) {
      g.fillEllipse(bx, -8, 5, 2);
      g.fillEllipse(bx,  8, 5, 2);
    }
    g.lineStyle(2, 0x555555, 1);
    g.beginPath(); g.moveTo(-15, -8); g.lineTo(15, -8); g.strokePath();
    g.beginPath(); g.moveTo(-15,  8); g.lineTo(15,  8); g.strokePath();

    // ── Car body ─────────────────────────────────────────────────
    g.fillStyle(this.carColour, 1);
    g.fillRect(-14, -7, 28, 14);

    // Roof rails / gutters
    g.fillStyle(this.carDarkColour, 1);
    g.fillRect(-14, -7, 28, 2);
    g.fillRect(-14,  5, 28, 2);

    // Roof highlight (central panel)
    g.fillStyle(this.carColour, 0.4);
    g.fillRect(-14, -5, 28, 4);

    // ── Windows ──────────────────────────────────────────────────
    g.fillStyle(0x7ec8e3, 1);
    for (const wx of [-9, -3, 3, 9]) {
      g.fillRect(wx - 2, -6, 4, 4);
      g.fillRect(wx - 2,  2, 4, 4);
    }
    g.lineStyle(1, this.carDarkColour, 1);
    for (const wx of [-9, -3, 3, 9]) {
      g.strokeRect(wx - 2, -6, 4, 4);
      g.strokeRect(wx - 2,  2, 4, 4);
    }

    // ── Buffers / couplers ───────────────────────────────────────
    g.fillStyle(0x333333, 1);
    g.fillRect(-16, -4, 2, 8);
    g.fillRect( 14, -4, 2, 8);
    g.fillStyle(0x555555, 1);
    g.fillRect(-16, -3, 2, 3);
    g.fillRect(-16,  0, 2, 3);
    g.fillRect( 14, -3, 2, 3);
    g.fillRect( 14,  0, 2, 3);

    const c = this.scene.add.container(0, 0, [g]);
    c.setDepth(5);
    return c;
  }

  private sidePoint(cx: number, cy: number, side: Side, half: number): { x: number; y: number } {
    switch (side) {
      case 0: return { x: cx,        y: cy - half };
      case 1: return { x: cx + half, y: cy        };
      case 2: return { x: cx,        y: cy + half };
      case 3: return { x: cx - half, y: cy        };
    }
  }

  /** Multiply each RGB channel by factor (clamp 0–255). */
  private darken(hex: number, factor: number): number {
    const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) * factor));
    const g = Math.min(255, Math.floor(((hex >>  8) & 0xff) * factor));
    const b = Math.min(255, Math.floor(( hex        & 0xff) * factor));
    return (r << 16) | (g << 8) | b;
  }
}
