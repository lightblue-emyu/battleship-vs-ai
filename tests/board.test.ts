import { describe, expect, it } from 'vitest';
import { Board, placeFleetRandomly } from '../src/game/board';
import { BOARD_SIZE, FLEET } from '../src/game/types';
import { seededRandom } from './helpers';

const [carrier, battleship, , , destroyer] = FLEET;

describe('Board: 船の配置', () => {
  it('盤面内で重ならなければ置ける', () => {
    const board = new Board();
    board.placeShip(carrier, { row: 0, col: 0 }, 'horizontal');
    expect(board.shipAtCell({ row: 0, col: 4 })?.type.id).toBe('carrier');
    expect(board.shipAtCell({ row: 0, col: 5 })).toBeNull();
  });

  it('盤面からはみ出す位置には置けない', () => {
    const board = new Board();
    expect(board.canPlace(carrier, { row: 0, col: 6 }, 'horizontal')).toBe(false);
    expect(board.canPlace(carrier, { row: 6, col: 0 }, 'vertical')).toBe(false);
    expect(board.canPlace(carrier, { row: 5, col: 5 }, 'horizontal')).toBe(true);
    expect(() => board.placeShip(carrier, { row: 9, col: 9 }, 'vertical')).toThrow();
  });

  it('他の船と重なる位置には置けない', () => {
    const board = new Board();
    board.placeShip(carrier, { row: 2, col: 2 }, 'horizontal');
    expect(board.canPlace(battleship, { row: 0, col: 4 }, 'vertical')).toBe(false);
    expect(board.canPlace(battleship, { row: 3, col: 2 }, 'horizontal')).toBe(true);
  });

  it('同じ種類の船は2隻置けない', () => {
    const board = new Board();
    board.placeShip(destroyer, { row: 0, col: 0 }, 'horizontal');
    expect(board.canPlace(destroyer, { row: 5, col: 5 }, 'horizontal')).toBe(false);
  });

  it('ランダム配置で全5隻が重ならず盤面内に置かれる（多数回）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const board = new Board();
      placeFleetRandomly(board, seededRandom(seed));
      expect(board.ships).toHaveLength(FLEET.length);
      const cells = board.ships.flatMap((s) => s.cells);
      expect(cells).toHaveLength(FLEET.reduce((n, t) => n + t.length, 0));
      expect(new Set(cells.map((c) => `${c.row},${c.col}`)).size).toBe(cells.length);
      for (const c of cells) {
        expect(c.row).toBeGreaterThanOrEqual(0);
        expect(c.row).toBeLessThan(BOARD_SIZE);
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(BOARD_SIZE);
      }
    }
  });
});

describe('Board: 攻撃の判定', () => {
  it('船のないマスは「外れ」、あるマスは「命中」', () => {
    const board = new Board();
    board.placeShip(destroyer, { row: 4, col: 4 }, 'horizontal');
    expect(board.receiveAttack({ row: 0, col: 0 }).outcome).toBe('miss');
    expect(board.receiveAttack({ row: 4, col: 4 }).outcome).toBe('hit');
    expect(board.shotAt({ row: 0, col: 0 })).toBe('miss');
    expect(board.shotAt({ row: 4, col: 4 })).toBe('hit');
  });

  it('船の全マスに命中すると「撃沈」になる', () => {
    const board = new Board();
    board.placeShip(destroyer, { row: 4, col: 4 }, 'vertical');
    board.receiveAttack({ row: 4, col: 4 });
    const result = board.receiveAttack({ row: 5, col: 4 });
    expect(result.outcome).toBe('sunk');
    expect(result.ship?.type.id).toBe('destroyer');
  });

  it('同じマスへの2回目の攻撃は拒否され、命中数も増えない', () => {
    const board = new Board();
    board.placeShip(destroyer, { row: 0, col: 0 }, 'horizontal');
    board.receiveAttack({ row: 0, col: 0 });
    expect(() => board.receiveAttack({ row: 0, col: 0 })).toThrow('既に攻撃済み');
    expect(board.ships[0].hitCount).toBe(1);
    expect(board.allShipsSunk()).toBe(false);
  });

  it('盤面外への攻撃は拒否される', () => {
    const board = new Board();
    expect(() => board.receiveAttack({ row: -1, col: 0 })).toThrow();
    expect(() => board.receiveAttack({ row: 0, col: 10 })).toThrow();
  });

  it('全ての船が沈むと allShipsSunk が true になる', () => {
    const board = new Board();
    board.placeShip(destroyer, { row: 0, col: 0 }, 'horizontal');
    board.placeShip(battleship, { row: 2, col: 0 }, 'horizontal');
    for (const ship of board.ships) {
      for (const c of ship.cells) board.receiveAttack(c);
    }
    expect(board.allShipsSunk()).toBe(true);
    expect(board.remainingShips()).toHaveLength(0);
  });

  it('船が1隻もない盤面は「全滅」扱いにしない', () => {
    expect(new Board().allShipsSunk()).toBe(false);
  });
});

describe('Board：船の移動', () => {
  function setup() {
    const board = new Board();
    const cruiser = board.placeShip(FLEET[2], { row: 4, col: 4 }, 'horizontal');
    return { board, cruiser };
  }

  it('無傷の船は上下左右に1マス動かせて、攻撃は新しい位置に当たる', () => {
    const { board, cruiser } = setup();
    expect(board.legalMoves(cruiser)).toEqual(['up', 'down', 'left', 'right']);
    board.moveShip(cruiser, 'right');
    expect(cruiser.cells).toEqual([
      { row: 4, col: 5 },
      { row: 4, col: 6 },
      { row: 4, col: 7 },
    ]);
    expect(board.shipAtCell({ row: 4, col: 4 })).toBeNull();
    expect(board.receiveAttack({ row: 4, col: 4 }).outcome).toBe('miss');
    expect(board.receiveAttack({ row: 4, col: 7 }).outcome).toBe('hit');
  });

  it('盤面の外・他の船の上・攻撃済みのマスには動かせない', () => {
    const board = new Board();
    const edge = board.placeShip(FLEET[4], { row: 0, col: 0 }, 'horizontal');
    expect(board.canMoveShip(edge, 'up')).toBe(false);
    expect(board.canMoveShip(edge, 'left')).toBe(false);

    board.placeShip(FLEET[3], { row: 1, col: 0 }, 'horizontal');
    expect(board.canMoveShip(edge, 'down')).toBe(false);

    board.receiveAttack({ row: 0, col: 2 });
    expect(board.canMoveShip(edge, 'right')).toBe(false);
    expect(() => board.moveShip(edge, 'right')).toThrow('動かせません');
  });

  it('被弾した船は動かせない', () => {
    const { board, cruiser } = setup();
    board.receiveAttack({ row: 4, col: 4 });
    expect(board.legalMoves(cruiser)).toEqual([]);
  });
});
