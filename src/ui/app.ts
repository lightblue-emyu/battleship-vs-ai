import { Board, isSunk, moveRange, sameCoord, shiftCells, shipCells, shipOrientation } from '../game/board';
import { Game, THINK_MS, type RoundOutcome } from '../game/game';
import {
  BOARD_SIZE,
  DIFFICULTIES,
  FLEET,
  type AttackResult,
  type Coord,
  type Difficulty,
  type Direction,
  type Offset,
  type Orientation,
  type Random,
  type Ship,
} from '../game/types';
import { launchMissile, MISSILE_FLIGHT_MS, prefersReducedMotion, type Shooter } from './missile';
import { createRecordStore, winRate, type GameRecord, type RecordStore } from './record';
import { createSoundPlayer, soundForOutcome, type SoundPlayer } from './sound';
import { EFFECTS, shipIcon, shipSegment, type Facing, type PaletteName } from './sprites';
import './turn.css';

export interface AppOptions {
  random?: Random;
  /** Thinking time at the start of every round (attacker picks a cell, defender may move a ship). */
  thinkMs?: number;
  /** How long an attack missile flies before it lands (0 = no missile). */
  missileMs?: number;
  /** AI strength selected when the page opens. */
  difficulty?: Difficulty;
  /** Hit / sunk sound effects; defaults to Web Audio synthesis. */
  sound?: SoundPlayer;
  /** Where the win / loss record is kept; defaults to localStorage. */
  record?: RecordStore;
}

type LogEntry = { side: 'player' | 'ai' | 'system'; text: string };

const COLUMN_LABELS = 'ABCDEFGHIJ';

const DIRECTION_DELTA: Record<Direction, Offset> = { up: { row: -1, col: 0 }, down: { row: 1, col: 0 }, left: { row: 0, col: -1 }, right: { row: 0, col: 1 } };
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: '弱い', normal: '普通', hard: '強い' };
const ARROW_KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export function coordLabel({ row, col }: Coord): string {
  return `${COLUMN_LABELS[col]}${row + 1}`;
}

/** Builds the game screen inside `root` and wires up all interactions. */
export function mountApp(root: HTMLElement, options: AppOptions = {}) {
  const random = options.random ?? Math.random;
  const thinkMs = options.thinkMs ?? THINK_MS;
  const missileMs = options.missileMs ?? MISSILE_FLIGHT_MS;
  const sound = options.sound ?? createSoundPlayer();
  const records = options.record ?? createRecordStore();

  let difficulty: Difficulty = options.difficulty ?? 'normal';
  let game = new Game(random, difficulty);
  let orientation: Orientation = 'horizontal';
  let hover: Coord | null = null;
  let lastShot: { side: 'player' | 'ai'; coord: Coord } | null = null;
  let log: LogEntry[] = [];
  let status = '';
  let resultDismissed = false;
  /** Set once this game's result has been added to the win / loss record. */
  let recorded = false;
  let selected: Ship | null = null;
  let lastMoved: Ship | null = null;
  let roundTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let roundEndsAt = 0;
  const missiles = new Set<() => void>();
  /** True from launch until impact, so a winning shot does not reveal the result early. */
  let awaitingImpact = false;

  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const els = {
    status: $('[data-ref=status]'),
    thinking: $('[data-ref=thinking]'),
    thinkingRole: $('[data-ref=thinking-role]'),
    thinkingLeft: $('[data-ref=thinking-left]'),
    placement: $('[data-ref=placement]'),
    currentShip: $('[data-ref=current-ship]'),
    rotate: $<HTMLButtonElement>('[data-ref=rotate]'),
    random: $<HTMLButtonElement>('[data-ref=random]'),
    clear: $<HTMLButtonElement>('[data-ref=clear]'),
    difficultyButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-difficulty]')],
    aiLevel: $('[data-ref=ai-level]'),
    movePanel: $('[data-ref=move-panel]'),
    moveInfo: $('[data-ref=move-info]'),
    moveButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-dir]')],
    moveCancel: $<HTMLButtonElement>('[data-ref=move-cancel]'),
    start: $<HTMLButtonElement>('[data-ref=start]'),
    restart: $<HTMLButtonElement>('[data-ref=restart]'),
    grid: $('[data-ref=grid]'),
    playerFleet: $('[data-ref=player-fleet]'),
    aiFleet: $('[data-ref=ai-fleet]'),
    playerCount: $('[data-ref=player-count]'),
    aiCount: $('[data-ref=ai-count]'),
    record: $('[data-ref=record]'),
    log: $('[data-ref=log]'),
    result: $('[data-ref=result]'),
    resultLabel: $('[data-ref=result-label]'),
    resultTitle: $('[data-ref=result-title]'),
    resultText: $('[data-ref=result-text]'),
    resultStats: $('[data-ref=result-stats]'),
    resultRecord: $('[data-ref=result-record]'),
    playAgain: $<HTMLButtonElement>('[data-ref=play-again]'),
    viewBoards: $<HTMLButtonElement>('[data-ref=view-boards]'),
    soundToggle: $<HTMLButtonElement>('[data-ref=sound-toggle]'),
  };
  buildGrid(els.grid);

  function stopRoundTimers() {
    clearTimeout(roundTimer);
    clearInterval(tickTimer);
    roundTimer = undefined;
    tickTimer = undefined;
  }

  function reset() {
    stopRoundTimers();
    cancelMissiles();
    game = new Game(random, difficulty);
    orientation = 'horizontal';
    hover = null;
    lastShot = null;
    log = [];
    resultDismissed = false;
    recorded = false;
    selected = null;
    lastMoved = null;
    status = '船を配置してください。自陣（左側）のマスをクリックすると置けます。';
    render();
  }

  /** The player may act only on their turn and once every missile in the air has landed. */
  function playerCanAct() {
    return game.phase === 'playing' && game.turn === 'player' && !awaitingImpact;
  }

  /** Flies a missile to `coord` and runs `onImpact` when it lands (at once if there is no missile). */
  function fireMissile(shooter: Shooter, coord: Coord, onImpact: () => void) {
    const owner: Owner = shooter === 'player' ? 'ai' : 'player';
    const target = els.grid.querySelector<HTMLElement>(
      `button.cell[data-owner=${owner}][data-row="${coord.row}"][data-col="${coord.col}"]`,
    );
    const land = () => {
      awaitingImpact = false;
      onImpact();
    };
    if (missileMs <= 0 || prefersReducedMotion() || !target) {
      land();
      return;
    }
    const cancel = launchMissile(els.grid, target, shooter, missileMs, () => {
      missiles.delete(cancel);
      land();
    });
    missiles.add(cancel);
  }

  function cancelMissiles() {
    for (const cancel of missiles) cancel();
    missiles.clear();
    awaitingImpact = false;
  }

  function addLog(entry: LogEntry) {
    log = [entry, ...log].slice(0, 30);
  }

  function describe(result: AttackResult, attacker: 'player' | 'ai'): string {
    const where = coordLabel(result.coord);
    const whose = attacker === 'player' ? '敵の' : 'あなたの';
    if (result.wasted) return `${where}：被弾済みの部分に当たり、効果なし`;
    if (result.outcome === 'miss') return `${where}：外れ`;
    if (result.outcome === 'hit') return `${where}：命中！`;
    return `${where}：命中！ ${whose}${result.ship!.type.name}を撃沈！`;
  }

  function playAttackSound(result: AttackResult) {
    const effect = soundForOutcome(result.outcome);
    if (effect) sound.play(effect);
  }

  function onPlayerGridClick(coord: Coord) {
    if (game.phase === 'playing') {
      onDefenseClick(coord);
      return;
    }
    if (game.phase !== 'placement') return;
    const ship = game.nextShipToPlace();
    if (!ship) return;
    if (!game.canPlaceNext(coord, orientation)) {
      status = `${ship.name}（${ship.length}マス）はそこには置けません。はみ出しや重なりがない場所を選んでください。`;
      render();
      return;
    }
    game.placeNext(coord, orientation);
    const next = game.nextShipToPlace();
    status = next
      ? `${ship.name}を配置しました。次は${next.name}（${next.length}マス）です。`
      : 'すべての船を配置しました。「ゲーム開始」を押してください。';
    render();
  }

  /** True while the player defends this round and may still plan a ship move. */
  function playerDefending() {
    return game.phase === 'playing' && game.turn === 'ai' && roundTimer !== undefined && !awaitingImpact;
  }

  /** True while the player attacks this round and may still pick a target. */
  function playerAttacking() {
    return playerCanAct() && roundTimer !== undefined;
  }

  function defenseHint() {
    return 'AIの攻撃ターン：動かすなら自分の船をクリックし、移動先のマスをクリック（または矢印キー）。';
  }

  function deselect() {
    if (playerDefending() && game.plannedMove) game.planMove(null);
    selected = null;
    if (playerDefending()) status = defenseHint();
    render();
  }

  /** Which cell of a ship counts as its centre (for even lengths, the one nearer the bow). */
  function centreCell(ship: Ship): Coord {
    return ship.cells[Math.floor((ship.cells.length - 1) / 2)];
  }

  function rangeLabel(ship: Ship) {
    const n = ship.type.length - ship.hitCount;
    return `${n}×${n}`;
  }

  function onDefenseClick(coord: Coord) {
    if (!playerDefending()) return;
    const ship = game.playerBoard.shipAtCell(coord);
    if (ship && ship !== selected) {
      selectShip(ship);
      return;
    }
    if (!selected) return;
    const centre = centreCell(selected);
    planOffset(selected, { row: coord.row - centre.row, col: coord.col - centre.col });
  }

  function selectShip(ship: Ship) {
    if (isSunk(ship) || !moveRange(ship)) {
      status = `${ship.type.name}は被弾が多く、もう動かせません。`;
    } else if (game.playerBoard.legalOffsets(ship).length === 0) {
      status = `${ship.type.name}は周りがふさがっていて動かせません。`;
    } else {
      selected = ship;
      status = `${ship.type.name}を選択中（${rangeLabel(ship)}の範囲で移動可）。光っているマスをクリックすると、船の中心がそこへ動きます。`;
    }
    render();
  }

  function plannedOffset(ship: Ship): Offset {
    const plan = game.plannedMove;
    return plan && plan.ship === ship ? plan.offset : { row: 0, col: 0 };
  }

  function planOffset(ship: Ship, offset: Offset) {
    if (offset.row === 0 && offset.col === 0) {
      game.planMove(null);
      status = `${ship.type.name}は元の位置のままです。`;
    } else if (game.playerBoard.canMoveBy(ship, offset)) {
      game.planMove({ ship, offset });
      status = `${ship.type.name}の移動先を決めました。時間切れで移動します（変更もできます）。`;
    } else {
      status = `${ship.type.name}はそこへは動かせません（${rangeLabel(ship)}の範囲で、ほかの船と重ならない場所だけ）。`;
    }
    render();
  }

  /** Arrow keys / buttons nudge the planned position, skipping spots blocked by other ships. */
  function moveSelected(direction: Direction) {
    if (!playerDefending() || !selected) return;
    const ship = selected;
    const range = moveRange(ship);
    if (!range) return;
    const d = DIRECTION_DELTA[direction];
    let next = plannedOffset(ship);
    for (;;) {
      next = { row: next.row + d.row, col: next.col + d.col };
      const inRange = [next.row, next.col].every((v) => v >= range.min && v <= range.max);
      if (!inRange) {
        status = `${ship.type.name}はこれ以上その方向へは動かせません（${rangeLabel(ship)}の範囲）。`;
        render();
        return;
      }
      if ((next.row === 0 && next.col === 0) || game.playerBoard.canMoveBy(ship, next)) break;
    }
    planOffset(ship, next);
  }

  function onAiGridClick(coord: Coord) {
    if (!playerAttacking()) return;
    if (game.aiBoard.hasBeenShot(coord)) {
      status = `${coordLabel(coord)}は既に攻撃済みです。別のマスを選んでください。`;
      render();
      return;
    }
    const same = game.plannedTarget && sameCoord(game.plannedTarget, coord);
    game.planTarget(same ? null : coord);
    status = same
      ? '狙いを取り消しました。時間切れまでに選ばないと、このターンは攻撃なしです。'
      : `${coordLabel(coord)}に狙いを定めました。時間切れで発射します（別のマスを選べば変更できます）。`;
    render();
  }

  /** Starts a round's thinking time; when it runs out, the round resolves. */
  function startRound() {
    stopRoundTimers();
    if (game.phase !== 'playing') return;
    selected = null;
    roundEndsAt = Date.now() + thinkMs;
    roundTimer = setTimeout(endRound, thinkMs);
    tickTimer = setInterval(renderThinking, 250);
    status =
      game.turn === 'player'
        ? 'あなたの攻撃ターン：敵陣（右側）の狙うマスをクリック。AIは船を動かすか考えています。'
        : defenseHint();
    render();
  }

  function endRound() {
    stopRoundTimers();
    if (game.phase !== 'playing') return;
    const outcome = game.resolveRound();
    selected = null;
    logMove(outcome);
    const attack = outcome.attack;
    if (!attack) {
      addLog({ side: outcome.attacker, text: `${outcome.attacker === 'player' ? 'あなた' : 'AI'} → 狙いを決めなかったので攻撃なし` });
      startRound();
      return;
    }
    lastShot = { side: outcome.attacker, coord: attack.coord };
    awaitingImpact = true;
    status = `${outcome.attacker === 'player' ? '' : 'AIが'}${coordLabel(attack.coord)}へミサイル発射！`;
    render();
    fireMissile(outcome.attacker, attack.coord, () => {
      playAttackSound(attack);
      const text = describe(attack, outcome.attacker);
      addLog({ side: outcome.attacker, text: `${outcome.attacker === 'player' ? 'あなた' : 'AI'} → ${text}` });
      if (game.phase === 'playing') {
        startRound();
        status = `${outcome.attacker === 'player' ? 'あなた' : 'AI'}の攻撃 ${text} ／ ${status}`;
      }
      render();
    });
  }

  function logMove({ attacker, move }: RoundOutcome) {
    lastMoved = attacker === 'ai' && move ? move.ship : null;
    if (!move) return;
    if (attacker === 'player') {
      addLog({ side: 'ai', text: 'AI → 船を1隻動かした（どの船かは秘密）' });
    } else {
      addLog({ side: 'player', text: `あなた → ${move.ship.type.name}を${offsetLabel(move.offset)}へ移動` });
    }
  }

  root.addEventListener('click', () => sound.unlock());
  els.grid.addEventListener('click', (e) => {
    const target = cellTarget(e.target);
    if (target?.owner === 'player') onPlayerGridClick(target.coord);
    else if (target?.owner === 'ai') onAiGridClick(target.coord);
  });
  const setHover = (coord: Coord | null) => {
    if (game.phase !== 'placement' || sameCoordOrNull(coord, hover) || coord === hover) return;
    hover = coord;
    renderBoards();
  };
  const playerCoord = (e: Event) => {
    const target = cellTarget(e.target);
    return target?.owner === 'player' ? target.coord : null;
  };
  els.grid.addEventListener('mouseover', (e) => setHover(playerCoord(e)));
  els.grid.addEventListener('focusin', (e) => setHover(playerCoord(e)));
  els.grid.addEventListener('mouseleave', () => {
    hover = null;
    renderBoards();
  });

  const rotate = () => {
    if (game.phase !== 'placement') return;
    orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    render();
  };
  els.rotate.addEventListener('click', rotate);
  const onKeydown = (e: KeyboardEvent) => {
    sound.unlock();
    if (e.key === 'r' || e.key === 'R') rotate();
    const direction = ARROW_KEYS[e.key];
    if (direction && selected) {
      e.preventDefault();
      moveSelected(direction);
    }
    if (e.key === 'Escape' && (selected || game.plannedMove)) deselect();
  };
  document.addEventListener('keydown', onKeydown);

  els.random.addEventListener('click', () => {
    if (game.phase !== 'placement') return;
    game.clearPlacement();
    game.placeRemainingRandomly();
    status = 'ランダムに配置しました。気に入らなければもう一度押せます。準備ができたら「ゲーム開始」！';
    render();
  });
  els.clear.addEventListener('click', () => {
    if (game.phase !== 'placement') return;
    game.clearPlacement();
    status = '配置をリセットしました。もう一度船を配置してください。';
    render();
  });
  els.start.addEventListener('click', () => {
    if (game.phase !== 'placement' || game.nextShipToPlace()) return;
    game.start();
    hover = null;
    addLog({ side: 'system', text: `戦闘開始！（AIの強さ：${DIFFICULTY_LABELS[difficulty]}）` });
    startRound();
  });
  for (const button of els.moveButtons) {
    button.addEventListener('click', () => moveSelected(button.dataset.dir as Direction));
  }
  els.moveCancel.addEventListener('click', deselect);
  for (const button of els.difficultyButtons) {
    button.addEventListener('click', () => {
      if (game.phase !== 'placement') return;
      difficulty = button.dataset.difficulty as Difficulty;
      game.setDifficulty(difficulty);
      status = `AIの強さを「${DIFFICULTY_LABELS[difficulty]}」にしました。`;
      render();
    });
  }
  els.restart.addEventListener('click', reset);
  els.playAgain.addEventListener('click', reset);
  els.viewBoards.addEventListener('click', () => {
    resultDismissed = true;
    render();
  });
  const renderSoundToggle = () => {
    els.soundToggle.textContent = sound.muted ? '効果音：OFF' : '効果音：ON';
    els.soundToggle.setAttribute('aria-pressed', String(!sound.muted));
  };
  els.soundToggle.addEventListener('click', () => {
    sound.muted = !sound.muted;
    renderSoundToggle();
  });
  renderSoundToggle();

  function renderThinking() {
    const active = roundTimer !== undefined && game.phase === 'playing';
    els.thinking.hidden = !active;
    if (!active) return;
    const leftMs = Math.max(0, roundEndsAt - Date.now());
    els.thinking.dataset.role = game.turn === 'player' ? 'attack' : 'defense';
    els.thinkingRole.textContent = game.turn === 'player' ? 'あなたの攻撃：狙うマスを決める' : 'あなたの守り：動かす船を決める';
    els.thinkingLeft.textContent = `残り ${Math.ceil(leftMs / 1000)} 秒`;
    els.thinking.style.setProperty('--left', String(thinkMs > 0 ? leftMs / thinkMs : 0));
  }

  function render() {
    els.status.textContent = status;
    renderThinking();
    renderControls();
    renderBoards();
    els.playerCount.textContent = String(renderFleet(els.playerFleet, game.playerBoard, true));
    els.aiCount.textContent = String(renderFleet(els.aiFleet, game.aiBoard, false));
    els.log.replaceChildren(
      ...log.map((entry) => {
        const li = document.createElement('li');
        li.className = `log-${entry.side}`;
        li.textContent = entry.text;
        return li;
      }),
    );
    renderResult();
    renderRecord(els.record, records.record);
  }

  function renderControls() {
    const placing = game.phase === 'placement';
    els.placement.hidden = !placing;
    const next = game.nextShipToPlace();
    els.currentShip.textContent = next
      ? `配置中：${next.name}（${next.length}マス）／ 向き：${orientation === 'horizontal' ? '横' : '縦'}`
      : '全ての船を配置済み';
    els.rotate.disabled = !placing || !next;
    els.start.disabled = !placing || next !== null;
    els.clear.disabled = !placing || game.playerBoard.ships.length === 0;
    for (const button of els.difficultyButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === difficulty));
      button.disabled = !placing;
    }
    els.aiLevel.textContent = `AI・${DIFFICULTY_LABELS[difficulty]}`;
    const defending = playerDefending();
    if (!defending || (selected && !moveRange(selected))) selected = null;
    els.movePanel.hidden = game.phase !== 'playing';
    els.moveInfo.textContent = !defending
      ? '移動：AIの攻撃ターンに、守りとして1隻動かせます'
      : selected
        ? `移動：${selected.type.name}（${rangeLabel(selected)}の範囲）`
        : '移動：自分の船をクリックして選択';
    for (const button of els.moveButtons) button.disabled = !defending || !selected;
    els.moveCancel.disabled = !defending || (!selected && !game.plannedMove);
    root.dataset.phase = game.phase;
    root.dataset.turn = game.turn;
  }

  function renderBoards() {
    const preview = previewCells();
    const defending = playerDefending();
    const plan = defending ? game.plannedMove : null;
    const ghost = plan ? shiftCells(plan.ship.cells, plan.offset) : [];
    const reach = defending && selected ? reachableCentres(selected) : [];
    forEachCell(els.grid, 'player', (cell, coord) => {
      const board = game.playerBoard;
      const ship = board.shipAtCell(coord);
      const shot = board.shotAt(coord);
      const previewIndex = preview ? preview.cells.findIndex((c) => sameCoord(c, coord)) : -1;
      const inPreview = previewIndex >= 0;
      const ghostIndex = ghost.findIndex((c) => sameCoord(c, coord));
      setCellState(cell, {
        ship: ship !== null,
        hit: shot === 'hit',
        miss: shot === 'miss',
        sunk: ship !== null && isSunk(ship),
        last: lastShot?.side === 'ai' && sameCoord(lastShot.coord, coord),
        'preview-ok': inPreview && preview!.valid,
        'preview-ng': inPreview && !preview!.valid,
        movable: defending && ship !== null && moveRange(ship) !== null,
        selected: ship !== null && ship === selected,
        moved: ship !== null && ship === lastMoved,
        ghost: ghostIndex >= 0,
        'plan-from': plan !== null && ship === plan.ship,
        reach: reach.some((c) => sameCoord(c, coord)),
      });
      if (ghostIndex >= 0) setSprite(cell, shipSegment(plan!.ship.type.id, shipOrientation(plan!.ship), ghostIndex, 'player'), plan!.ship.type.id);
      else if (ship) setShipSprite(cell, ship, coord, 'player');
      else if (inPreview) setSprite(cell, shipSegment(preview!.type.id, orientation, previewIndex, 'player'), preview!.type.id);
      else setSprite(cell, null);
      cell.disabled = !(game.phase === 'placement' || defending);
      cell.setAttribute('aria-label', cellAria('player', coord, shot, ship !== null, ship ? isSunk(ship) : false));
    });

    const canAttack = playerAttacking();
    const planned = canAttack ? game.plannedTarget : null;
    forEachCell(els.grid, 'ai', (cell, coord) => {
      const board = game.aiBoard;
      const ship = board.shipAtCell(coord);
      const shot = board.shotAt(coord);
      const sunk = ship !== null && isSunk(ship);
      const reveal = sunk || (game.phase === 'over' && !awaitingImpact && ship !== null);
      setCellState(cell, {
        ship: reveal,
        hit: shot === 'hit',
        miss: shot === 'miss',
        sunk,
        last: lastShot?.side === 'player' && sameCoord(lastShot.coord, coord),
        target: canAttack && shot === null,
        planned: planned !== null && sameCoord(planned, coord),
      });
      if (reveal && ship) setShipSprite(cell, ship, coord, 'enemy');
      else setSprite(cell, null);
      cell.disabled = !canAttack || shot !== null;
      cell.setAttribute('aria-label', cellAria('ai', coord, shot, reveal, sunk));
    });
  }

  /** Cells the selected ship's centre can move to this round (its legal positions). */
  function reachableCentres(ship: Ship): Coord[] {
    const centre = centreCell(ship);
    return game.playerBoard.legalOffsets(ship).map((o) => ({ row: centre.row + o.row, col: centre.col + o.col }));
  }

  function previewCells() {
    const ship = game.nextShipToPlace();
    if (game.phase !== 'placement' || !ship || !hover) return null;
    return {
      type: ship,
      cells: shipCells(hover, ship.length, orientation),
      valid: game.canPlaceNext(hover, orientation),
    };
  }

  function renderResult() {
    const over = game.phase === 'over' && !awaitingImpact;
    els.result.hidden = !over || resultDismissed;
    if (!over) return;
    const playerWon = game.winner === 'player';
    if (!recorded) {
      records.add(playerWon);
      recorded = true;
    }
    els.result.dataset.winner = game.winner ?? '';
    els.resultLabel.textContent = playerWon ? 'MISSION COMPLETE' : 'MISSION FAILED';
    els.resultTitle.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    els.resultText.textContent = playerWon
      ? 'あなたの勝利！ 敵艦隊をすべて撃沈しました。'
      : 'AIの勝利… あなたの艦隊はすべて沈められました。';
    const shots = game.shots.player;
    const afloat = game.playerBoard.ships.filter((ship) => !isSunk(ship)).length;
    renderStats(els.resultStats, [
      [String(shots.total), '攻撃回数'],
      [`${shots.total === 0 ? 0 : Math.round((shots.hits / shots.total) * 100)}%`, '命中率'],
      [`${afloat}/${FLEET.length}`, '残った自艦'],
    ]);
    const { wins, losses } = records.record;
    els.resultRecord.textContent = `通算成績 ${wins}勝 ${losses}敗（勝率 ${winRate(records.record)}%）`;
    status = playerWon ? 'ゲーム終了：あなたの勝利です！' : 'ゲーム終了：AIの勝利です。敵の残りの船の位置を表示しています。';
    if (resultDismissed) status += '「最初からやり直す」で新しいゲームを始められます。';
    els.status.textContent = status;
  }

  root.style.setProperty('--fx-hit', EFFECTS.hit());
  root.style.setProperty('--fx-miss', EFFECTS.miss());
  root.querySelectorAll<HTMLElement>('[data-legend-ship]').forEach((el) => {
    el.style.setProperty('--sprite', shipIcon('destroyer', 'player', el.dataset.legendShip as PaletteName));
  });
  reset();

  return {
    get game() {
      return game;
    },
    destroy() {
      stopRoundTimers();
      cancelMissiles();
      document.removeEventListener('keydown', onKeydown);
      root.innerHTML = '';
    },
  };
}

type Owner = 'player' | 'ai';
const OWNERS: readonly Owner[] = ['player', 'ai'];
const ZONE_NAMES: Record<Owner, string> = { player: '自陣', ai: '敵陣' };

/** One battlefield: each row is the player's 10 cells, the centre line, then the AI's 10 cells. */
function buildGrid(container: HTMLElement) {
  const fragment = document.createDocumentFragment();
  const divider = document.createElement('div');
  divider.className = 'divider';
  divider.setAttribute('aria-hidden', 'true');
  fragment.append(...OWNERS.map(seaLayer), divider, labelCell(''));
  for (let i = 0; i < OWNERS.length; i++) {
    for (let col = 0; col < BOARD_SIZE; col++) fragment.append(labelCell(COLUMN_LABELS[col]));
  }
  for (let row = 0; row < BOARD_SIZE; row++) {
    fragment.append(labelCell(String(row + 1)));
    for (const owner of OWNERS) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.dataset.owner = owner;
        fragment.append(cell);
      }
    }
  }
  container.replaceChildren(fragment);
}

/** Animated water drawn behind one board's cells (see sea.css). */
function seaLayer(owner: Owner) {
  const el = document.createElement('div');
  el.className = 'sea';
  el.dataset.owner = owner;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function labelCell(text: string) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function forEachCell(container: HTMLElement, owner: Owner, fn: (cell: HTMLButtonElement, coord: Coord) => void) {
  container.querySelectorAll<HTMLButtonElement>(`button.cell[data-owner=${owner}]`).forEach((cell) => {
    fn(cell, { row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
  });
}

function cellTarget(target: EventTarget | null): { owner: Owner; coord: Coord } | null {
  const cell = (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('button.cell');
  if (!cell) return null;
  return { owner: cell.dataset.owner as Owner, coord: { row: Number(cell.dataset.row), col: Number(cell.dataset.col) } };
}

function sameCoordOrNull(a: Coord | null, b: Coord | null) {
  return a !== null && b !== null && sameCoord(a, b);
}

function setCellState(cell: HTMLElement, state: Record<string, boolean>) {
  for (const [name, on] of Object.entries(state)) cell.classList.toggle(name, on);
}

function setSprite(cell: HTMLElement, sprite: string | null, shipId?: string) {
  if (sprite) cell.style.setProperty('--sprite', sprite);
  else cell.style.removeProperty('--sprite');
  if (shipId) cell.dataset.ship = shipId;
  else delete cell.dataset.ship;
}

function setShipSprite(cell: HTMLElement, ship: Ship, coord: Coord, facing: Facing) {
  const index = ship.cells.findIndex((c) => sameCoord(c, coord));
  const palette: PaletteName = isSunk(ship) ? 'wreck' : facing;
  setSprite(cell, shipSegment(ship.type.id, shipOrientation(ship), index, facing, palette), ship.type.id);
}

function cellAria(owner: Owner, coord: Coord, shot: 'hit' | 'miss' | null, ship: boolean, sunk: boolean) {
  const parts = [ZONE_NAMES[owner], coordLabel(coord)];
  if (shot === 'hit') parts.push(sunk ? '撃沈' : '命中');
  else if (shot === 'miss') parts.push('外れ');
  else if (ship) parts.push('船');
  return parts.join(' ');
}

/** Lists every ship with its hit cells and a status badge; returns how many are still afloat. */
function renderFleet(list: HTMLElement, board: Board, own: boolean): number {
  let afloat = 0;
  list.replaceChildren(
    ...FLEET.map((type) => {
      const ship = board.ships.find((s) => s.type.id === type.id);
      const sunk = ship ? isSunk(ship) : false;
      const damaged = !!ship && !sunk && ship.hitCount > 0;
      const pending = own && !ship;
      if (!sunk) afloat++;
      const li = document.createElement('li');
      li.className = sunk ? 'sunk' : pending ? 'pending' : damaged ? 'damaged' : 'intact';
      const name = document.createElement('em');
      name.textContent = type.name;
      if (own && ship && !sunk) {
        const range = moveRange(ship);
        name.append(Object.assign(document.createElement('small'), { textContent: range ? `移動${ship.type.length - ship.hitCount}×${ship.type.length - ship.hitCount}` : '移動不可' }));
      }
      const hull = document.createElement('span');
      hull.className = 'hull';
      hull.style.setProperty('--len', String(type.length));
      hull.style.setProperty('--sprite', shipIcon(type.id, 'player', sunk ? 'wreck' : own ? 'player' : 'enemy'));
      for (let i = 0; i < type.length; i++) {
        const part = document.createElement('s');
        part.classList.toggle('hit', !!ship && board.shotAt(ship.cells[i]) === 'hit');
        hull.append(part);
      }
      const badge = document.createElement('i');
      badge.className = 'badge';
      badge.textContent = sunk ? '撃沈' : pending ? '未配置' : damaged ? '被弾' : '健在';
      li.setAttribute('aria-label', `${type.name}：${badge.textContent}`);
      li.append(name, hull, badge);
      return li;
    }),
  );
  return afloat;
}

function renderStats(container: HTMLElement, stats: [value: string, label: string][]) {
  container.replaceChildren(
    ...stats.map(([value, label]) => {
      const item = document.createElement('div');
      item.append(Object.assign(document.createElement('strong'), { textContent: value }), Object.assign(document.createElement('small'), { textContent: label }));
      return item;
    }),
  );
}

function renderRecord(container: HTMLElement, record: GameRecord) {
  const strong = (text: string, className = '') => Object.assign(document.createElement('strong'), { textContent: text, className });
  container.replaceChildren(
    '通算成績 ',
    strong(String(record.wins), 'wins'),
    '勝 ',
    strong(String(record.losses), 'losses'),
    '敗 ｜ 勝率 ',
    strong(`${winRate(record)}%`),
  );
}

const TEMPLATE = /* html */ `
  <header class="site-header">
    <div class="brand">
      <h1>BATTLESHIP <span>VS AI</span></h1>
      <p>敵艦隊をすべて撃沈したら勝ち。攻守は1ターンごとに交代し、5秒のシンキングタイムに攻撃側は狙うマスを、守り側は動かす船を決めます。</p>
    </div>
    <div class="header-side">
      <p class="record" data-ref="record" aria-label="通算成績"></p>
      <button type="button" class="sound-toggle" data-ref="sound-toggle" title="命中・撃沈の効果音を切り替え"></button>
    </div>
  </header>

  <p class="status" data-ref="status" role="status" aria-live="polite"></p>
  <div class="thinking" data-ref="thinking" hidden>
    <span class="thinking-title">シンキングタイム</span>
    <strong data-ref="thinking-role"></strong>
    <b data-ref="thinking-left"></b>
    <i class="thinking-bar" aria-hidden="true"></i>
  </div>

  <section class="toolbar" aria-label="操作">
    <div class="placement" data-ref="placement">
      <div class="difficulty" role="group" aria-label="AIの強さ">
        <span>AIの強さ</span>
        ${DIFFICULTIES.map((d) => `<button type="button" data-difficulty="${d}">${DIFFICULTY_LABELS[d]}</button>`).join('')}
      </div>
      <strong data-ref="current-ship"></strong>
      <div class="buttons">
        <button type="button" data-ref="rotate">向きを変える (R)</button>
        <button type="button" data-ref="random">ランダム配置</button>
        <button type="button" data-ref="clear">配置をやり直す</button>
        <button type="button" class="primary" data-ref="start">ゲーム開始</button>
      </div>
    </div>
    <div class="move-panel" data-ref="move-panel" hidden>
      <strong data-ref="move-info"></strong>
      <div class="buttons">
        <button type="button" data-dir="up" aria-label="上へ移動">↑</button>
        <button type="button" data-dir="down" aria-label="下へ移動">↓</button>
        <button type="button" data-dir="left" aria-label="左へ移動">←</button>
        <button type="button" data-dir="right" aria-label="右へ移動">→</button>
        <button type="button" data-ref="move-cancel">選択解除 (Esc)</button>
      </div>
    </div>
    <button type="button" class="restart" data-ref="restart">最初からやり直す</button>
  </section>

  <div class="layout">
    <main class="battlefield" aria-label="盤面（左が自陣、右が敵陣）">
      <div class="zones">
        <h2 id="player-title">自陣 <small>あなたの艦隊</small></h2>
        <span class="vs" aria-hidden="true">VS</span>
        <h2 id="ai-title" class="enemy">敵陣 <small data-ref="ai-level">AI</small></h2>
      </div>
      <div class="grid-scroll">
        <div class="grid" data-ref="grid"></div>
      </div>
      <div class="legend" aria-label="凡例">
        <span><i class="ship-icon" style="--len: 2" data-legend-ship="player"></i>自分の船</span>
        <span><i class="cell hit"></i>命中</span>
        <span><i class="cell miss"></i>外れ</span>
        <span><i class="ship-icon" style="--len: 2" data-legend-ship="wreck"></i>撃沈</span>
      </div>
    </main>

    <aside class="side">
      <section class="card">
        <h3>敵艦隊 <span>残り <b data-ref="ai-count"></b> / ${FLEET.length} 隻</span></h3>
        <ul class="fleet enemy" data-ref="ai-fleet" aria-label="敵の船"></ul>
      </section>
      <section class="card">
        <h3>自艦隊 <span>残り <b data-ref="player-count"></b> / ${FLEET.length} 隻</span></h3>
        <ul class="fleet" data-ref="player-fleet" aria-label="あなたの船"></ul>
      </section>
      <section class="card log-panel">
        <h3>戦況ログ</h3>
        <ol class="log" data-ref="log"></ol>
      </section>
    </aside>
  </div>

  <div class="result" data-ref="result" role="dialog" aria-modal="true" aria-labelledby="result-title" hidden>
    <div class="result-card">
      <p class="result-label" data-ref="result-label"></p>
      <h2 id="result-title" data-ref="result-title"></h2>
      <p data-ref="result-text"></p>
      <div class="stats" data-ref="result-stats"></div>
      <p class="result-record" data-ref="result-record"></p>
      <div class="buttons">
        <button type="button" class="primary" data-ref="play-again">もう一度遊ぶ</button>
        <button type="button" data-ref="view-boards">盤面を確認する</button>
      </div>
    </div>
  </div>
`;

function offsetLabel({ row, col }: Offset): string {
  const parts: string[] = [];
  if (row) parts.push(`${row < 0 ? '上' : '下'}${Math.abs(row)}`);
  if (col) parts.push(`${col < 0 ? '左' : '右'}${Math.abs(col)}`);
  return parts.join('・') || 'その場';
}
