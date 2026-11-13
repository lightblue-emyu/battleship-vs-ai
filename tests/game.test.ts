import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { BOARD_SIZE } from '../src/game/types';
import { seededRandom } from './helpers';

function startedGame(seed = 7) {
  const game = new Game(seededRandom(seed));
  game.placeRemainingRandomly();
  game.start();
  return game;
}

function firstUnshot(game: Game) {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!game.aiBoard.hasBeenShot({ row, col })) return { row, col };
    }
  }
  throw new Error('no cell left');
}

describe('Game', () => {
  it('AIの船は最初から5隻配置されている', () => {
    expect(new Game(seededRandom(1)).aiBoard.ships).toHaveLength(5);
  });

  it('全ての船を置くまで開始できない', () => {
    const game = new Game(seededRandom(1));
    game.placeNext({ row: 0, col: 0 }, 'horizontal');
    expect(() => game.start()).toThrow('すべての船を配置');
    game.placeRemainingRandomly();
    game.start();
    expect(game.phase).toBe('playing');
  });

  it('船は決められた順番に1隻ずつ配置される', () => {
    const game = new Game(seededRandom(1));
    expect(game.nextShipToPlace()?.id).toBe('carrier');
    game.placeNext({ row: 0, col: 0 }, 'horizontal');
    expect(game.nextShipToPlace()?.id).toBe('battleship');
    game.clearPlacement();
    expect(game.nextShipToPlace()?.id).toBe('carrier');
  });

  it('プレイヤーとAIが交互に攻撃する', () => {
    const game = startedGame();
    expect(game.turn).toBe('player');
    game.playerAttack({ row: 0, col: 0 });
    expect(game.turn).toBe('ai');
    expect(() => game.playerAttack({ row: 0, col: 1 })).toThrow('AIの番');
    game.aiAttack();
    expect(game.turn).toBe('player');
    expect(() => game.aiAttack()).toThrow('プレイヤーの番');
  });

  it('プレイヤーが敵の全艦を沈めると勝利で終了する', () => {
    const game = startedGame();
    const targets = game.aiBoard.ships.flatMap((s) => s.cells);
    targets.forEach((coord, i) => {
      game.playerAttack(coord);
      if (i < targets.length - 1) game.aiAttack();
    });
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('player');
    expect(() => game.aiAttack()).toThrow('ゲーム中ではありません');
  });

  it('AIがプレイヤーの全艦を沈めるとAIの勝利で終了する', () => {
    const game = startedGame(11);
    while (game.phase === 'playing') {
      game.playerAttack(firstUnshot(game));
      if (game.phase === 'playing') game.aiAttack();
    }
    expect(game.phase).toBe('over');
    expect(game.winner === 'ai' ? game.playerBoard.allShipsSunk() : game.aiBoard.allShipsSunk()).toBe(true);
  });

  it('攻撃の結果（外れ・命中・撃沈）が返される', () => {
    const game = startedGame();
    const ship = game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const results = ship.cells.map((c) => {
      const r = game.playerAttack(c);
      game.aiAttack();
      return r.outcome;
    });
    expect(results).toEqual(['hit', 'sunk']);
  });
});
