import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/game/ai';
import { Board, placeFleetRandomly } from '../src/game/board';
import { BOARD_SIZE, FLEET } from '../src/game/types';
import { seededRandom } from './helpers';

describe('AiPlayer', () => {
  it('100マス撃ち切るまで同じマスを2度攻撃しない', () => {
    const ai = new AiPlayer(seededRandom(42));
    const board = new Board();
    const seen = new Set<string>();
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      const target = ai.chooseTarget();
      const k = `${target.row},${target.col}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      ai.recordResult(board.receiveAttack(target));
    }
    expect(seen.size).toBe(100);
    expect(() => ai.chooseTarget()).toThrow();
  });

  it('命中したら次は上下左右の隣接マスを狙う', () => {
    const board = new Board();
    board.placeShip(FLEET[0], { row: 5, col: 2 }, 'horizontal');
    const ai = new AiPlayer(seededRandom(1));
    ai.recordResult(board.receiveAttack({ row: 5, col: 4 }));
    const next = ai.chooseTarget();
    const distance = Math.abs(next.row - 5) + Math.abs(next.col - 4);
    expect(distance).toBe(1);
  });

  it('2連続で命中したらその直線上を狙い続ける', () => {
    const board = new Board();
    board.placeShip(FLEET[0], { row: 5, col: 2 }, 'horizontal');
    const ai = new AiPlayer(seededRandom(3));
    ai.recordResult(board.receiveAttack({ row: 5, col: 4 }));
    ai.recordResult(board.receiveAttack({ row: 5, col: 5 }));
    for (let i = 0; i < 5; i++) {
      const next = ai.chooseTarget();
      expect(next.row).toBe(5);
      const result = board.receiveAttack(next);
      ai.recordResult(result);
      if (result.outcome === 'sunk') break;
    }
    expect(board.ships[0].hitCount).toBe(5);
  });

  it('撃沈後は探索モードに戻る（沈んだ船の周りに固執しない）', () => {
    const board = new Board();
    board.placeShip(FLEET[4], { row: 0, col: 0 }, 'horizontal');
    const ai = new AiPlayer(seededRandom(5));
    ai.recordResult(board.receiveAttack({ row: 0, col: 0 }));
    ai.recordResult(board.receiveAttack({ row: 0, col: 1 }));
    const next = ai.chooseTarget();
    expect((next.row + next.col) % 2).toBe(0);
  });

  it('ランダムな盤面でも必ず100手以内に全艦撃沈できる', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const random = seededRandom(seed);
      const board = new Board();
      placeFleetRandomly(board, random);
      const ai = new AiPlayer(random);
      let shots = 0;
      while (!board.allShipsSunk()) {
        ai.recordResult(board.receiveAttack(ai.chooseTarget()));
        shots++;
      }
      expect(shots).toBeLessThanOrEqual(100);
    }
  });
});
