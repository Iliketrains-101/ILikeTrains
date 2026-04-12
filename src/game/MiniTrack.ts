/**
 * Draws miniature track/switch/station graphics for toolbar buttons.
 * Coordinate system: (0,0) = top-left of button, w×h = button size.
 */

// ── Colours (mirror Track.ts) ────────────────────────────────────────────────
const C_BALLAST  = 0x9b8b72;
const C_SLEEPER  = 0x3d2b15;
const C_SLP_HL   = 0x5e4122;
const C_RAIL_B   = 0x7c7c7c;
const C_RAIL_H   = 0xd0d0d0;
const C_SW_BALL  = 0x887a62;
const C_INACTIVE = 0x7a5535;
const C_ARROW    = 0xf1c40f;
const C_PLATFORM = 0xcec0ac;
const C_PLAT_RF  = 0x8a7e70;
const C_PLAT_ED  = 0xf0d040;

const RAIL_OFF = 3;   // px, rail offset from centreline
const SLP_HALF = 6;   // px, half-length of a sleeper
const SLP_W    = 2.5; // px, sleeper stroke width
const RAIL_W   = 2;   // px, rail base stroke width

// ── Geometry helpers ─────────────────────────────────────────────────────────

function sidePt(cx: number, cy: number, side: number, mh: number) {
  switch (side) {
    case 0: return { x: cx,      y: cy - mh };   // N
    case 1: return { x: cx + mh, y: cy      };   // E
    case 2: return { x: cx,      y: cy + mh };   // S
    default:return { x: cx - mh, y: cy      };   // W
  }
}

function cornerPt(cx: number, cy: number, a: number, b: number, mh: number) {
  const key = [a, b].sort((x, y) => x - y).join(",");
  switch (key) {
    case "0,1": return { x: cx + mh, y: cy - mh };
    case "0,3": return { x: cx - mh, y: cy - mh };
    case "1,2": return { x: cx + mh, y: cy + mh };
    case "2,3": return { x: cx - mh, y: cy + mh };
    default:    return { x: cx,      y: cy       };
  }
}

// ── Straight track segment ────────────────────────────────────────────────────

function drawStraight(
  g: Phaser.GameObjects.Graphics,
  sideA: number, sideB: number,
  cx: number, cy: number, mh: number,
  slopCol: number = C_SLEEPER
): void {
  const pA = sidePt(cx, cy, sideA, mh);
  const pB = sidePt(cx, cy, sideB, mh);
  const dx = pB.x - pA.x, dy = pB.y - pA.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len, ny = dx / len; // unit perpendicular

  // Sleepers
  for (let i = 1; i <= 3; i++) {
    const t  = i / 4;
    const mx = pA.x + dx * t, my = pA.y + dy * t;
    g.lineStyle(SLP_W, slopCol, 1);
    g.beginPath();
    g.moveTo(mx + nx * SLP_HALF, my + ny * SLP_HALF);
    g.lineTo(mx - nx * SLP_HALF, my - ny * SLP_HALF);
    g.strokePath();
    // Highlight
    g.lineStyle(1, C_SLP_HL, 1);
    g.beginPath();
    g.moveTo(mx + nx * SLP_HALF * 0.85, my + ny * SLP_HALF * 0.85);
    g.lineTo(mx - nx * SLP_HALF * 0.85, my - ny * SLP_HALF * 0.85);
    g.strokePath();
  }

  // Rails
  for (const s of [1, -1]) {
    const ox = nx * RAIL_OFF * s, oy = ny * RAIL_OFF * s;
    g.lineStyle(RAIL_W, C_RAIL_B, 1);
    g.beginPath(); g.moveTo(pA.x + ox, pA.y + oy); g.lineTo(pB.x + ox, pB.y + oy); g.strokePath();
    g.lineStyle(1, C_RAIL_H, 1);
    g.beginPath(); g.moveTo(pA.x + ox, pA.y + oy); g.lineTo(pB.x + ox, pB.y + oy); g.strokePath();
  }
}

// ── Curved track segment ──────────────────────────────────────────────────────

function drawCurved(
  g: Phaser.GameObjects.Graphics,
  sideA: number, sideB: number,
  cx: number, cy: number, mh: number
): void {
  const corner = cornerPt(cx, cy, sideA, sideB, mh);
  const pA     = sidePt(cx, cy, sideA, mh);
  const pB     = sidePt(cx, cy, sideB, mh);

  const startAngle = Math.atan2(pA.y - corner.y, pA.x - corner.x);
  const endAngle   = Math.atan2(pB.y - corner.y, pB.x - corner.x);
  let delta = endAngle - startAngle;
  if (delta >  Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const ac = delta < 0;

  // Sleepers (radial)
  for (let i = 1; i <= 3; i++) {
    const t   = i / 4;
    const ang = startAngle + delta * t;
    const mx  = corner.x + mh * Math.cos(ang);
    const my  = corner.y + mh * Math.sin(ang);
    const rx  = Math.cos(ang) * SLP_HALF;
    const ry  = Math.sin(ang) * SLP_HALF;
    g.lineStyle(SLP_W, C_SLEEPER, 1);
    g.beginPath(); g.moveTo(mx + rx, my + ry); g.lineTo(mx - rx, my - ry); g.strokePath();
    g.lineStyle(1, C_SLP_HL, 1);
    g.beginPath();
    g.moveTo(mx + rx * 0.85, my + ry * 0.85);
    g.lineTo(mx - rx * 0.85, my - ry * 0.85);
    g.strokePath();
  }

  // Rails (arcs)
  for (const rOff of [-RAIL_OFF, RAIL_OFF]) {
    g.lineStyle(RAIL_W, C_RAIL_B, 1);
    g.beginPath(); g.arc(corner.x, corner.y, mh + rOff, startAngle, endAngle, ac); g.strokePath();
    g.lineStyle(1, C_RAIL_H, 1);
    g.beginPath(); g.arc(corner.x, corner.y, mh + rOff, startAngle, endAngle, ac); g.strokePath();
  }
}

// ── Rail-only segment (for switch inactive branch) ────────────────────────────

function drawRailOnly(
  g: Phaser.GameObjects.Graphics,
  sideA: number, sideB: number,
  cx: number, cy: number, mh: number,
  alpha: number
): void {
  const opp = (s: number) => (s + 2) % 4;
  const straight = opp(sideA) === sideB;

  if (straight) {
    const pA = sidePt(cx, cy, sideA, mh);
    const pB = sidePt(cx, cy, sideB, mh);
    const dx = pB.x - pA.x, dy = pB.y - pA.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (const s of [1, -1]) {
      const ox = nx * RAIL_OFF * s, oy = ny * RAIL_OFF * s;
      g.lineStyle(1.5, C_INACTIVE, alpha);
      g.beginPath(); g.moveTo(pA.x + ox, pA.y + oy); g.lineTo(pB.x + ox, pB.y + oy); g.strokePath();
    }
  } else {
    const corner = cornerPt(cx, cy, sideA, sideB, mh);
    const pA     = sidePt(cx, cy, sideA, mh);
    const pB     = sidePt(cx, cy, sideB, mh);
    const startAngle = Math.atan2(pA.y - corner.y, pA.x - corner.x);
    const endAngle   = Math.atan2(pB.y - corner.y, pB.x - corner.x);
    let d = endAngle - startAngle;
    if (d >  Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    for (const rOff of [-RAIL_OFF, RAIL_OFF]) {
      g.lineStyle(1.5, C_INACTIVE, alpha);
      g.beginPath(); g.arc(corner.x, corner.y, mh + rOff, startAngle, endAngle, d < 0); g.strokePath();
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function drawMiniTool(
  g: Phaser.GameObjects.Graphics,
  tool: string,
  w: number,
  h: number
): void {
  const cx = w / 2, cy = h / 2;
  const mh = Math.min(w, h) / 2 - 3; // 3 px padding

  // Ballast background
  g.fillStyle(C_BALLAST, 1);
  g.fillRoundedRect(3, 3, w - 6, h - 6, 3);

  if (tool.startsWith("track-")) {
    drawTrackMini(g, tool, cx, cy, mh);
  } else if (tool.startsWith("sw-")) {
    drawSwitchMini(g, tool, cx, cy, mh);
  } else if (tool.startsWith("station-")) {
    drawStationMini(g, tool, cx, cy, mh, w, h);
  }
}

// ── Track mini ────────────────────────────────────────────────────────────────

const TRACK_SIDES: Record<string, [number, number]> = {
  "track-ns": [0, 2],
  "track-ew": [1, 3],
  "track-ne": [0, 1],
  "track-nw": [0, 3],
  "track-se": [2, 1],
  "track-sw": [2, 3],
};

function drawTrackMini(
  g: Phaser.GameObjects.Graphics,
  tool: string,
  cx: number, cy: number, mh: number
): void {
  const [a, b] = TRACK_SIDES[tool] ?? [0, 2];
  const opp    = (s: number) => (s + 2) % 4;
  if (opp(a) === b) {
    drawStraight(g, a, b, cx, cy, mh);
  } else {
    drawCurved(g, a, b, cx, cy, mh);
  }
}

// ── Switch mini ───────────────────────────────────────────────────────────────

interface SwDef { entry: number; exits: [number, number]; }
const SW_DEFS: Record<string, SwDef> = {
  "sw-wes": { entry: 3, exits: [1, 2] },
  "sw-wen": { entry: 3, exits: [1, 0] },
  "sw-nse": { entry: 0, exits: [2, 1] },
  "sw-nsw": { entry: 0, exits: [2, 3] },
  "sw-ews": { entry: 1, exits: [3, 2] },
  "sw-ewn": { entry: 1, exits: [3, 0] },
  "sw-sne": { entry: 2, exits: [0, 1] },
  "sw-snw": { entry: 2, exits: [0, 3] },
};

function drawSwitchMini(
  g: Phaser.GameObjects.Graphics,
  tool: string,
  cx: number, cy: number, mh: number
): void {
  const def = SW_DEFS[tool];
  if (!def) return;
  const { entry, exits } = def;
  const opp = (s: number) => (s + 2) % 4;

  // Slightly darker ballast
  g.fillStyle(C_SW_BALL, 1);
  g.fillRoundedRect(3, 3, (cx * 2) - 6, (cy * 2) - 6, 3);

  // Inactive route (faded rust rails, no sleepers)
  drawRailOnly(g, entry, exits[1], cx, cy, mh, 0.45);

  // Active route (full detail: sleepers + rails)
  const straight0 = opp(entry) === exits[0];
  if (straight0) drawStraight(g, entry, exits[0], cx, cy, mh);
  else           drawCurved(g, entry, exits[0], cx, cy, mh);

  // Yellow fork indicator dot at toe
  const toe = sidePt(cx, cy, entry, mh * 0.45);
  g.fillStyle(C_ARROW, 1);
  g.fillCircle(toe.x, toe.y, 3);
}

// ── Station mini ──────────────────────────────────────────────────────────────

function drawStationMini(
  g: Phaser.GameObjects.Graphics,
  tool: string,
  cx: number, cy: number, mh: number,
  w: number, h: number
): void {
  const isH = tool === "station-h";

  if (isH) {
    // Platform on north side (top ~35% of button)
    const platH = Math.round(h * 0.35);
    g.fillStyle(C_PLATFORM, 1);
    g.fillRect(3, 3, w - 6, platH);
    // Canopy edge
    g.fillStyle(C_PLAT_RF, 1);
    g.fillRect(3, 3, w - 6, 3);
    // Safety line
    g.fillStyle(C_PLAT_ED, 1);
    g.fillRect(3, 3 + platH - 2, w - 6, 2);
    // EW track through centre
    drawStraight(g, 1, 3, cx, cy, mh);
  } else {
    // Platform on east side (right ~35% of button)
    const platW = Math.round(w * 0.35);
    g.fillStyle(C_PLATFORM, 1);
    g.fillRect(w - 3 - platW, 3, platW, h - 6);
    // Canopy edge
    g.fillStyle(C_PLAT_RF, 1);
    g.fillRect(w - 6, 3, 3, h - 6);
    // Safety line
    g.fillStyle(C_PLAT_ED, 1);
    g.fillRect(w - 3 - platW, 3, 2, h - 6);
    // NS track through centre
    drawStraight(g, 0, 2, cx, cy, mh);
  }
}
