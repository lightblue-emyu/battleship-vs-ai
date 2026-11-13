import { isInBounds, sameCoord } from './board';
import { BOARD_SIZE, type AttackResult, type Coord, type Random } from './types';

const DIRECTIONS: readonly Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

/**
 * Computer opponent using the classic "hunt and target" strategy.
 *
 * - Hunt: fire at random untried cells on a checkerboard pattern
 *   (every ship is at least 2 long, so it must cover one of those cells).
 * - Target: after a hit, fire around it; once two hits line up,
 *   keep firing along that line until the ship sinks.
 *
 * The AI only remembers its own shots, so it never fires at the same cell twice.
 */
export class AiPlayer {
  private readonly tried = new Set<string>();
  private openHits: Coord[] = [];

  constructor(private readonly random: Random = Math.random) {}

  chooseTarget(): Coord {
    const targets = this.targetCandidates();
    const pool = targets.length > 0 ? targets : this.huntCandidates();
    if (pool.length === 0) throw new Error('攻撃できるマスが残っていません');
    return pool[Math.floor(this.random() * pool.length)];
  }

  /** Tell the AI what happened so it can plan the next shot. */
  recordResult(result: AttackResult): void {
    this.tried.add(key(result.coord));
    if (result.outcome === 'hit') {
      this.openHits.push(result.coord);
    } else if (result.outcome === 'sunk' && result.ship) {
      const sunkCells = result.ship.cells;
      this.openHits = this.openHits.filter((h) => !sunkCells.some((c) => sameCoord(c, h)));
    }
  }

  hasTried(coord: Coord): boolean {
    return this.tried.has(key(coord));
  }

  private isOpen(coord: Coord): boolean {
    return isInBounds(coord) && !this.hasTried(coord);
  }

  private targetCandidates(): Coord[] {
    if (this.openHits.length === 0) return [];

    const lineTargets = this.lineEndCandidates();
    if (lineTargets.length > 0) return lineTargets;

    return unique(
      this.openHits.flatMap((hit) =>
        DIRECTIONS.map((d) => ({ row: hit.row + d.row, col: hit.col + d.col })),
      ),
    ).filter((c) => this.isOpen(c));
  }

  /** If two or more open hits sit in a row/column, try both ends of that line. */
  private lineEndCandidates(): Coord[] {
    const candidates: Coord[] = [];
    for (const hit of this.openHits) {
      for (const d of DIRECTIONS) {
        const next = { row: hit.row + d.row, col: hit.col + d.col };
        if (!this.openHits.some((h) => sameCoord(h, next))) continue;
        let end = next;
        while (this.openHits.some((h) => sameCoord(h, end))) {
          end = { row: end.row + d.row, col: end.col + d.col };
        }
        if (this.isOpen(end)) candidates.push(end);
      }
    }
    return unique(candidates);
  }

  private huntCandidates(): Coord[] {
    const all: Coord[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!this.hasTried({ row, col })) all.push({ row, col });
      }
    }
    const checkerboard = all.filter((c) => (c.row + c.col) % 2 === 0);
    return checkerboard.length > 0 ? checkerboard : all;
  }
}

function key({ row, col }: Coord): string {
  return `${row},${col}`;
}

function unique(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  return coords.filter((c) => {
    const k = key(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
