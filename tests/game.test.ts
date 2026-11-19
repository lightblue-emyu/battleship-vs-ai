import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { BOARD_SIZE, type Difficulty } from '../src/game/types';
import { seededRandom } from './helpers';

function startedGame(seed = 7, difficulty: Difficulty = 'normal') {
  const game = new Game(seededRandom(seed), difficulty);
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

  it('攻守は1ターンごとに交代し、攻撃側だけが狙いを、守り側だけが移動を決められる', () => {
    const game = startedGame();
    expect(game.turn).toBe('player');
    const ship = game.playerBoard.ships[0];
    expect(() => game.planMove({ ship, offset: { row: 0, col: 1 } })).toThrow('プレイヤーの番');
    game.planTarget({ row: 0, col: 0 });
    const round = game.resolveRound();
    expect(round.attacker).toBe('player');
    expect(round.attack?.coord).toEqual({ row: 0, col: 0 });
    expect(game.turn).toBe('ai');
    expect(() => game.planTarget({ row: 0, col: 1 })).toThrow('AIの番');
    const aiRound = game.resolveRound();
    expect(aiRound.attacker).toBe('ai');
    expect(aiRound.attack).not.toBeNull();
    expect(game.turn).toBe('player');
  });

  it('攻撃側が狙いを決めなければ、そのターンは攻撃なし', () => {
    const game = startedGame();
    const round = game.resolveRound();
    expect(round.attack).toBeNull();
    expect(countShots(game.aiBoard)).toBe(0);
    expect(game.turn).toBe('ai');
  });

  it('攻撃済みのマスは狙えない。狙いは時間切れまで変更・取り消しできる', () => {
    const game = startedGame();
    game.planTarget({ row: 0, col: 0 });
    game.resolveRound();
    game.resolveRound();
    expect(() => game.planTarget({ row: 0, col: 0 })).toThrow('既に攻撃済み');
    game.planTarget({ row: 1, col: 1 });
    game.planTarget({ row: 2, col: 2 });
    expect(game.plannedTarget).toEqual({ row: 2, col: 2 });
    game.planTarget(null);
    expect(game.resolveRound().attack).toBeNull();
  });

  it('プレイヤーが敵の全艦を沈めると勝利で終了する', () => {
    const game = startedGame(7, 'easy');
    const targets = game.aiBoard.ships.flatMap((s) => s.cells.map((c) => ({ ...c })));
    for (const coord of targets) {
      game.planTarget(coord);
      game.resolveRound();
      if (game.phase === 'playing') game.resolveRound();
    }
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('player');
    expect(() => game.resolveRound()).toThrow('ゲーム中ではありません');
  });

  it('AIがプレイヤーの全艦を沈めるとAIの勝利で終了する', () => {
    const game = startedGame(11);
    for (let i = 0; i < 1000 && game.phase === 'playing'; i++) game.resolveRound();
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('ai');
    expect(game.playerBoard.allShipsSunk()).toBe(true);
  });

  it('攻撃の結果（外れ・命中・撃沈）が返される', () => {
    const game = startedGame(7, 'easy');
    const ship = game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const results = ship.cells.map((c) => {
      game.planTarget(c);
      const r = game.resolveRound().attack!;
      game.resolveRound();
      return r.outcome;
    });
    expect(results).toEqual(['hit', 'sunk']);
  });

  it('狙ったマスに被弾済みの船の部分が移動してきたら、その攻撃は効果なし', () => {
    const game = startedGame(7, 'easy');
    const ship = game.aiBoard.ships.find((s) => s.type.id === 'carrier')!;
    game.planTarget(ship.cells[0]);
    game.resolveRound();
    game.resolveRound();
    const [offset] = game.aiBoard.legalOffsets(ship);
    const target = { row: ship.cells[0].row + offset.row, col: ship.cells[0].col + offset.col };
    if (!game.aiBoard.hasBeenShot(target)) game.planTarget(target);
    game.aiBoard.moveBy(ship, offset);
    const attack = game.resolveRound().attack!;
    expect(attack).toMatchObject({ coord: target, wasted: true });
    expect(ship.hitCount).toBe(1);
  });
});

describe('Game：AIの強さ', () => {
  it('初期値は「普通」で、開始前なら変更できるが開始後は変更できない', () => {
    const game = new Game(seededRandom(1));
    expect(game.difficulty).toBe('normal');
    game.setDifficulty('hard');
    expect(game.difficulty).toBe('hard');
    game.placeRemainingRandomly();
    game.start();
    expect(() => game.setDifficulty('easy')).toThrow('ゲーム開始前');
    expect(game.difficulty).toBe('hard');
  });

  it('弱いAIは守りのターンに船を動かさない', () => {
    const game = startedGame(3, 'easy');
    for (let i = 0; i < 20 && game.phase === 'playing'; i++) {
      if (game.turn === 'player') game.planTarget(firstUnshot(game));
      const round = game.resolveRound();
      if (round.attacker === 'player') expect(round.move).toBeNull();
    }
  });
});

describe('Game：守り側の移動', () => {
  it('プレイヤーは守りのターンに1隻の移動先を決められ、時間切れで攻撃より先に動く', () => {
    const game = startedGame();
    game.resolveRound();
    expect(game.turn).toBe('ai');
    const ship = game.playerBoard.ships.find((s) => game.playerBoard.legalOffsets(s).length > 0)!;
    const [offset] = game.playerBoard.legalOffsets(ship);
    const before = ship.cells.map((c) => ({ ...c }));
    expect(() => game.planMove({ ship, offset: { row: 9, col: 9 } })).toThrow('動かせません');
    game.planMove({ ship, offset });
    const round = game.resolveRound();
    expect(round.move).toEqual({ ship, offset });
    expect(ship.cells[0]).toEqual({ row: before[0].row + offset.row, col: before[0].col + offset.col });
    expect(game.playerBoard.shotAt(round.attack!.coord)).not.toBeNull();
  });

  it('AIは守りのターンに、狙われそうな船を動かすことがある', () => {
    const game = new Game(() => 0, 'normal');
    game.placeRemainingRandomly();
    game.start();
    game.planTarget(findMissNextToShip(game));
    game.resolveRound();
    game.resolveRound();
    const round = game.resolveRound();
    expect(round.attacker).toBe('player');
    expect(round.move).not.toBeNull();
  });
});

function countShots(board: Game['aiBoard']) {
  let n = 0;
  for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) if (board.hasBeenShot({ row, col })) n++;
  return n;
}

function findMissNextToShip(game: Game) {
  for (const ship of game.aiBoard.ships) {
    for (const c of ship.cells) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const coord = { row: c.row + dr, col: c.col + dc };
        if (coord.row < 0 || coord.row >= BOARD_SIZE || coord.col < 0 || coord.col >= BOARD_SIZE) continue;
        if (game.aiBoard.shipAtCell(coord) === null && game.aiBoard.legalOffsets(ship).length > 0) return coord;
      }
    }
  }
  throw new Error('no suitable cell');
}
