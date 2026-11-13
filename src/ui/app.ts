import { Board, isSunk, sameCoord, shipCells, shipOrientation } from '../game/board';
import { Game } from '../game/game';
import {
  BOARD_SIZE,
  FLEET,
  type AttackResult,
  type Coord,
  type Direction,
  type Orientation,
  type Random,
  type Ship,
} from '../game/types';
import { EFFECTS, shipIcon, shipSegment, type Facing, type PaletteName } from './sprites';

export interface AppOptions {
  random?: Random;
  /** Pause before the AI fires, so the player can follow what happened. */
  aiDelayMs?: number;
}

type LogEntry = { side: 'player' | 'ai' | 'system'; text: string };

const COLUMN_LABELS = 'ABCDEFGHIJ';

const DIRECTION_LABELS: Record<Direction, string> = { up: '上', down: '下', left: '左', right: '右' };
const ARROW_KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export function coordLabel({ row, col }: Coord): string {
  return `${COLUMN_LABELS[col]}${row + 1}`;
}

/** Builds the game screen inside `root` and wires up all interactions. */
export function mountApp(root: HTMLElement, options: AppOptions = {}) {
  const random = options.random ?? Math.random;
  const aiDelayMs = options.aiDelayMs ?? 700;

  let game = new Game(random);
  let orientation: Orientation = 'horizontal';
  let hover: Coord | null = null;
  let lastShot: { side: 'player' | 'ai'; coord: Coord } | null = null;
  let log: LogEntry[] = [];
  let status = '';
  let resultDismissed = false;
  let selected: Ship | null = null;
  let lastMoved: Ship | null = null;
  let aiTimer: ReturnType<typeof setTimeout> | undefined;

  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const els = {
    status: $('[data-ref=status]'),
    placement: $('[data-ref=placement]'),
    currentShip: $('[data-ref=current-ship]'),
    rotate: $<HTMLButtonElement>('[data-ref=rotate]'),
    random: $<HTMLButtonElement>('[data-ref=random]'),
    clear: $<HTMLButtonElement>('[data-ref=clear]'),
    movePanel: $('[data-ref=move-panel]'),
    moveInfo: $('[data-ref=move-info]'),
    moveButtons: [...root.querySelectorAll<HTMLButtonElement>('[data-dir]')],
    moveCancel: $<HTMLButtonElement>('[data-ref=move-cancel]'),
    start: $<HTMLButtonElement>('[data-ref=start]'),
    restart: $<HTMLButtonElement>('[data-ref=restart]'),
    playerGrid: $('[data-ref=player-grid]'),
    aiGrid: $('[data-ref=ai-grid]'),
    playerFleet: $('[data-ref=player-fleet]'),
    aiFleet: $('[data-ref=ai-fleet]'),
    log: $('[data-ref=log]'),
    result: $('[data-ref=result]'),
    resultTitle: $('[data-ref=result-title]'),
    resultText: $('[data-ref=result-text]'),
    playAgain: $<HTMLButtonElement>('[data-ref=play-again]'),
    viewBoards: $<HTMLButtonElement>('[data-ref=view-boards]'),
  };
  buildGrid(els.playerGrid, 'player');
  buildGrid(els.aiGrid, 'ai');

  function reset() {
    clearTimeout(aiTimer);
    aiTimer = undefined;
    game = new Game(random);
    orientation = 'horizontal';
    hover = null;
    lastShot = null;
    log = [];
    resultDismissed = false;
    selected = null;
    lastMoved = null;
    status = '船を配置してください。自分の宙域をクリックすると置けます。';
    render();
  }

  function addLog(entry: LogEntry) {
    log = [entry, ...log].slice(0, 30);
  }

  function describe(result: AttackResult, attacker: 'player' | 'ai'): string {
    const where = coordLabel(result.coord);
    const whose = attacker === 'player' ? '敵の' : 'あなたの';
    if (result.outcome === 'miss') return `${where}：外れ`;
    if (result.outcome === 'hit') return `${where}：命中！`;
    return `${where}：命中！ ${whose}${result.ship!.type.name}を撃沈！`;
  }

  function onPlayerGridClick(coord: Coord) {
    if (game.phase === 'playing') {
      selectShipAt(coord);
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

  function selectShipAt(coord: Coord) {
    if (game.turn !== 'player') return;
    const ship = game.playerBoard.shipAtCell(coord);
    if (!ship || ship === selected) {
      selected = null;
      status = 'あなたの番です。敵の宙域をクリックして攻撃するか、自分の船を選んで1マス動かしましょう。';
    } else if (ship.hitCount > 0) {
      selected = null;
      status = `${ship.type.name}は被弾しているので動かせません。`;
    } else if (game.playerBoard.legalMoves(ship).length === 0) {
      selected = null;
      status = `${ship.type.name}は周りがふさがっていて動かせません。`;
    } else {
      selected = ship;
      status = `${ship.type.name}を選択中。矢印ボタンか矢印キーで1マス動かせます（攻撃の代わりになります）。`;
    }
    render();
  }

  function moveSelected(direction: Direction) {
    if (game.phase !== 'playing' || game.turn !== 'player' || !selected) return;
    const ship = selected;
    if (!game.playerBoard.canMoveShip(ship, direction)) {
      status = `${ship.type.name}は${DIRECTION_LABELS[direction]}には動かせません。`;
      render();
      return;
    }
    game.playerMove(ship, direction);
    selected = null;
    lastMoved = ship;
    const text = `${ship.type.name}を${DIRECTION_LABELS[direction]}へ1マス移動`;
    addLog({ side: 'player', text: `あなた → ${text}` });
    status = `${text}しました ／ AIが狙いを定めています…`;
    aiTimer = setTimeout(runAiTurn, aiDelayMs);
    render();
  }

  function onAiGridClick(coord: Coord) {
    if (game.phase !== 'playing' || game.turn !== 'player') return;
    if (game.aiBoard.hasBeenShot(coord)) {
      status = `${coordLabel(coord)}は既に攻撃済みです。別のマスを選んでください。`;
      render();
      return;
    }
    const result = game.playerAttack(coord);
    selected = null;
    lastMoved = null;
    lastShot = { side: 'player', coord };
    const text = describe(result, 'player');
    addLog({ side: 'player', text: `あなた → ${text}` });
    status = `あなたの攻撃 ${text}`;
    if (game.phase === 'playing') {
      status += ' ／ AIが狙いを定めています…';
      aiTimer = setTimeout(runAiTurn, aiDelayMs);
    }
    render();
  }

  function runAiTurn() {
    aiTimer = undefined;
    if (game.phase !== 'playing' || game.turn !== 'ai') return;
    const action = game.aiTakeTurn();
    if (action.kind === 'move') {
      addLog({ side: 'ai', text: 'AI → 攻撃せずに船を1隻動かした（どの船かは秘密）' });
      status = 'AIは攻撃せずに船を1隻動かしました！ ／ あなたの番です。';
    } else {
      const result = action.result;
      lastShot = { side: 'ai', coord: result.coord };
      if (result.ship === lastMoved) lastMoved = null;
      const text = describe(result, 'ai');
      addLog({ side: 'ai', text: `AI → ${text}` });
      status = `AIの攻撃 ${text}`;
      if (game.phase === 'playing') status += ' ／ あなたの番です。攻撃するか、船を1マス動かしましょう。';
    }
    render();
  }

  els.playerGrid.addEventListener('click', (e) => {
    const coord = cellCoord(e.target);
    if (coord) onPlayerGridClick(coord);
  });
  els.playerGrid.addEventListener('mouseover', (e) => {
    const coord = cellCoord(e.target);
    if (game.phase === 'placement' && coord && !sameCoordOrNull(coord, hover)) {
      hover = coord;
      renderBoards();
    }
  });
  els.playerGrid.addEventListener('mouseleave', () => {
    hover = null;
    renderBoards();
  });
  els.playerGrid.addEventListener('focusin', (e) => {
    const coord = cellCoord(e.target);
    if (game.phase === 'placement' && coord) {
      hover = coord;
      renderBoards();
    }
  });
  els.aiGrid.addEventListener('click', (e) => {
    const coord = cellCoord(e.target);
    if (coord) onAiGridClick(coord);
  });

  const rotate = () => {
    if (game.phase !== 'placement') return;
    orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    render();
  };
  els.rotate.addEventListener('click', rotate);
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'r' || e.key === 'R') rotate();
    const direction = ARROW_KEYS[e.key];
    if (direction && selected) {
      e.preventDefault();
      moveSelected(direction);
    }
    if (e.key === 'Escape' && selected) {
      selected = null;
      render();
    }
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
    addLog({ side: 'system', text: '戦闘開始！' });
    status = '戦闘開始！敵の宙域をクリックして攻撃。自分の船をクリックすると、攻撃の代わりに1マス動かせます。';
    render();
  });
  for (const button of els.moveButtons) {
    button.addEventListener('click', () => moveSelected(button.dataset.dir as Direction));
  }
  els.moveCancel.addEventListener('click', () => {
    selected = null;
    status = 'あなたの番です。敵の宙域をクリックして攻撃するか、自分の船を選んで1マス動かしましょう。';
    render();
  });
  els.restart.addEventListener('click', reset);
  els.playAgain.addEventListener('click', reset);
  els.viewBoards.addEventListener('click', () => {
    resultDismissed = true;
    render();
  });

  function render() {
    els.status.textContent = status;
    renderControls();
    renderBoards();
    renderFleet(els.playerFleet, game.playerBoard, true);
    renderFleet(els.aiFleet, game.aiBoard, false);
    els.log.replaceChildren(
      ...log.map((entry) => {
        const li = document.createElement('li');
        li.className = `log-${entry.side}`;
        li.textContent = entry.text;
        return li;
      }),
    );
    renderResult();
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
    if (selected && selected.hitCount > 0) selected = null;
    const myTurn = game.phase === 'playing' && game.turn === 'player';
    els.movePanel.hidden = game.phase !== 'playing';
    els.moveInfo.textContent = selected
      ? `移動：${selected.type.name}`
      : '移動：自分の船をクリックして選択';
    for (const button of els.moveButtons) {
      button.disabled = !myTurn || !selected || !game.playerBoard.canMoveShip(selected, button.dataset.dir as Direction);
    }
    els.moveCancel.disabled = !selected;
    root.dataset.phase = game.phase;
    root.dataset.turn = game.turn;
  }

  function renderBoards() {
    const preview = previewCells();
    const myTurn = game.phase === 'playing' && game.turn === 'player';
    forEachCell(els.playerGrid, (cell, coord) => {
      const board = game.playerBoard;
      const ship = board.shipAtCell(coord);
      const shot = board.shotAt(coord);
      const previewIndex = preview ? preview.cells.findIndex((c) => sameCoord(c, coord)) : -1;
      const inPreview = previewIndex >= 0;
      setCellState(cell, {
        ship: ship !== null,
        hit: shot === 'hit',
        miss: shot === 'miss',
        sunk: ship !== null && isSunk(ship),
        last: lastShot?.side === 'ai' && sameCoord(lastShot.coord, coord),
        'preview-ok': inPreview && preview!.valid,
        'preview-ng': inPreview && !preview!.valid,
        movable: myTurn && ship !== null && ship.hitCount === 0,
        selected: ship !== null && ship === selected,
        moved: ship !== null && ship === lastMoved,
      });
      if (ship) setShipSprite(cell, ship, coord, 'player');
      else if (inPreview) setSprite(cell, shipSegment(preview!.type.id, orientation, previewIndex, 'player'), preview!.type.id);
      else setSprite(cell, null);
      cell.disabled = !(game.phase === 'placement' || (myTurn && ship !== null));
      cell.setAttribute('aria-label', cellAria(coord, shot, ship !== null, ship ? isSunk(ship) : false));
    });

    const canAttack = game.phase === 'playing' && game.turn === 'player';
    forEachCell(els.aiGrid, (cell, coord) => {
      const board = game.aiBoard;
      const ship = board.shipAtCell(coord);
      const shot = board.shotAt(coord);
      const sunk = ship !== null && isSunk(ship);
      const reveal = sunk || (game.phase === 'over' && ship !== null);
      setCellState(cell, {
        ship: reveal,
        hit: shot === 'hit',
        miss: shot === 'miss',
        sunk,
        last: lastShot?.side === 'player' && sameCoord(lastShot.coord, coord),
        target: canAttack && shot === null,
      });
      if (reveal && ship) setShipSprite(cell, ship, coord, 'enemy');
      else setSprite(cell, null);
      cell.disabled = !canAttack || shot !== null;
      cell.setAttribute('aria-label', cellAria(coord, shot, reveal, sunk));
    });
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
    const over = game.phase === 'over';
    els.result.hidden = !over || resultDismissed;
    if (!over) return;
    const playerWon = game.winner === 'player';
    els.result.dataset.winner = game.winner ?? '';
    els.resultTitle.textContent = playerWon ? 'あなたの勝利！' : 'AIの勝利…';
    els.resultText.textContent = playerWon
      ? '敵の船をすべて沈めました。おめでとうございます！'
      : 'あなたの船はすべて沈められました。もう一度挑戦しましょう！';
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
      clearTimeout(aiTimer);
      document.removeEventListener('keydown', onKeydown);
      root.innerHTML = '';
    },
  };
}

function buildGrid(container: HTMLElement, owner: 'player' | 'ai') {
  const fragment = document.createDocumentFragment();
  fragment.append(labelCell(''));
  for (let col = 0; col < BOARD_SIZE; col++) fragment.append(labelCell(COLUMN_LABELS[col]));
  for (let row = 0; row < BOARD_SIZE; row++) {
    fragment.append(labelCell(String(row + 1)));
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
  container.replaceChildren(fragment);
}

function labelCell(text: string) {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function forEachCell(container: HTMLElement, fn: (cell: HTMLButtonElement, coord: Coord) => void) {
  container.querySelectorAll<HTMLButtonElement>('button.cell').forEach((cell) => {
    fn(cell, { row: Number(cell.dataset.row), col: Number(cell.dataset.col) });
  });
}

function cellCoord(target: EventTarget | null): Coord | null {
  const cell = (target as HTMLElement | null)?.closest?.<HTMLButtonElement>('button.cell');
  if (!cell) return null;
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
}

function sameCoordOrNull(a: Coord, b: Coord | null) {
  return b !== null && sameCoord(a, b);
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

function cellAria(coord: Coord, shot: 'hit' | 'miss' | null, ship: boolean, sunk: boolean) {
  const parts = [coordLabel(coord)];
  if (shot === 'hit') parts.push(sunk ? '撃沈' : '命中');
  else if (shot === 'miss') parts.push('外れ');
  else if (ship) parts.push('船');
  return parts.join(' ');
}

function renderFleet(list: HTMLElement, board: Board, own: boolean) {
  list.replaceChildren(
    ...FLEET.map((type) => {
      const ship = board.ships.find((s) => s.type.id === type.id);
      const sunk = ship ? isSunk(ship) : false;
      const li = document.createElement('li');
      li.classList.toggle('sunk', sunk);
      li.classList.toggle('pending', own && !ship);
      const icon = document.createElement('i');
      icon.className = 'ship-icon';
      icon.style.setProperty('--len', String(type.length));
      icon.style.setProperty('--sprite', shipIcon(type.id, own ? 'player' : 'enemy', sunk ? 'wreck' : own ? 'player' : 'enemy'));
      li.append(icon, `${type.name}${sunk ? '（撃沈）' : ''}`);
      if (own && ship && !sunk && ship.hitCount > 0) li.append(Object.assign(document.createElement('small'), { textContent: '移動不可' }));
      return li;
    }),
  );
}

const TEMPLATE = /* html */ `
  <header class="site-header">
    <h1>BATTLESHIP <span>VS AI</span></h1>
    <p>宇宙に隠れた敵艦隊をすべて撃沈したら勝ち。自分の番に「1マス攻撃」か「無傷の船を1マス移動」を選べます。</p>
  </header>

  <p class="status" data-ref="status" role="status" aria-live="polite"></p>

  <section class="toolbar" aria-label="操作">
    <div class="placement" data-ref="placement">
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

  <main class="boards">
    <section class="board-panel" aria-labelledby="player-title">
      <h2 id="player-title">あなたの宙域</h2>
      <div class="grid" data-ref="player-grid"></div>
      <ul class="fleet" data-ref="player-fleet" aria-label="あなたの船"></ul>
    </section>
    <section class="board-panel enemy" aria-labelledby="ai-title">
      <h2 id="ai-title">敵（AI）の宙域</h2>
      <div class="grid" data-ref="ai-grid"></div>
      <ul class="fleet" data-ref="ai-fleet" aria-label="敵の船"></ul>
    </section>
  </main>

  <section class="info">
    <div class="legend" aria-label="凡例">
      <span><i class="ship-icon" style="--len: 2" data-legend-ship="player"></i>船</span>
      <span><i class="cell hit"></i>命中</span>
      <span><i class="cell miss"></i>外れ</span>
      <span><i class="ship-icon sunk" style="--len: 2" data-legend-ship="wreck"></i>撃沈</span>
    </div>
    <div class="log-panel">
      <h2>戦況ログ</h2>
      <ol class="log" data-ref="log"></ol>
    </div>
  </section>

  <div class="result" data-ref="result" role="dialog" aria-modal="true" aria-labelledby="result-title" hidden>
    <div class="result-card">
      <h2 id="result-title" data-ref="result-title"></h2>
      <p data-ref="result-text"></p>
      <div class="buttons">
        <button type="button" data-ref="view-boards">盤面を確認する</button>
        <button type="button" class="primary" data-ref="play-again">もう一度遊ぶ</button>
      </div>
    </div>
  </div>
`;
