// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/ui/app';
import { seededRandom } from './helpers';

let root: HTMLElement;
let app: ReturnType<typeof mountApp>;

const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const cell = (owner: 'player' | 'ai', row: number, col: number) =>
  q<HTMLButtonElement>(`.cell[data-owner=${owner}][data-row="${row}"][data-col="${col}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
  app = mountApp(root, { random: seededRandom(9), aiDelayMs: 500 });
});

afterEach(() => {
  app.destroy();
  root.remove();
  vi.useRealTimers();
});

function cellsWhere(pred: (c: { row: number; col: number }) => boolean) {
  const out: { row: number; col: number }[] = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) if (pred({ row, col })) out.push({ row, col });
  return out;
}

function startWithRandomFleet() {
  q<HTMLButtonElement>('[data-ref=random]').click();
  q<HTMLButtonElement>('[data-ref=start]').click();
}

describe('画面（UI）', () => {
  it('船をクリックで配置でき、全部置くまで開始ボタンは押せない', () => {
    expect(q<HTMLButtonElement>('[data-ref=start]').disabled).toBe(true);
    cell('player', 0, 0).click();
    expect(cell('player', 0, 4).classList.contains('ship')).toBe(true);
    expect(q('[data-ref=status]').textContent).toContain('戦艦');
    q<HTMLButtonElement>('[data-ref=rotate]').click();
    cell('player', 2, 0).click();
    expect(cell('player', 5, 0).classList.contains('ship')).toBe(true);
    expect(q<HTMLButtonElement>('[data-ref=start]').disabled).toBe(true);
  });

  it('攻撃すると命中/外れが表示され、少し待つとAIが自動で攻撃する', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    const target = cell('ai', 0, 0);
    expect(target.classList.contains('hit') || target.classList.contains('miss')).toBe(true);
    expect(q('[data-ref=status]').textContent).toMatch(/A1：(外れ|命中)/);
    expect(app.game.turn).toBe('ai');

    vi.advanceTimersByTime(500);
    expect(app.game.turn).toBe('player');
    expect(root.querySelectorAll('[data-owner=player].hit, [data-owner=player].miss')).toHaveLength(1);
    expect(q('[data-ref=log]').children).toHaveLength(3);
  });

  it('AIの番の間は連打しても1回しか攻撃できない', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    cell('ai', 0, 1).click();
    cell('ai', 0, 2).click();
    expect(root.querySelectorAll('[data-owner=ai].hit, [data-owner=ai].miss')).toHaveLength(1);
  });

  it('攻撃済みのマスはもう一度押しても無視される', () => {
    startWithRandomFleet();
    cell('ai', 3, 3).click();
    vi.advanceTimersByTime(500);
    const before = app.game.aiBoard;
    cell('ai', 3, 3).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.game.turn).toBe('player');
    expect(app.game.aiBoard).toBe(before);
  });

  it('敵を全滅させると勝利画面が出て、再スタートで初期状態に戻る', () => {
    startWithRandomFleet();
    const targets = app.game.aiBoard.ships.flatMap((s) => s.cells);
    for (const t of targets) {
      cell('ai', t.row, t.col).click();
      vi.advanceTimersByTime(500);
    }
    expect(q('[data-ref=result]').hidden).toBe(false);
    expect(q('[data-ref=result-title]').textContent).toContain('勝利');

    q<HTMLButtonElement>('[data-ref=play-again]').click();
    expect(q('[data-ref=result]').hidden).toBe(true);
    expect(app.game.phase).toBe('placement');
    expect(root.querySelectorAll('button.cell.hit, button.cell.miss, [data-owner=player].ship')).toHaveLength(0);
    expect(q('[data-ref=log]').children).toHaveLength(0);
  });

  it('AIの攻撃待ち中に再スタートしても、新しいゲームにAIの攻撃が紛れ込まない', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    q<HTMLButtonElement>('[data-ref=restart]').click();
    vi.advanceTimersByTime(2000);
    expect(app.game.phase).toBe('placement');
    expect(root.querySelectorAll('button.cell.hit, button.cell.miss')).toHaveLength(0);
  });

  it('敗北後は結果画面を閉じて、公開された敵の残りの船を確認できる', () => {
    startWithRandomFleet();
    // Only shoot empty cells (re-checked every turn because the AI may move its ships).
    while (app.game.phase === 'playing') {
      const empty = cellsWhere((c) => !app.game.aiBoard.hasBeenShot(c) && app.game.aiBoard.shipAtCell(c) === null);
      cell('ai', empty[0].row, empty[0].col).click();
      vi.advanceTimersByTime(500);
    }
    const enemyCells = new Set(app.game.aiBoard.ships.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`));
    expect(app.game.winner).toBe('ai');
    expect(q('[data-ref=result]').hidden).toBe(false);

    q<HTMLButtonElement>('[data-ref=view-boards]').click();
    expect(q('[data-ref=result]').hidden).toBe(true);
    const revealed = root.querySelectorAll('button.cell[data-owner=ai].ship');
    expect(revealed).toHaveLength(enemyCells.size);
    expect(q('[data-ref=status]').textContent).toContain('AIの勝利');
    expect(q<HTMLButtonElement>('[data-ref=restart]').disabled).toBe(false);

    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(app.game.phase).toBe('placement');
    expect(q('[data-ref=result]').hidden).toBe(true);
  });

  it('戦闘中に自分の船を選んで矢印で1マス動かすと、手番を使ってAIが応答する', () => {
    startWithRandomFleet();
    const ship = app.game.playerBoard.ships.find((s) => app.game.playerBoard.canMoveShip(s, 'up') || app.game.playerBoard.canMoveShip(s, 'down'))!;
    const direction = app.game.playerBoard.canMoveShip(ship, 'up') ? 'up' : 'down';
    const before = ship.cells.map((c) => ({ ...c }));
    expect(q('[data-ref=move-panel]').hidden).toBe(false);
    expect(q<HTMLButtonElement>(`[data-dir=${direction}]`).disabled).toBe(true);

    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(cell('player', ship.cells[0].row, ship.cells[0].col).classList.contains('selected')).toBe(true);
    expect(q('[data-ref=move-info]').textContent).toContain(ship.type.name);

    q<HTMLButtonElement>(`[data-dir=${direction}]`).click();
    const dr = direction === 'up' ? -1 : 1;
    expect(ship.cells).toEqual(before.map((c) => ({ row: c.row + dr, col: c.col })));
    expect(app.game.turn).toBe('ai');
    expect(q('[data-ref=log]').textContent).toContain(`${ship.type.name}を`);
    expect(cell('player', ship.cells[0].row, ship.cells[0].col).dataset.ship).toBe(ship.type.id);

    vi.advanceTimersByTime(500);
    expect(app.game.turn).toBe('player');
  });

  it('矢印キーでも動かせて、被弾した船は選べない', () => {
    startWithRandomFleet();
    const ship = app.game.playerBoard.ships.find((s) => app.game.playerBoard.canMoveShip(s, 'right') || app.game.playerBoard.canMoveShip(s, 'left'))!;
    const key = app.game.playerBoard.canMoveShip(ship, 'right') ? 'ArrowRight' : 'ArrowLeft';
    const start = { ...ship.cells[0] };
    cell('player', start.row, start.col).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(ship.cells[0].col).toBe(start.col + (key === 'ArrowRight' ? 1 : -1));
    vi.advanceTimersByTime(500);

    const damaged = app.game.playerBoard.ships.find((s) => s.hitCount > 0);
    if (damaged) {
      cell('player', damaged.cells[0].row, damaged.cells[0].col).click();
      expect(q('[data-ref=status]').textContent).toContain('動かせません');
      expect(q('[data-ref=move-info]').textContent).not.toContain(damaged.type.name);
    }
  });

  it('船のマスにはドット絵が表示される', () => {
    startWithRandomFleet();
    const ship = app.game.playerBoard.ships[0];
    const el = cell('player', ship.cells[0].row, ship.cells[0].col);
    expect(el.dataset.ship).toBe(ship.type.id);
    expect(el.style.getPropertyValue('--sprite')).toContain('data:image/svg+xml');
    expect(cell('ai', 0, 0).style.getPropertyValue('--sprite')).toBe('');
  });
});
