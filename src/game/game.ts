import { AiPlayer, chooseEvasion, EVADE_CHANCES, type ShipMove } from './ai';
import { Board, placeFleetRandomly } from './board';
import {
  FLEET,
  type AttackResult,
  type Coord,
  type Difficulty,
  type Orientation,
  type Random,
  type ShipType,
} from './types';

export type Phase = 'placement' | 'playing' | 'over';
export type Side = 'player' | 'ai';

/** What happened when a round was resolved: the defender's move (if any), then the attack (if any). */
export interface RoundOutcome {
  attacker: Side;
  move: ShipMove | null;
  attack: AttackResult | null;
}

/**
 * The whole match as plain data + rules, with no DOM code.
 * The UI calls these methods and re-renders from the resulting state.
 */
export class Game {
  phase: Phase = 'placement';
  /** Who attacks this round; the other side defends and may move one ship. */
  turn: Side = 'player';
  /** The player's chosen target while attacking, or their planned ship move while defending. */
  plannedTarget: Coord | null = null;
  plannedMove: ShipMove | null = null;
  /** Shots fired by each side. Marks on the board are not enough: a ship stopping on a miss erases it. */
  readonly shots: Record<Side, { total: number; hits: number }> = { player: { total: 0, hits: 0 }, ai: { total: 0, hits: 0 } };
  winner: Side | null = null;
  playerBoard = new Board();
  aiBoard = new Board();
  private ai: AiPlayer;
  private lastPlayerShot: Coord | null = null;
  private aiTarget: Coord | null = null;
  private aiMove: ShipMove | null = null;

  constructor(
    private readonly random: Random = Math.random,
    difficulty: Difficulty = 'normal',
  ) {
    this.ai = new AiPlayer(random, difficulty);
    placeFleetRandomly(this.aiBoard, random);
  }

  get difficulty(): Difficulty {
    return this.ai.difficulty;
  }

  /** The AI's strength can only be changed before the battle starts. */
  setDifficulty(difficulty: Difficulty): void {
    if (this.phase !== 'placement') throw new Error('AIの強さはゲーム開始前にだけ変更できます');
    this.ai = new AiPlayer(this.random, difficulty);
  }

  /** The next ship the player has to place, or null when all are placed. */
  nextShipToPlace(): ShipType | null {
    return FLEET.find((t) => !this.playerBoard.ships.some((s) => s.type.id === t.id)) ?? null;
  }

  canPlaceNext(start: Coord, orientation: Orientation): boolean {
    const type = this.nextShipToPlace();
    return this.phase === 'placement' && type !== null && this.playerBoard.canPlace(type, start, orientation);
  }

  placeNext(start: Coord, orientation: Orientation): void {
    const type = this.nextShipToPlace();
    if (this.phase !== 'placement' || !type) throw new Error('今は船を配置できません');
    this.playerBoard.placeShip(type, start, orientation);
  }

  placeRemainingRandomly(): void {
    if (this.phase !== 'placement') throw new Error('今は船を配置できません');
    placeFleetRandomly(this.playerBoard, this.random);
  }

  clearPlacement(): void {
    if (this.phase !== 'placement') throw new Error('今は船を配置できません');
    this.playerBoard = new Board();
  }

  start(): void {
    if (this.phase !== 'placement') throw new Error('ゲームは既に始まっています');
    if (this.nextShipToPlace() !== null) throw new Error('すべての船を配置してください');
    this.phase = 'playing';
    this.turn = 'player';
    this.beginRound();
  }

  /** While the player attacks: choose (or change, or clear) the cell to fire at when time is up. */
  planTarget(coord: Coord | null): void {
    this.assertTurn('player');
    if (coord && this.aiBoard.isSunkAt(coord)) throw new Error('沈んだ船のマスは攻撃できません');
    this.plannedTarget = coord;
  }

  /** While the player defends: choose (or change, or clear) where one ship moves when time is up. */
  planMove(move: ShipMove | null): void {
    this.assertTurn('ai');
    if (move && !this.playerBoard.canMoveBy(move.ship, move.offset)) {
      throw new Error(`${move.ship.type.name}はそこへは動かせません`);
    }
    this.plannedMove = move;
  }

  /** The player's attack round: fire at `coord` (the AI's move, decided earlier, happens first). */
  playerAttack(coord: Coord): RoundOutcome {
    this.planTarget(coord);
    return this.resolveRound();
  }

  /** The player's defence round: move one ship one cell, or pass `null` for no move; then the AI fires. */
  playerDefend(move: ShipMove | null): RoundOutcome {
    this.planMove(move);
    return this.resolveRound();
  }

  /** Resolve the round: the defender's ship moves first, then the attacker fires (if a target was chosen). */
  resolveRound(): RoundOutcome {
    if (this.phase !== 'playing') throw new Error('ゲーム中ではありません');
    const attacker = this.turn;
    const defender = attacker === 'player' ? this.aiBoard : this.playerBoard;
    let move = attacker === 'player' ? this.aiMove : this.plannedMove;
    if (move && defender.canMoveBy(move.ship, move.offset)) defender.moveBy(move.ship, move.offset);
    else move = null;

    const target = attacker === 'player' ? this.plannedTarget : this.aiTarget;
    let attack: AttackResult | null = null;
    if (target) {
      attack = defender.shotAt(target) === 'hit' ? defender.receiveRepeatHit(target) : defender.receiveAttack(target);
    }
    if (attack) {
      this.shots[attacker].total += 1;
      if (attack.outcome !== 'miss') this.shots[attacker].hits += 1;
    }
    if (attacker === 'player') this.lastPlayerShot = target;

    if (defender.allShipsSunk()) {
      this.phase = 'over';
      this.winner = attacker;
    } else {
      this.turn = attacker === 'player' ? 'ai' : 'player';
      this.beginRound();
    }
    return { attacker, move, attack };
  }

  /** The AI decides its part of the round up front, so it cannot react to the player's choice. */
  private beginRound(): void {
    this.plannedTarget = null;
    this.plannedMove = null;
    this.aiTarget = null;
    this.aiMove = null;
    if (this.turn === 'ai') {
      this.ai.observe(this.playerBoard);
      this.aiTarget = this.ai.chooseTarget();
    } else {
      this.aiMove = chooseEvasion(this.aiBoard, this.lastPlayerShot, this.random, EVADE_CHANCES[this.difficulty]);
    }
  }

  private assertTurn(side: Side): void {
    if (this.phase !== 'playing') throw new Error('ゲーム中ではありません');
    if (this.turn !== side) throw new Error(side === 'player' ? 'AIの番です' : 'プレイヤーの番です');
  }
}
