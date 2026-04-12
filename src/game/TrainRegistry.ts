/**
 * TrainRegistry — tracks which tile each train's locomotive occupies.
 *
 * A train claims a tile when it begins entering it (progress = 0).
 * It releases the previous tile at the same moment.
 * Only the locomotive claims tiles; cars do not.
 */
export class TrainRegistry {
  private occupied = new Map<string, string>(); // tileKey → trainId

  /**
   * Try to claim a tile for the given train.
   * Returns true if the tile was free (or already claimed by this same train).
   * Returns false if it is claimed by a different train.
   */
  claim(key: string, trainId: string): boolean {
    const current = this.occupied.get(key);
    if (current !== undefined && current !== trainId) return false;
    this.occupied.set(key, trainId);
    return true;
  }

  /** Release a tile claim. Safe to call if the tile was not claimed. */
  release(key: string): void {
    this.occupied.delete(key);
  }
}
