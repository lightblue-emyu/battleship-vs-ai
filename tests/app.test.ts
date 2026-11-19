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
const THINK = 500;

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
  app = mountApp(root, { random: seededRandom(9), thinkMs: THINK, missileMs: 0, sound, record });
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

function remount(options: Parameters<typeof mountApp>[1] = {}) {
  app.destroy();
  app = mountApp(root, { random: seededRandom(9), thinkMs: THINK, missileMs: 0, sound, record, ...options });
}

/** Lets the AI's attack round run out (if it is the AI's turn), then fires at `coord` in the player's round. */
function playerShoots(coord: { row: number; col: number }) {
  if (app.game.turn !== 'player') vi.advanceTimersByTime(THINK);
  cell('ai', coord.row, coord.col).click();
  vi.advanceTimersByTime(THINK);
}

const marks = (owner: 'player' | 'ai') =>
  root.querySelectorAll(`button.cell[data-owner=${owner}].hit, button.cell[data-owner=${owner}].miss`).length;

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

  it('自陣・敵陣の下に、動く海（装飾用）が1枚ずつ敷かれている', () => {
    const seas = [...root.querySelectorAll<HTMLElement>('.grid > .sea')];
    expect(seas.map((s) => s.dataset.owner)).toEqual(['player', 'ai']);
    for (const sea of seas) expect(sea.getAttribute('aria-hidden')).toBe('true');
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

  it('攻撃側は5秒のシンキングタイムに狙うマスを選び、時間切れで発射される', () => {
    remount({ thinkMs: undefined });
    startWithRandomFleet();
    expect(q('[data-ref=thinking]').hidden).toBe(false);
    expect(q('[data-ref=thinking-role]').textContent).toContain('あなたの攻撃');
    expect(q('[data-ref=thinking-left]').textContent).toBe('残り 5 秒');
    cell('ai', 0, 0).click();
    expect(cell('ai', 0, 0).classList.contains('planned')).toBe(true);
    expect(q('[data-ref=status]').textContent).toContain('A1に狙いを定めました');
    vi.advanceTimersByTime(2000);
    expect(q('[data-ref=thinking-left]').textContent).toBe('残り 3 秒');
    expect(marks('ai')).toBe(0);

    vi.advanceTimersByTime(3000);
    expect(marks('ai')).toBe(1);
    expect(q('[data-ref=status]').textContent).toMatch(/A1：(外れ|命中)/);
    expect(app.game.turn).toBe('ai');
    expect(q('[data-ref=thinking-role]').textContent).toContain('あなたの守り');

    vi.advanceTimersByTime(5000);
    expect(marks('player')).toBe(1);
    expect(app.game.turn).toBe('player');
    expect(q('[data-ref=log]').children).toHaveLength(3);
  });

  it('狙いを選ばずに時間切れになると、そのターンは攻撃なし', () => {
    startWithRandomFleet();
    vi.advanceTimersByTime(THINK);
    expect(marks('ai')).toBe(0);
    expect(app.game.turn).toBe('ai');
    expect(q('[data-ref=log]').textContent).toContain('攻撃なし');
  });

  it('狙いは時間切れまで変更・取り消しでき、AIの攻撃ターンには敵陣を押せない', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    cell('ai', 0, 1).click();
    expect(root.querySelectorAll('.cell.planned')).toHaveLength(1);
    expect(cell('ai', 0, 1).classList.contains('planned')).toBe(true);
    cell('ai', 0, 1).click();
    expect(root.querySelectorAll('.cell.planned')).toHaveLength(0);
    vi.advanceTimersByTime(THINK);
    expect(marks('ai')).toBe(0);
    expect(cell('ai', 5, 5).disabled).toBe(true);
    cell('ai', 5, 5).click();
    expect(app.game.plannedTarget).toBeNull();
  });

  it('ミサイルが飛んでいる間は、狙いも船の選択もできない', () => {
    remount({ missileMs: 800 });
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    vi.advanceTimersByTime(THINK);
    expect(root.querySelector('.missile[data-shooter=player]')).not.toBeNull();
    vi.advanceTimersByTime(800);
    expect(marks('ai')).toBe(1);
    vi.advanceTimersByTime(THINK);
    expect(root.querySelector('.missile[data-shooter=ai]')).not.toBeNull();
    expect(q('[data-ref=status]').textContent).toMatch(/^AIが.+へミサイル発射！/);
    expect(cell('ai', 5, 5).disabled).toBe(true);

    cell('ai', 5, 5).click();
    root.querySelector<HTMLButtonElement>('button.cell[data-owner=player].ship')!.click();
    expect(app.game.plannedTarget).toBeNull();
    expect(root.querySelector('button.cell[data-owner=player].selected')).toBeNull();

    vi.advanceTimersByTime(800);
    expect(root.querySelector('.missile')).toBeNull();
    expect(marks('player')).toBe(1);
    cell('ai', 5, 5).click();
    expect(app.game.plannedTarget).toEqual({ row: 5, col: 5 });
  });

  it('攻撃済みのマスは狙えない', () => {
    startWithRandomFleet();
    playerShoots({ row: 3, col: 3 });
    vi.advanceTimersByTime(THINK);
    cell('ai', 3, 3).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.game.plannedTarget).toBeNull();
    expect(cell('ai', 3, 3).disabled).toBe(true);
  });

  it('敵を全滅させると勝利画面が出て、再スタートで初期状態に戻る', () => {
    remount({ difficulty: 'easy' });
    startWithRandomFleet();
    const targets = app.game.aiBoard.ships.flatMap((s) => s.cells);
    for (const t of targets) playerShoots(t);
    expect(q('[data-ref=result]').hidden).toBe(false);
    expect(q('[data-ref=result-title]').textContent).toBe('VICTORY');
    expect(q('[data-ref=result-text]').textContent).toContain('あなたの勝利');
    expect(q('[data-ref=thinking]').hidden).toBe(true);
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

  it('シンキングタイム中に再スタートしても、新しいゲームに前の攻撃が紛れ込まない', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    q<HTMLButtonElement>('[data-ref=restart]').click();
    vi.advanceTimersByTime(2000);
    expect(app.game.phase).toBe('placement');
    expect(root.querySelectorAll('button.cell.hit, button.cell.miss')).toHaveLength(0);
  });

  it('敗北後は結果画面を閉じて、公開された敵の残りの船を確認できる', () => {
    startWithRandomFleet();
    for (let i = 0; i < 1000 && app.game.phase === 'playing'; i++) vi.advanceTimersByTime(THINK);
    const enemyCells = new Set(app.game.aiBoard.ships.flatMap((s) => s.cells).map((c) => `${c.row},${c.col}`));
    expect(app.game.winner).toBe('ai');
    expect(q('[data-ref=result]').hidden).toBe(false);

    q<HTMLButtonElement>('[data-ref=view-boards]').click();
    expect(q('[data-ref=result]').hidden).toBe(true);
    expect(root.querySelectorAll('button.cell[data-owner=ai].ship')).toHaveLength(enemyCells.size);
    expect(q('[data-ref=status]').textContent).toContain('AIの勝利');

    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(app.game.phase).toBe('placement');
    expect(q('[data-ref=result]').hidden).toBe(true);
  });

  it('守りのターンに船を選んで移動先のマスをクリックすると、時間切れで攻撃より先に動く', () => {
    startWithRandomFleet();
    const pick = () => app.game.playerBoard.ships.find((s) => app.game.playerBoard.legalOffsets(s).length > 0)!;
    let ship = pick();
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(root.querySelectorAll('.cell.selected')).toHaveLength(0);

    vi.advanceTimersByTime(THINK);
    expect(app.game.turn).toBe('ai');
    ship = pick();
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(cell('player', ship.cells[0].row, ship.cells[0].col).classList.contains('selected')).toBe(true);
    const n = ship.type.length - ship.hitCount;
    expect(q('[data-ref=move-info]').textContent).toContain(`${ship.type.name}（${n}×${n}の範囲）`);
    const offsets = app.game.playerBoard.legalOffsets(ship);
    expect(root.querySelectorAll('[data-owner=player].reach')).toHaveLength(offsets.length);

    const [offset] = offsets;
    const centre = ship.cells[Math.floor((ship.cells.length - 1) / 2)];
    const before = ship.cells.map((c) => ({ ...c }));
    cell('player', centre.row + offset.row, centre.col + offset.col).click();
    expect(app.game.plannedMove).toEqual({ ship, offset });
    expect(root.querySelectorAll('[data-owner=player].ghost')).toHaveLength(ship.type.length);
    expect(ship.cells).toEqual(before);

    vi.advanceTimersByTime(THINK);
    expect(ship.cells).toEqual(before.map((c) => ({ row: c.row + offset.row, col: c.col + offset.col })));
    expect(q('[data-ref=log]').textContent).toContain(`あなた → ${ship.type.name}を`);
    expect(marks('player')).toBe(1);
    expect(app.game.turn).toBe('player');
  });

  it('矢印キーでも移動先を動かせて、Escで取り消せる', () => {
    startWithRandomFleet();
    vi.advanceTimersByTime(THINK);
    const ship = app.game.playerBoard.ships.find((s) => app.game.playerBoard.canMoveBy(s, { row: 0, col: 1 }))!;
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(app.game.plannedMove).toEqual({ ship, offset: { row: 0, col: 1 } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(app.game.plannedMove).toBeNull();
    expect(root.querySelectorAll('.cell.selected, .cell.ghost')).toHaveLength(0);
    expect(q('[data-ref=status]').textContent).toContain('AIの攻撃ターン');
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

  it('艦隊パネルに、残りの隻数と各艦の「健在・被弾・撃沈」、自艦の移動範囲が表示される', () => {
    remount({ difficulty: 'easy' });
    startWithRandomFleet();
    const rows = () => [...q('[data-ref=ai-fleet]').children] as HTMLElement[];
    expect(q('[data-ref=ai-count]').textContent).toBe('5');
    expect(rows().map((li) => li.querySelector('.badge')!.textContent)).toEqual(Array(5).fill('健在'));
    expect(q('[data-ref=player-fleet]').children[0].textContent).toContain('移動5×5');

    const destroyer = app.game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const [first, second] = destroyer.cells.map((c) => ({ ...c }));
    playerShoots(first);
    const row = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(row.querySelector('.badge')!.textContent).toBe('被弾');
    expect(row.querySelectorAll('.hull s.hit')).toHaveLength(1);

    playerShoots(second);
    const sunk = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(sunk.classList.contains('sunk')).toBe(true);
    expect(sunk.querySelector('.badge')!.textContent).toBe('撃沈');
    expect(q('[data-ref=ai-count]').textContent).toBe('4');
  });

  it('勝敗は1試合につき1回だけ通算成績に記録され、画面右上に表示される', () => {
    remount({ difficulty: 'easy' });
    expect(q('[data-ref=record]').textContent).toBe('通算成績 0勝 0敗 ｜ 勝率 0%');
    startWithRandomFleet();
    for (const t of app.game.aiBoard.ships.flatMap((s) => s.cells)) playerShoots(t);
    q<HTMLButtonElement>('[data-ref=view-boards]').click();
    expect(record.record).toEqual({ wins: 1, losses: 0 });
    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(record.record).toEqual({ wins: 1, losses: 0 });
    expect(q('[data-ref=record]').textContent).toBe('通算成績 1勝 0敗 ｜ 勝率 100%');
  });

  it('自分の攻撃が命中・撃沈すると効果音が鳴り、外れは鳴らない', () => {
    remount({ difficulty: 'easy' });
    startWithRandomFleet();
    const empty = cellsWhere((c) => app.game.aiBoard.shipAtCell(c) === null)[0];
    playerShoots(empty);
    expect(sounds).toEqual([]);

    const ship = app.game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const [first, second] = ship.cells.map((c) => ({ ...c }));
    for (const [target, effect] of [[first, 'hit'], [second, 'sunk']] as const) {
      vi.advanceTimersByTime(THINK);
      sounds = [];
      cell('ai', target.row, target.col).click();
      vi.advanceTimersByTime(THINK);
      expect(sounds).toEqual([effect]);
    }
  });

  it('AIの攻撃があなたの船に命中したときも効果音が鳴る', () => {
    startWithRandomFleet();
    let aiHits = 0;
    while (app.game.phase === 'playing' && aiHits === 0) {
      sounds = [];
      vi.advanceTimersByTime(THINK);
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
    playerShoots(app.game.aiBoard.ships[0].cells[0]);
    expect(sounds).toEqual([]);
  });

  it('クリックやキー操作のたびに音を準備する（AIのタイマーで鳴る音がブラウザに止められないように）', () => {
    q<HTMLButtonElement>('[data-ref=random]').click();
    expect(sound.unlock).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(sound.unlock).toHaveBeenCalledTimes(2);
  });
});
