import {
  BOARD_SIZE,
  FLEET,
  type AttackResult,
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

/**
 * One player's 10x10 sea: where their ships are and which cells the
 * opponent has already shot at.
 */
export class Board {
  readonly ships: Ship[] = [];
  private readonly shipAt: (Ship | null)[][];
  private readonly shots: (ShotMark | null)[][];

  constructor() {
    this.shipAt = emptyGrid<Ship | null>(null);
    this.shots = emptyGrid<ShotMark | null>(null);
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
    const ship: Ship = { type, cells: shipCells(start, type.length, orientation), hitCount: 0 };
    for (const c of ship.cells) this.shipAt[c.row][c.col] = ship;
    this.ships.push(ship);
    return ship;
  }

  shipAtCell({ row, col }: Coord): Ship | null {
    return this.shipAt[row][col];
  }

  shotAt({ row, col }: Coord): ShotMark | null {
    return this.shots[row][col];
  }

  hasBeenShot(coord: Coord): boolean {
    return this.shotAt(coord) !== null;
  }

  receiveAttack(coord: Coord): AttackResult {
    if (!isInBounds(coord)) throw new Error('盤面の外は攻撃できません');
    if (this.hasBeenShot(coord)) throw new Error('そのマスは既に攻撃済みです');

    const ship = this.shipAtCell(coord);
    if (!ship) {
      this.shots[coord.row][coord.col] = 'miss';
      return { coord, outcome: 'miss' };
    }
    this.shots[coord.row][coord.col] = 'hit';
    ship.hitCount += 1;
    return { coord, outcome: isSunk(ship) ? 'sunk' : 'hit', ship };
  }

  allShipsSunk(): boolean {
    return this.ships.length > 0 && this.ships.every(isSunk);
  }

  remainingShips(): Ship[] {
    return this.ships.filter((s) => !isSunk(s));
  }
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
