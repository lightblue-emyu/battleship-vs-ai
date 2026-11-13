export const BOARD_SIZE = 10;

export type Orientation = 'horizontal' | 'vertical';

export interface Coord {
  row: number;
  col: number;
}

export interface ShipType {
  id: string;
  name: string;
  length: number;
}

export interface Ship {
  type: ShipType;
  cells: Coord[];
  hitCount: number;
}

export type ShotMark = 'miss' | 'hit';

export type AttackOutcome = 'miss' | 'hit' | 'sunk';

export interface AttackResult {
  coord: Coord;
  outcome: AttackOutcome;
  /** The ship that was hit or sunk (undefined on a miss). */
  ship?: Ship;
}

/** The standard fleet: every player places these five ships. */
export const FLEET: readonly ShipType[] = [
  { id: 'carrier', name: '空母', length: 5 },
  { id: 'battleship', name: '戦艦', length: 4 },
  { id: 'cruiser', name: '巡洋艦', length: 3 },
  { id: 'submarine', name: '潜水艦', length: 3 },
  { id: 'destroyer', name: '駆逐艦', length: 2 },
];

/** Returns a number in [0, 1). Injected so tests can be deterministic. */
export type Random = () => number;
