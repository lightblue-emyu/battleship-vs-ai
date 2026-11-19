import {
  BOARD_SIZE,
  FLEET,
  type AttackResult,
  type Offset,
  type Coord,
  type Orientation,
  type Random,
  type Ship,
  type ShipType,
  type ShotMark,
} from './types';

export function isInBounds({ row, col }: Coord): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function shipCells(start: Coord, length: number, orientation: Orientation): Coord[] {
  return Array.from({ length }, (_, i) =>
    orientation === 'horizontal'
      ? { row: start.row, col: start.col + i }
      : { row: start.row + i, col: start.col },
  );
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function shipOrientation(ship: Ship): Orientation {
  return ship.cells.length > 1 && ship.cells[0].row === ship.cells[1].row ? 'horizontal' : 'vertical';
}

/**
 * How far a ship may move this turn: N = undamaged segments, and the ship may shift
 * anywhere inside an N x N square around itself. For even N the extra row/column
 * is on the right/bottom. Returns the per-axis offset range, or null if it cannot move.
 */
export function moveRange(ship: Ship): { min: number; max: number } | null {
  const n = ship.type.length - ship.hitCount;
  if (n <= 1) return null;
  return { min: 0 - Math.floor((n - 1) / 2) || 0, max: Math.ceil((n - 1) / 2) };
}

export function shiftCells(cells: Coord[], offset: Offset): Coord[] {
  return cells.map((c) => ({ row: c.row + offset.row, col: c.col + offset.col }));
}

/**
 * One player's 10x10 sea: where their ships are, the misses left on the water,
 * and (on each ship) which segments have been hit.
 */
export class Board {
  readonly ships: Ship[] = [];
  private readonly shipAt: (Ship | null)[][];
  private readonly misses: boolean[][];

  constructor() {
    this.shipAt = emptyGrid<Ship | null>(null);
    this.misses = emptyGrid(false);
  }

  canPlace(type: ShipType, start: Coord, orientation: Orientation): boolean {
    if (this.ships.some((s) => s.type.id === type.id)) return false;
    return shipCells(start, type.length, orientation).every(
      (c) => isInBounds(c) && this.shipAt[c.row][c.col] === null,
    );
  }

  placeShip(type: ShipType, start: Coord, orientation: Orientation): Ship {
    if (!this.canPlace(type, start, orientation)) {
      throw new Error(`${type.name}をその位置には置けません`);
    }
    const ship: Ship = { type, cells: shipCells(start, type.length, orientation), hits: Array(type.length).fill(false), hitCount: 0 };
    for (const c of ship.cells) this.shipAt[c.row][c.col] = ship;
    this.ships.push(ship);
    return ship;
  }

  shipAtCell({ row, col }: Coord): Ship | null {
    return this.shipAt[row][col];
  }

  /** What the opponent sees at a cell: a hit ship segment, a miss on the water, or nothing yet. */
  shotAt(coord: Coord): ShotMark | null {
    const ship = this.shipAtCell(coord);
    if (ship && ship.hits[segmentIndex(ship, coord)]) return 'hit';
    return this.misses[coord.row][coord.col] ? 'miss' : null;
  }

  hasBeenShot(coord: Coord): boolean {
    return this.shotAt(coord) !== null;
  }

  receiveAttack(coord: Coord): AttackResult {
    if (!isInBounds(coord)) throw new Error('盤面の外は攻撃できません');
    if (this.hasBeenShot(coord)) throw new Error('そのマスは既に攻撃済みです');

    const ship = this.shipAtCell(coord);
    if (!ship) {
      this.misses[coord.row][coord.col] = true;
      return { coord, outcome: 'miss' };
    }
    ship.hits[segmentIndex(ship, coord)] = true;
    ship.hitCount += 1;
    return { coord, outcome: isSunk(ship) ? 'sunk' : 'hit', ship };
  }

  /**
   * A ship that is still afloat may shift by `offset` if the offset is inside its
   * move range and every new cell is on the board and not occupied by another ship.
   * It may pass over ships and shot cells on the way; only where it stops matters.
   */
  canMoveBy(ship: Ship, offset: Offset): boolean {
    const range = moveRange(ship);
    if (!range || !this.ships.includes(ship)) return false;
    if (offset.row === 0 && offset.col === 0) return false;
    const inRange = (v: number) => v >= range.min && v <= range.max;
    if (!inRange(offset.row) || !inRange(offset.col)) return false;
    return shiftCells(ship.cells, offset).every((c) => {
      if (!isInBounds(c)) return false;
      const occupant = this.shipAt[c.row][c.col];
      return occupant === null || occupant === ship;
    });
  }

  /** Moves the ship; a miss mark under its new position disappears, so that cell can be attacked again. */
  moveBy(ship: Ship, offset: Offset): void {
    if (!this.canMoveBy(ship, offset)) throw new Error(`${ship.type.name}はそこへは動かせません`);
    for (const c of ship.cells) this.shipAt[c.row][c.col] = null;
    ship.cells = shiftCells(ship.cells, offset);
    for (const c of ship.cells) {
      this.shipAt[c.row][c.col] = ship;
      this.misses[c.row][c.col] = false;
    }
  }

  legalOffsets(ship: Ship): Offset[] {
    const range = moveRange(ship);
    if (!range) return [];
    const out: Offset[] = [];
    for (let row = range.min; row <= range.max; row++) {
      for (let col = range.min; col <= range.max; col++) {
        if (this.canMoveBy(ship, { row, col })) out.push({ row, col });
      }
    }
    return out;
  }

  allShipsSunk(): boolean {
    return this.ships.length > 0 && this.ships.every(isSunk);
  }

  remainingShips(): Ship[] {
    return this.ships.filter((s) => !isSunk(s));
  }
}

function segmentIndex(ship: Ship, coord: Coord): number {
  return ship.cells.findIndex((c) => sameCoord(c, coord));
}

export function isSunk(ship: Ship): boolean {
  return ship.hitCount >= ship.type.length;
}

/** Places every ship of the fleet at random, legal positions. */
export function placeFleetRandomly(board: Board, random: Random, fleet = FLEET): void {
  for (const type of fleet) {
    if (board.ships.some((s) => s.type.id === type.id)) continue;
    const options = legalPlacements(board, type);
    if (options.length === 0) throw new Error(`${type.name}を置ける場所がありません`);
    const { start, orientation } = options[Math.floor(random() * options.length)];
    board.placeShip(type, start, orientation);
  }
}

function legalPlacements(board: Board, type: ShipType) {
  const result: { start: Coord; orientation: Orientation }[] = [];
  for (const orientation of ['horizontal', 'vertical'] as const) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const start = { row, col };
        if (board.canPlace(type, start, orientation)) result.push({ start, orientation });
      }
    }
  }
  return result;
}

function emptyGrid<T>(value: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => value));
}
