// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/ui/app';
import { createRecordStore, type RecordStore } from '../src/ui/record';
import type { SoundEffect, SoundPlayer } from '../src/ui/sound';
import { seededRandom } from './helpers';

let root: HTMLElement;
let app: ReturnType<typeof mountApp>;
let sounds: SoundEffect[];
let sound: SoundPlayer;
let record: RecordStore;

const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const cell = (owner: 'player' | 'ai', row: number, col: number) =>
  q<HTMLButtonElement>(`.cell[data-owner=${owner}][data-row="${row}"][data-col="${col}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
  sounds = [];
  sound = { muted: false, unlock: vi.fn(), play: (effect) => void (sound.muted || sounds.push(effect)) };
  record = createRecordStore(null);
  app = mountApp(root, { random: seededRandom(9), aiDelayMs: 500, missileMs: 0, sound, record });
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
  it('盤面は1つで、各行が「自陣10マス → 中央線 → 敵陣10マス」の順に並ぶ', () => {
    const grids = root.querySelectorAll('.grid');
    expect(grids).toHaveLength(1);
    expect(grids[0].querySelectorAll('.divider')).toHaveLength(1);
    const owners = [...grids[0].querySelectorAll<HTMLButtonElement>('button.cell')].map((c) => c.dataset.owner);
    expect(owners).toHaveLength(200);
    for (let row = 0; row < 10; row++) {
      expect(owners.slice(row * 20, row * 20 + 20)).toEqual([...Array(10).fill('player'), ...Array(10).fill('ai')]);
    }
    expect(cell('player', 0, 0).getAttribute('aria-label')).toContain('自陣');
    expect(cell('ai', 0, 0).getAttribute('aria-label')).toContain('敵陣');
  });

  it('敵陣の上にマウスを乗せても配置プレビューは出ない', () => {
    cell('ai', 3, 3).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(root.querySelectorAll('.preview-ok, .preview-ng')).toHaveLength(0);
    cell('player', 3, 3).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(root.querySelectorAll('[data-owner=player].preview-ok')).toHaveLength(5);
    expect(root.querySelectorAll('[data-owner=ai].preview-ok')).toHaveLength(0);
  });

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

  it('AIのミサイルが飛んでいる間は、攻撃も船の選択もできない', () => {
    app.destroy();
    app = mountApp(root, { random: seededRandom(9), aiDelayMs: 500, missileMs: 800, sound, record });
    startWithRandomFleet();
    const shots = (owner: 'player' | 'ai') =>
      root.querySelectorAll(`button.cell[data-owner=${owner}].hit, button.cell[data-owner=${owner}].miss`).length;

    cell('ai', 0, 0).click();
    vi.advanceTimersByTime(800 + 500);
    expect(root.querySelector('.missile[data-shooter=ai]')).not.toBeNull();
    expect(q('[data-ref=status]').textContent).toMatch(/^AIが.+へミサイル発射！/);
    expect(cell('ai', 5, 5).disabled).toBe(true);

    cell('ai', 5, 5).click();
    root.querySelector<HTMLButtonElement>('button.cell[data-owner=player].ship')!.click();
    expect(shots('ai')).toBe(1);
    expect(root.querySelector('.missile[data-shooter=player]')).toBeNull();
    expect(root.querySelector('button.cell[data-owner=player].selected')).toBeNull();

    vi.advanceTimersByTime(800);
    expect(root.querySelector('.missile')).toBeNull();
    expect(shots('player')).toBe(1);
    cell('ai', 5, 5).click();
    expect(shots('ai')).toBe(2);
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
    expect(q('[data-ref=result-title]').textContent).toBe('VICTORY');
    expect(q('[data-ref=result-text]').textContent).toContain('あなたの勝利');
    const stats = [...q('[data-ref=result-stats]').children].map((el) => el.textContent);
    expect(stats).toEqual([`${targets.length}攻撃回数`, '100%命中率', expect.stringMatching(/^\d\/5残った自艦$/)]);
    expect(q('[data-ref=result-record]').textContent).toBe('通算成績 1勝 0敗（勝率 100%）');
    expect(q('[data-ref=record]').textContent).toContain('勝率 100%');

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

  it('Escで選択を解除すると、上部の案内も通常の手番案内に戻る', () => {
    startWithRandomFleet();
    const ship = app.game.playerBoard.ships.find((s) => app.game.playerBoard.legalMoves(s).length > 0)!;
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(q('[data-ref=status]').textContent).toContain('選択中');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelectorAll('.cell.selected')).toHaveLength(0);
    expect(q('[data-ref=status]').textContent).not.toContain('選択中');
    expect(q('[data-ref=status]').textContent).toContain('あなたの番です');
  });

  it('AIの強さを選べて、開始後は変更できず、再スタート後も選んだ強さが残る', () => {
    const level = (d: string) => q<HTMLButtonElement>(`[data-difficulty=${d}]`);
    expect(level('normal').getAttribute('aria-pressed')).toBe('true');
    expect(level('hard').textContent).toBe('強い');

    level('hard').click();
    expect(app.game.difficulty).toBe('hard');
    expect(level('hard').getAttribute('aria-pressed')).toBe('true');
    expect(level('normal').getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-ref=status]').textContent).toContain('「強い」');

    startWithRandomFleet();
    expect(level('easy').disabled).toBe(true);
    level('easy').click();
    expect(app.game.difficulty).toBe('hard');
    expect(q('[data-ref=log]').textContent).toContain('AIの強さ：強い');
    expect(q('[data-ref=ai-level]').textContent).toContain('強い');

    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(app.game.phase).toBe('placement');
    expect(app.game.difficulty).toBe('hard');
    expect(level('hard').getAttribute('aria-pressed')).toBe('true');
    level('easy').click();
    expect(app.game.difficulty).toBe('easy');
  });

  it('船のマスにはドット絵が表示される', () => {
    startWithRandomFleet();
    const ship = app.game.playerBoard.ships[0];
    const el = cell('player', ship.cells[0].row, ship.cells[0].col);
    expect(el.dataset.ship).toBe(ship.type.id);
    expect(el.style.getPropertyValue('--sprite')).toContain('data:image/svg+xml');
    expect(cell('ai', 0, 0).style.getPropertyValue('--sprite')).toBe('');
  });

  it('艦隊パネルに、残りの隻数と各艦の「健在・被弾・撃沈」が表示される', () => {
    startWithRandomFleet();
    const rows = () => [...q('[data-ref=ai-fleet]').children] as HTMLElement[];
    expect(q('[data-ref=ai-count]').textContent).toBe('5');
    expect(rows().map((li) => li.querySelector('.badge')!.textContent)).toEqual(Array(5).fill('健在'));

    const destroyer = app.game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    cell('ai', destroyer.cells[0].row, destroyer.cells[0].col).click();
    const row = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(row.querySelector('.badge')!.textContent).toBe('被弾');
    expect(row.querySelectorAll('.hull s.hit')).toHaveLength(1);

    vi.advanceTimersByTime(500);
    cell('ai', destroyer.cells[1].row, destroyer.cells[1].col).click();
    const sunk = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(sunk.classList.contains('sunk')).toBe(true);
    expect(sunk.querySelector('.badge')!.textContent).toBe('撃沈');
    expect(q('[data-ref=ai-count]').textContent).toBe('4');
  });

  it('勝敗は1試合につき1回だけ通算成績に記録され、画面右上に表示される', () => {
    expect(q('[data-ref=record]').textContent).toBe('通算成績 0勝 0敗 ｜ 勝率 0%');
    startWithRandomFleet();
    for (const t of app.game.aiBoard.ships.flatMap((s) => s.cells)) {
      cell('ai', t.row, t.col).click();
      vi.advanceTimersByTime(500);
    }
    q<HTMLButtonElement>('[data-ref=view-boards]').click();
    expect(record.record).toEqual({ wins: 1, losses: 0 });
    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(record.record).toEqual({ wins: 1, losses: 0 });
    expect(q('[data-ref=record]').textContent).toBe('通算成績 1勝 0敗 ｜ 勝率 100%');
  });

  it('自分の攻撃が命中・撃沈すると効果音が鳴り、外れは鳴らない', () => {
    startWithRandomFleet();
    const empty = cellsWhere((c) => app.game.aiBoard.shipAtCell(c) === null)[0];
    cell('ai', empty.row, empty.col).click();
    expect(sounds).toEqual([]);
    vi.advanceTimersByTime(500);

    const ship = app.game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const [first, second] = ship.cells.map((c) => ({ ...c }));
    sounds = [];
    cell('ai', first.row, first.col).click();
    expect(sounds[0]).toBe('hit');
    vi.advanceTimersByTime(500);
    sounds = [];
    cell('ai', second.row, second.col).click();
    expect(sounds[0]).toBe('sunk');
  });

  it('AIの攻撃があなたの船に命中したときも効果音が鳴る', () => {
    startWithRandomFleet();
    let aiHits = 0;
    while (app.game.phase === 'playing' && aiHits === 0) {
      const empty = cellsWhere((c) => !app.game.aiBoard.hasBeenShot(c) && app.game.aiBoard.shipAtCell(c) === null)[0];
      cell('ai', empty.row, empty.col).click();
      sounds = [];
      vi.advanceTimersByTime(500);
      aiHits = root.querySelectorAll('[data-owner=player].hit').length;
    }
    expect(sounds.length).toBe(1);
    expect(['hit', 'sunk']).toContain(sounds[0]);
  });

  it('効果音ボタンでON/OFFを切り替えられ、OFFの間は鳴らない', () => {
    const toggle = q<HTMLButtonElement>('[data-ref=sound-toggle]');
    expect(toggle.textContent).toBe('効果音：ON');
    toggle.click();
    expect(sound.muted).toBe(true);
    expect(toggle.textContent).toBe('効果音：OFF');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    startWithRandomFleet();
    const target = app.game.aiBoard.ships[0].cells[0];
    cell('ai', target.row, target.col).click();
    expect(sounds).toEqual([]);
  });

  it('クリックやキー操作のたびに音を準備する（AIのタイマーで鳴る音がブラウザに止められないように）', () => {
    q<HTMLButtonElement>('[data-ref=random]').click();
    expect(sound.unlock).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(sound.unlock).toHaveBeenCalledTimes(2);
  });
});
