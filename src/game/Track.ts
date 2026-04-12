import { tileKey, TILE_SIZE, tileToWorld, curveCorner } from "./Grid";
import { getRandomStationName } from "./Station";

/**
 * Sides: 0=North  1=East  2=South  3=West
 */
export type Side = 0 | 1 | 2 | 3;

export interface TrackSegment {
  col: number;
  row: number;
  connections: [Side, Side];
}

export interface SwitchSegment {
  col: number;
  row: number;
  /** The single "toe" end – where a train chooses which branch to take. */
  entry: Side;
  /** [straight, branch] – exits[0] is the default/active exit on placement. */
  exits: [Side, Side];
  activeExit: Side;
}

export interface StationSegment {
  col: number;
  row: number;
  connections: [Side, Side];
  stationId: string;
  /** entrance = clicked tile; second = the tile placed automatically beside it. */
  role: "entrance" | "second";
  name: string;
}

export type Segment = TrackSegment | SwitchSegment | StationSegment;

export function isSwitch(seg: Segment): seg is SwitchSegment {
  return "entry" in seg;
}

export function isStation(seg: Segment): seg is StationSegment {
  return "stationId" in seg;
}

export const OPPOSITE: Record<Side, Side> = { 0: 2, 1: 3, 2: 0, 3: 1 };

export const NEIGHBOR_DELTA: Record<Side, { dc: number; dr: number }> = {
  0: { dc: 0, dr: -1 },
  1: { dc: 1, dr: 0 },
  2: { dc: 0, dr: 1 },
  3: { dc: -1, dr: 0 },
};

// ── Drawing constants ──────────────────────────────────────────────────────

const RAIL_OFFSET   = 6;    // distance from track centerline to each rail
const SLEEPER_COUNT = 5;    // sleepers per tile
const SLEEPER_HALF  = 10;   // half-length of a sleeper (perpendicular to track)

// Ballast
const COL_BALLAST    = 0x9b8b72;  // warm gravel
const COL_SW_BALLAST = 0x887a62;  // slightly darker for switches

// Sleepers (wooden ties)
const COL_SLEEPER    = 0x3d2b15;  // dark oak base
const COL_SLEEPER_HL = 0x5e4122;  // lighter top face

// Rails — two-tone: wide base/flange + narrow bright head
const COL_RAIL_BASE  = 0x7c7c7c;
const COL_RAIL_HEAD  = 0xd0d0d0;

// Inactive switch route — rust/brown, faded
const COL_INACT      = 0x7a5535;
const INACT_ALPHA    = 0.42;

// ── Platform colours ──────────────────────────────────────────────────────────
const COL_PLATFORM_SURFACE = 0xcec0ac;
const COL_PLATFORM_ROOF    = 0x8a7e70;
const COL_PLATFORM_EDGE    = 0xf0d040;

export class TrackLayer {
  private segments = new Map<string, Segment>();
  private graphics: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;
  private stationOccupied = new Map<string, boolean>();
  private nameTexts        = new Map<string, Phaser.GameObjects.Text>();
  private nextStationId    = 0;

  constructor(scene: Phaser.Scene) {
    this.scene    = scene;
    this.graphics = scene.add.graphics();
  }

  add(col: number, row: number, connections: [Side, Side]): void {
    this.segments.set(tileKey(col, row), { col, row, connections });
    this.redraw();
  }

  addSwitch(col: number, row: number, entry: Side, exits: [Side, Side]): void {
    this.segments.set(tileKey(col, row), { col, row, entry, exits, activeExit: exits[0] });
    this.redraw();
  }

  /** Place a 2-tile station. Returns false if there is no room. */
  addStation(col: number, row: number, orientation: "h" | "v"): boolean {
    const dc = orientation === "h" ? 1 : 0;
    const dr = orientation === "v" ? 1 : 0;
    const col2 = col + dc;
    const row2 = row + dr;

    if (col2 >= 80 || row2 >= 80) return false;
    if (this.has(col, row) || this.has(col2, row2)) return false;

    const connections: [Side, Side] = orientation === "h" ? [1, 3] : [0, 2];
    const stationId = `st${this.nextStationId++}`;
    const name = getRandomStationName();

    this.segments.set(tileKey(col,  row),  { col,  row,  connections, stationId, role: "entrance", name });
    this.segments.set(tileKey(col2, row2), { col: col2, row: row2, connections, stationId, role: "second", name });
    this.stationOccupied.set(stationId, false);

    // Name text — centered across both tiles, on the platform (north/top side)
    const isH = orientation === "h";
    const tx = isH ? (col + 1) * TILE_SIZE          : col * TILE_SIZE + TILE_SIZE / 2;
    const ty = isH ? row  * TILE_SIZE + 5           : row * TILE_SIZE + 5;
    const text = this.scene.add.text(tx, ty, name, {
      fontSize: "9px", fontFamily: "sans-serif", fontStyle: "bold",
      color: "#1a0e04",
    }).setOrigin(0.5, 0).setDepth(4);
    this.nameTexts.set(stationId, text);

    this.redraw();
    return true;
  }

  isStationOccupied(stationId: string): boolean {
    return this.stationOccupied.get(stationId) ?? false;
  }

  setStationOccupied(stationId: string, occupied: boolean): void {
    this.stationOccupied.set(stationId, occupied);
  }

  remove(col: number, row: number): void {
    const seg = this.segments.get(tileKey(col, row));
    if (seg && isStation(seg)) {
      // Remove both tiles and the name text
      const { stationId } = seg;
      for (const [key, s] of this.segments) {
        if (isStation(s) && s.stationId === stationId) this.segments.delete(key);
      }
      this.stationOccupied.delete(stationId);
      this.nameTexts.get(stationId)?.destroy();
      this.nameTexts.delete(stationId);
    } else {
      this.segments.delete(tileKey(col, row));
    }
    this.redraw();
  }

  toggleSwitch(col: number, row: number): void {
    const seg = this.segments.get(tileKey(col, row));
    if (!seg || !isSwitch(seg)) return;
    seg.activeExit = seg.activeExit === seg.exits[0] ? seg.exits[1] : seg.exits[0];
    this.redraw();
  }

  get(col: number, row: number): Segment | undefined {
    return this.segments.get(tileKey(col, row));
  }

  has(col: number, row: number): boolean {
    return this.segments.has(tileKey(col, row));
  }

  // ── Redraw ────────────────────────────────────────────────────

  private redraw(): void {
    this.graphics.clear();
    for (const seg of this.segments.values()) {
      if (isSwitch(seg))   this.drawSwitch(seg);
      else if (isStation(seg)) this.drawStation(seg);
      else                 this.drawTrack(seg);
    }
  }

  // ── Regular track ─────────────────────────────────────────────

  private drawTrack(seg: TrackSegment): void {
    const { x: cx, y: cy } = tileToWorld(seg.col, seg.row);
    const half = TILE_SIZE / 2;
    const [a, b] = seg.connections;

    // Ballast bed
    this.graphics.fillStyle(COL_BALLAST, 1);
    this.graphics.fillRect(cx - half + 2, cy - half + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    // Sleepers under rails
    this.drawSleepers(cx, cy, a, b, half);

    // Two-tone rails
    this.drawActiveRails(cx, cy, a, b, half);
  }

  // ── Switch ────────────────────────────────────────────────────

  private drawSwitch(seg: SwitchSegment): void {
    const { x: cx, y: cy } = tileToWorld(seg.col, seg.row);
    const half = TILE_SIZE / 2;

    // Slightly darker ballast to distinguish from plain track
    this.graphics.fillStyle(COL_SW_BALLAST, 1);
    this.graphics.fillRect(cx - half + 2, cy - half + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    // Inactive route: rust rails only, no sleepers, low alpha
    const inactiveExit = seg.activeExit === seg.exits[0] ? seg.exits[1] : seg.exits[0];
    this.drawInactiveRails(cx, cy, seg.entry, inactiveExit, half);

    // Active route: sleepers + full two-tone rails
    this.drawSleepers(cx, cy, seg.entry, seg.activeExit, half);
    this.drawActiveRails(cx, cy, seg.entry, seg.activeExit, half);

    // Yellow arrow showing active direction
    this.drawSwitchIndicator(cx, cy, seg.entry, seg.activeExit, half);
  }

  // ── Station ───────────────────────────────────────────────────

  private drawStation(seg: StationSegment): void {
    const { x: cx, y: cy } = tileToWorld(seg.col, seg.row);
    const half = TILE_SIZE / 2;
    const [a, b] = seg.connections;
    const isH = a === 1 || a === 3; // East-West connections → horizontal station

    // Ballast bed (same as regular track)
    this.graphics.fillStyle(COL_BALLAST, 1);
    this.graphics.fillRect(cx - half + 2, cy - half + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    const platSize = 20; // platform depth in pixels

    if (isH) {
      // Platform on north side
      const platY = cy - half + 2;
      this.graphics.fillStyle(COL_PLATFORM_SURFACE, 1);
      this.graphics.fillRect(cx - half + 2, platY, TILE_SIZE - 4, platSize);
      // Roof/canopy hint at very top
      this.graphics.fillStyle(COL_PLATFORM_ROOF, 1);
      this.graphics.fillRect(cx - half + 2, platY, TILE_SIZE - 4, 4);
      // Yellow safety edge at bottom of platform
      this.graphics.fillStyle(COL_PLATFORM_EDGE, 1);
      this.graphics.fillRect(cx - half + 2, platY + platSize - 2, TILE_SIZE - 4, 2);
    } else {
      // Platform on east side
      const platX = cx + half - 2 - platSize;
      this.graphics.fillStyle(COL_PLATFORM_SURFACE, 1);
      this.graphics.fillRect(platX, cy - half + 2, platSize, TILE_SIZE - 4);
      // Roof/canopy hint at far right
      this.graphics.fillStyle(COL_PLATFORM_ROOF, 1);
      this.graphics.fillRect(cx + half - 6, cy - half + 2, 4, TILE_SIZE - 4);
      // Yellow safety edge on left side of platform
      this.graphics.fillStyle(COL_PLATFORM_EDGE, 1);
      this.graphics.fillRect(platX, cy - half + 2, 2, TILE_SIZE - 4);
    }

    // Sleepers + rails on top of ballast
    this.drawSleepers(cx, cy, a, b, half);
    this.drawActiveRails(cx, cy, a, b, half);
  }

  // ── Sleepers ──────────────────────────────────────────────────

  private drawSleepers(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number
  ): void {
    if (OPPOSITE[sideA] === sideB) {
      this.drawStraightSleepers(cx, cy, sideA, sideB, half);
    } else {
      this.drawCurvedSleepers(cx, cy, sideA, sideB, half);
    }
  }

  private drawStraightSleepers(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number
  ): void {
    const pA = this.sidePoint(cx, cy, sideA, half);
    const pB = this.sidePoint(cx, cy, sideB, half);
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = (-dy / len) * SLEEPER_HALF;
    const ny = (dx / len) * SLEEPER_HALF;

    for (let i = 1; i <= SLEEPER_COUNT; i++) {
      const t = i / (SLEEPER_COUNT + 1);
      const mx = pA.x + dx * t;
      const my = pA.y + dy * t;

      // Dark oak base
      this.graphics.lineStyle(5, COL_SLEEPER, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(mx + nx, my + ny);
      this.graphics.lineTo(mx - nx, my - ny);
      this.graphics.strokePath();

      // Lighter top-face highlight
      this.graphics.lineStyle(2, COL_SLEEPER_HL, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(mx + nx * 0.9, my + ny * 0.9);
      this.graphics.lineTo(mx - nx * 0.9, my - ny * 0.9);
      this.graphics.strokePath();
    }
  }

  private drawCurvedSleepers(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number
  ): void {
    const corner = curveCorner(cx, cy, sideA, sideB, half);
    const pA = this.sidePoint(cx, cy, sideA, half);
    const pB = this.sidePoint(cx, cy, sideB, half);

    const startAngle = Math.atan2(pA.y - corner.y, pA.x - corner.x);
    const endAngle   = Math.atan2(pB.y - corner.y, pB.x - corner.x);
    let delta = endAngle - startAngle;
    if (delta >  Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    for (let i = 1; i <= SLEEPER_COUNT; i++) {
      const t = i / (SLEEPER_COUNT + 1);
      const ang = startAngle + delta * t;
      // Sleeper center on the arc at radius = half
      const mx = corner.x + half * Math.cos(ang);
      const my = corner.y + half * Math.sin(ang);
      // Direction is radial
      const rx = Math.cos(ang) * SLEEPER_HALF;
      const ry = Math.sin(ang) * SLEEPER_HALF;

      // Dark oak base
      this.graphics.lineStyle(5, COL_SLEEPER, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(mx + rx, my + ry);
      this.graphics.lineTo(mx - rx, my - ry);
      this.graphics.strokePath();

      // Lighter top-face highlight
      this.graphics.lineStyle(2, COL_SLEEPER_HL, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(mx + rx * 0.85, my + ry * 0.85);
      this.graphics.lineTo(mx - rx * 0.85, my - ry * 0.85);
      this.graphics.strokePath();
    }
  }

  // ── Rails ─────────────────────────────────────────────────────

  /** Two-tone silver rails for active track. */
  private drawActiveRails(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number
  ): void {
    if (OPPOSITE[sideA] === sideB) {
      this.drawStraightRails(cx, cy, sideA, sideB, half, 1, COL_RAIL_BASE, COL_RAIL_HEAD);
    } else {
      this.drawCurvedRails(cx, cy, sideA, sideB, half, 1, COL_RAIL_BASE, COL_RAIL_HEAD);
    }
  }

  /** Thin rust rails for inactive switch branch. */
  private drawInactiveRails(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number
  ): void {
    if (OPPOSITE[sideA] === sideB) {
      this.drawStraightRails(cx, cy, sideA, sideB, half, INACT_ALPHA, COL_INACT, null);
    } else {
      this.drawCurvedRails(cx, cy, sideA, sideB, half, INACT_ALPHA, COL_INACT, null);
    }
  }

  private drawStraightRails(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number, alpha: number,
    baseColor: number, headColor: number | null
  ): void {
    const pA = this.sidePoint(cx, cy, sideA, half);
    const pB = this.sidePoint(cx, cy, sideB, half);
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = (-dy / len) * RAIL_OFFSET;
    const ny = (dx / len) * RAIL_OFFSET;

    for (const sign of [1, -1]) {
      const ox = nx * sign;
      const oy = ny * sign;

      // Rail base / web / flange
      this.graphics.lineStyle(headColor !== null ? 3 : 2, baseColor, alpha);
      this.graphics.beginPath();
      this.graphics.moveTo(pA.x + ox, pA.y + oy);
      this.graphics.lineTo(pB.x + ox, pB.y + oy);
      this.graphics.strokePath();

      // Rail head (bright top surface)
      if (headColor !== null) {
        this.graphics.lineStyle(1.5, headColor, alpha);
        this.graphics.beginPath();
        this.graphics.moveTo(pA.x + ox, pA.y + oy);
        this.graphics.lineTo(pB.x + ox, pB.y + oy);
        this.graphics.strokePath();
      }
    }
  }

  private drawCurvedRails(
    cx: number, cy: number,
    sideA: Side, sideB: Side,
    half: number, alpha: number,
    baseColor: number, headColor: number | null
  ): void {
    const corner = curveCorner(cx, cy, sideA, sideB, half);
    const pA = this.sidePoint(cx, cy, sideA, half);
    const pB = this.sidePoint(cx, cy, sideB, half);

    const startAngle = Math.atan2(pA.y - corner.y, pA.x - corner.x);
    const endAngle   = Math.atan2(pB.y - corner.y, pB.x - corner.x);
    let delta = endAngle - startAngle;
    if (delta >  Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const anticlockwise = delta < 0;

    for (const radiusOff of [-RAIL_OFFSET, RAIL_OFFSET]) {
      const r = half + radiusOff;

      // Rail base
      this.graphics.lineStyle(headColor !== null ? 3 : 2, baseColor, alpha);
      this.graphics.beginPath();
      this.graphics.arc(corner.x, corner.y, r, startAngle, endAngle, anticlockwise);
      this.graphics.strokePath();

      // Rail head
      if (headColor !== null) {
        this.graphics.lineStyle(1.5, headColor, alpha);
        this.graphics.beginPath();
        this.graphics.arc(corner.x, corner.y, r, startAngle, endAngle, anticlockwise);
        this.graphics.strokePath();
      }
    }
  }

  // ── Switch indicator ──────────────────────────────────────────

  /**
   * Yellow dot + arrow from the toe side toward the active exit.
   * Gives an unambiguous visual cue about which way the train will go.
   */
  private drawSwitchIndicator(
    cx: number, cy: number,
    entry: Side, activeExit: Side,
    half: number
  ): void {
    const COLOR = 0xf1c40f;

    // Anchor: 40% into the tile from the toe side
    const anchor = this.sidePoint(cx, cy, entry, half * 0.4);
    // Arrow tip: 60% toward the active exit side
    const tip    = this.sidePoint(cx, cy, activeExit, half * 0.6);

    // Dot at anchor
    this.graphics.fillStyle(COLOR, 1);
    this.graphics.fillCircle(anchor.x, anchor.y, 5);

    // Shaft
    this.graphics.lineStyle(3, COLOR, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(anchor.x, anchor.y);
    this.graphics.lineTo(tip.x, tip.y);
    this.graphics.strokePath();

    // Arrowhead triangle
    const dx = tip.x - anchor.x;
    const dy = tip.y - anchor.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const arrowSize = 7;
    this.graphics.fillStyle(COLOR, 1);
    this.graphics.fillTriangle(
      tip.x + ux * arrowSize,    tip.y + uy * arrowSize,
      tip.x + (-uy) * arrowSize, tip.y + ux * arrowSize,
      tip.x - (-uy) * arrowSize, tip.y - ux * arrowSize,
    );
  }

  // ── Utility ───────────────────────────────────────────────────

  private sidePoint(cx: number, cy: number, side: Side, half: number): { x: number; y: number } {
    switch (side) {
      case 0: return { x: cx,        y: cy - half };
      case 1: return { x: cx + half, y: cy        };
      case 2: return { x: cx,        y: cy + half };
      case 3: return { x: cx - half, y: cy        };
    }
  }
}
