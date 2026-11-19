import { describe, expect, it } from 'vitest';
import { AiPlayer, chooseEvasion, EVADE_CHANCES } from '../src/game/ai';
import { Board, placeFleetRandomly } from '../src/game/board';
import { BOARD_SIZE, DIFFICULTIES, FLEET, type Difficulty } from '../src/game/types';
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

function shotsToSinkFleet(difficulty: Difficulty, seed: number) {
  const board = new Board();
  placeFleetRandomly(board, seededRandom(seed));
  const ai = new AiPlayer(seededRandom(seed + 1000), difficulty);
  const seen = new Set<string>();
  while (!board.allShipsSunk()) {
    const target = ai.chooseTarget();
    const k = `${target.row},${target.col}`;
    if (seen.has(k)) throw new Error(`same cell twice: ${k}`);
    seen.add(k);
    ai.recordResult(board.receiveAttack(target));
  }
  return seen.size;
}

describe('AIの強さ（弱い・普通・強い）', () => {
  it('どの強さでも同じマスを2度攻撃せず、100手以内に全艦撃沈できる', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed++) {
        expect(shotsToSinkFleet(difficulty, seed)).toBeLessThanOrEqual(100);
      }
    }
  });

  it('強いAIほど少ない手数で全艦を沈める（30試合の平均）', () => {
    const average = (d: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) total += shotsToSinkFleet(d, seed);
      return total / 30;
    };
    const easy = average('easy');
    const normal = average('normal');
    const hard = average('hard');
    expect(easy).toBeGreaterThan(normal + 20);
    expect(normal).toBeGreaterThan(hard);
  });

  it('弱いAIは命中しても隣を狙うとは限らない（盤面全体からランダム）', () => {
    const board = new Board();
    board.placeShip(FLEET[0], { row: 5, col: 2 }, 'horizontal');
    const ai = new AiPlayer(() => 0, 'easy');
    ai.recordResult(board.receiveAttack({ row: 5, col: 4 }));
    expect(ai.chooseTarget()).toEqual({ row: 0, col: 0 });
    expect(new AiPlayer(() => 0, 'normal').difficulty).toBe('normal');
  });

  it('強いAIも命中したら隣接マスを狙う', () => {
    const board = new Board();
    board.placeShip(FLEET[0], { row: 5, col: 2 }, 'horizontal');
    const ai = new AiPlayer(seededRandom(1), 'hard');
    ai.recordResult(board.receiveAttack({ row: 5, col: 4 }));
    const next = ai.chooseTarget();
    expect(Math.abs(next.row - 5) + Math.abs(next.col - 4)).toBe(1);
  });

  it('強いAIは、残りの船が入りきらない場所（外れに囲まれたマス）を狙わない', () => {
    const open = [
      { row: 0, col: 0 },
      { row: 9, col: 8 },
      { row: 9, col: 9 },
    ];
    for (const r of [0, 0.5, 0.99]) {
      const ai = new AiPlayer(() => r, 'hard');
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (open.some((c) => c.row === row && c.col === col)) continue;
          ai.recordResult({ coord: { row, col }, outcome: 'miss' });
        }
      }
      // (0,0) is a single cell walled in by misses, so no ship can be there.
      expect(ai.chooseTarget().row).toBe(9);
    }
  });

  it('回避する確率は 弱い=0（回避しない）< 普通 < 強い', () => {
    expect(EVADE_CHANCES.easy).toBe(0);
    expect(EVADE_CHANCES.normal).toBeLessThan(EVADE_CHANCES.hard);
    const board = new Board();
    board.placeShip(FLEET[4], { row: 5, col: 5 }, 'horizontal');
    board.receiveAttack({ row: 4, col: 5 });
    expect(chooseEvasion(board, { row: 4, col: 5 }, () => 0, EVADE_CHANCES.easy)).toBeNull();
  });
});

describe('chooseEvasion（AIの回避）', () => {
  const always = () => 0;

  it('自分の船のすぐ隣に弾が来たら、その船を弾からいちばん遠い場所へ動かす', () => {
    const board = new Board();
    const ship = board.placeShip(FLEET[4], { row: 5, col: 5 }, 'horizontal');
    board.receiveAttack({ row: 4, col: 5 });
    expect(chooseEvasion(board, { row: 4, col: 5 }, always)).toEqual({ ship, offset: { row: 1, col: 0 } });
  });

  it('被弾した船は、直前の弾の位置に関係なく動かそうとする', () => {
    const board = new Board();
    const ship = board.placeShip(FLEET[2], { row: 5, col: 5 }, 'horizontal');
    board.receiveAttack({ row: 5, col: 5 });
    expect(chooseEvasion(board, null, always)?.ship).toBe(ship);
  });

  it('無傷で、弾が離れた場所なら動かない', () => {
    const board = new Board();
    board.placeShip(FLEET[4], { row: 5, col: 5 }, 'horizontal');
    expect(chooseEvasion(board, { row: 0, col: 0 }, always)).toBeNull();
    expect(chooseEvasion(board, null, always)).toBeNull();
  });

  it('確率に外れたら動かない', () => {
    const board = new Board();
    board.placeShip(FLEET[4], { row: 5, col: 5 }, 'horizontal');
    expect(chooseEvasion(board, { row: 4, col: 5 }, () => 0.99)).toBeNull();
  });
});

describe('AiPlayer.observe（動く船への対応）', () => {
  it('移動した船の命中マークを見て、その隣を狙う', () => {
    const board = new Board();
    const cruiser = board.placeShip(FLEET[2], { row: 4, col: 4 }, 'horizontal');
    board.receiveAttack({ row: 4, col: 4 });
    board.moveBy(cruiser, { row: 1, col: 0 });
    const ai = new AiPlayer(seededRandom(1), 'normal');
    ai.observe(board);
    const target = ai.chooseTarget();
    expect(Math.abs(target.row - 5) + Math.abs(target.col - 4)).toBe(1);
    expect(board.hasBeenShot(target)).toBe(false);
  });

  it('船が止まって外れの印が消えたマスは、もう一度狙える', () => {
    const board = new Board();
    const destroyer = board.placeShip(FLEET[4], { row: 0, col: 0 }, 'horizontal');
    board.receiveAttack({ row: 1, col: 1 });
    const ai = new AiPlayer(seededRandom(1), 'easy');
    ai.observe(board);
    expect(ai.hasTried({ row: 1, col: 1 })).toBe(true);
    board.moveBy(destroyer, { row: 1, col: 0 });
    ai.observe(board);
    expect(ai.hasTried({ row: 1, col: 1 })).toBe(false);
  });

  it('動く船を相手にしても、どの強さでも印のあるマスは狙わず、いつかは全艦を沈める', () => {
    for (const difficulty of DIFFICULTIES) {
      const random = seededRandom(5);
      const board = new Board();
      placeFleetRandomly(board, random);
      const ai = new AiPlayer(random, difficulty);
      let turns = 0;
      while (!board.allShipsSunk() && turns < 400) {
        ai.observe(board);
        const target = ai.chooseTarget();
        expect(board.hasBeenShot(target)).toBe(false);
        board.receiveAttack(target);
        const move = chooseEvasion(board, target, random, 1);
        if (move) board.moveBy(move.ship, move.offset);
        turns++;
      }
      expect(board.allShipsSunk()).toBe(true);
    }
  });
});
