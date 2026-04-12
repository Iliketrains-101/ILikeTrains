export const TILE_SIZE = 64;

export type TileCoord = { col: number; row: number };

export function worldToTile(worldX: number, worldY: number): TileCoord {
  return {
    col: Math.floor(worldX / TILE_SIZE),
    row: Math.floor(worldY / TILE_SIZE),
  };
}

export function tileToWorld(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

/**
 * Returns the arc center (corner point) for a curved track segment.
 * For straight tracks this is unused — only call when the two sides are not opposite.
 */
export function curveCorner(
  cx: number,
  cy: number,
  sideA: number,
  sideB: number,
  half: number
): { x: number; y: number } {
  const key = [sideA, sideB].sort((a, b) => a - b).join(",");
  switch (key) {
    case "0,1": return { x: cx + half, y: cy - half }; // N+E → NE corner
    case "0,3": return { x: cx - half, y: cy - half }; // N+W → NW corner
    case "1,2": return { x: cx + half, y: cy + half }; // E+S → SE corner
    case "2,3": return { x: cx - half, y: cy + half }; // S+W → SW corner
    default:    return { x: cx, y: cy };
  }
}
