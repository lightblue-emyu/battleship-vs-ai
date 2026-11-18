import { type Board, isInBounds, sameCoord, shipCells } from './board';
import {
  BOARD_SIZE,
  DIRECTION_DELTA,
  FLEET,
  type AttackResult,
  type Coord,
  type Difficulty,
  type Direction,
  type Orientation,
  type Random,
  type Ship,
} from './types';

/** How often the AI dodges instead of attacking when a shot lands next to one of its ships. */
export const EVADE_CHANCE = 0.5;

/** Evasion chance per difficulty: the weak AI never dodges, the strong one usually does. */
export const EVADE_CHANCES: Readonly<Record<Difficulty, number>> = { easy: 0, normal: EVADE_CHANCE, hard: 0.8 };

export interface ShipMove {
  ship: Ship;
  direction: Direction;
}

/**
 * Decides whether the AI should spend its turn moving a ship out of danger.
 * It only reacts to the player's last shot: if it was a miss right next to an
 * undamaged AI ship, the AI sometimes moves that ship one cell away.
 */
export function chooseEvasion(
  board: Board,
  lastIncoming: AttackResult | null,
  random: Random,
  chance = EVADE_CHANCE,
): ShipMove | null {
  if (!lastIncoming || lastIncoming.outcome !== 'miss') return null;
  const shot = lastIncoming.coord;
  const options = board.ships
    .filter((s) => s.hitCount === 0 && distanceTo(s.cells, shot) === 1)
    .flatMap((ship) => board.legalMoves(ship).map((direction) => ({ ship, direction })));
  const away = options.filter(
    ({ ship, direction }) => distanceTo(moved(ship.cells, direction), shot) > distanceTo(ship.cells, shot),
  );
  const pool = away.length > 0 ? away : options;
  if (pool.length === 0 || random() >= chance) return null;
  return pool[Math.floor(random() * pool.length)];
}

function distanceTo(cells: Coord[], target: Coord): number {
  return Math.min(...cells.map((c) => Math.abs(c.row - target.row) + Math.abs(c.col - target.col)));
}

function moved(cells: Coord[], direction: Direction): Coord[] {
  const d = DIRECTION_DELTA[direction];
  return cells.map((c) => ({ row: c.row + d.row, col: c.col + d.col }));
}

const DIRECTIONS: readonly Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const ORIENTATIONS: readonly Orientation[] = ['horizontal', 'vertical'];

/**
 * Computer opponent. How it picks a cell depends on the difficulty:
 *
 * - easy: any untried cell at random, even right after a hit.
 * - normal: the classic "hunt and target" strategy.
 *   - Hunt: fire at random untried cells on a checkerboard pattern
 *     (every ship is at least 2 long, so it must cover one of those cells).
 *   - Target: after a hit, fire around it; once two hits line up,
 *     keep firing along that line until the ship sinks.
 * - hard: "probability map". For every ship that is still afloat it counts
 *   every position the ship could be in (not over a miss or a sunk ship) and
 *   fires at the cell covered by the most positions. After a hit it only counts
 *   positions that go through the open hits, so it finishes ships quickly.
 *
 * The AI only remembers its own shots, so it never fires at the same cell twice.
 */
export class AiPlayer {
  private readonly tried = new Set<string>();
  private readonly misses = new Set<string>();
  private readonly sunkCells = new Set<string>();
  private readonly sunkShips = new Set<string>();
  private openHits: Coord[] = [];

  constructor(
    private readonly random: Random = Math.random,
    readonly difficulty: Difficulty = 'normal',
  ) {}

  chooseTarget(): Coord {
    const pool = this.candidates();
    if (pool.length === 0) throw new Error('攻撃できるマスが残っていません');
    return pool[Math.floor(this.random() * pool.length)];
  }

  /** Tell the AI what happened so it can plan the next shot. */
  recordResult(result: AttackResult): void {
    this.tried.add(key(result.coord));
    if (result.outcome === 'miss') {
      this.misses.add(key(result.coord));
    } else if (result.outcome === 'hit') {
      this.openHits.push(result.coord);
    } else if (result.outcome === 'sunk' && result.ship) {
      const sunkCells = result.ship.cells;
      this.openHits = this.openHits.filter((h) => !sunkCells.some((c) => sameCoord(c, h)));
      sunkCells.forEach((c) => this.sunkCells.add(key(c)));
      this.sunkShips.add(result.ship.type.id);
    }
  }

  hasTried(coord: Coord): boolean {
    return this.tried.has(key(coord));
  }

  private candidates(): Coord[] {
    if (this.difficulty === 'easy') return this.untriedCells();
    if (this.difficulty === 'hard') {
      const best = this.mostLikelyCells();
      if (best.length > 0) return best;
    }
    const targets = this.targetCandidates();
    return targets.length > 0 ? targets : this.huntCandidates();
  }

  /** Untried cells covered by the most possible positions of the ships still afloat. */
  private mostLikelyCells(): Coord[] {
    const scores = new Map<string, number>();
    const score = (requireHit: boolean) => {
      for (const type of FLEET) {
        if (this.sunkShips.has(type.id)) continue;
        for (const orientation of ORIENTATIONS) {
          for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
              const cells = shipCells({ row, col }, type.length, orientation);
              if (!cells.every((c) => isInBounds(c) && !this.misses.has(key(c)) && !this.sunkCells.has(key(c)))) continue;
              const hits = cells.filter((c) => this.openHits.some((h) => sameCoord(h, c))).length;
              if (requireHit && hits === 0) continue;
              const weight = requireHit ? hits : 1;
              for (const c of cells) {
                if (!this.hasTried(c)) scores.set(key(c), (scores.get(key(c)) ?? 0) + weight);
              }
            }
          }
        }
      }
    };
    if (this.openHits.length > 0) score(true);
    if (scores.size === 0) score(false);
    const max = Math.max(0, ...scores.values());
    if (max === 0) return [];
    return [...scores].filter(([, v]) => v === max).map(([k]) => fromKey(k));
  }

  private untriedCells(): Coord[] {
    const all: Coord[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (!this.hasTried({ row, col })) all.push({ row, col });
      }
    }
    return all;
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
    const all = this.untriedCells();
    const checkerboard = all.filter((c) => (c.row + c.col) % 2 === 0);
    return checkerboard.length > 0 ? checkerboard : all;
  }
}

function key({ row, col }: Coord): string {
  return `${row},${col}`;
}

function fromKey(k: string): Coord {
  const [row, col] = k.split(',').map(Number);
  return { row, col };
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
