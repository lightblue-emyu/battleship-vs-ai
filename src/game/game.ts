import { AiPlayer, chooseEvasion, type ShipMove } from './ai';
import { Board, placeFleetRandomly } from './board';
import {
  FLEET,
  type AttackResult,
  type Coord,
  type Direction,
  type Orientation,
  type Random,
  type Ship,
  type ShipType,
} from './types';

export type Phase = 'placement' | 'playing' | 'over';
export type Side = 'player' | 'ai';

/** What a side did with its turn: fire at a cell, or move one of its ships. */
export type TurnAction = { kind: 'attack'; result: AttackResult } | ({ kind: 'move' } & ShipMove);

/**
 * The whole match as plain data + rules, with no DOM code.
 * The UI calls these methods and re-renders from the resulting state.
 */
export class Game {
  phase: Phase = 'placement';
  turn: Side = 'player';
  winner: Side | null = null;
  playerBoard = new Board();
  aiBoard = new Board();
  private ai: AiPlayer;
  private lastPlayerShot: AttackResult | null = null;

  constructor(private readonly random: Random = Math.random) {
    this.ai = new AiPlayer(random);
    placeFleetRandomly(this.aiBoard, random);
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
  }

  playerAttack(coord: Coord): AttackResult {
    this.assertTurn('player');
    const result = this.aiBoard.receiveAttack(coord);
    this.lastPlayerShot = result;
    this.finishTurn(this.aiBoard, 'player');
    return result;
  }

  /** Spend the player's turn moving one undamaged ship one cell instead of attacking. */
  playerMove(ship: Ship, direction: Direction): void {
    this.assertTurn('player');
    this.playerBoard.moveShip(ship, direction);
    this.lastPlayerShot = null;
    this.turn = 'ai';
  }

  /** The AI's whole turn: dodge with a threatened ship, or otherwise attack. */
  aiTakeTurn(): TurnAction {
    this.assertTurn('ai');
    const evasion = chooseEvasion(this.aiBoard, this.lastPlayerShot, this.random);
    if (evasion) {
      this.aiBoard.moveShip(evasion.ship, evasion.direction);
      this.turn = 'player';
      return { kind: 'move', ...evasion };
    }
    return { kind: 'attack', result: this.aiAttack() };
  }

  aiAttack(): AttackResult {
    this.assertTurn('ai');
    const coord = this.ai.chooseTarget();
    const result = this.playerBoard.receiveAttack(coord);
    this.ai.recordResult(result);
    this.finishTurn(this.playerBoard, 'ai');
    return result;
  }

  private assertTurn(side: Side): void {
    if (this.phase !== 'playing') throw new Error('ゲーム中ではありません');
    if (this.turn !== side) throw new Error(side === 'player' ? 'AIの番です' : 'プレイヤーの番です');
  }

  private finishTurn(defender: Board, attacker: Side): void {
    if (defender.allShipsSunk()) {
      this.phase = 'over';
      this.winner = attacker;
      return;
    }
    this.turn = attacker === 'player' ? 'ai' : 'player';
  }
}
