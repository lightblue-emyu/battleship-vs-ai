// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSunk } from '../src/game/board';
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
  app = mountApp(root, { random: seededRandom(9), missileMs: 0, sound, record });
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
  app = mountApp(root, { random: seededRandom(9), missileMs: 0, sound, record, ...options });
}

/** In the AI's attack round, choose no move so the AI fires. */
function passDefence() {
  if (app.game.phase === 'playing' && app.game.turn === 'ai') q<HTMLButtonElement>('[data-ref=no-move]').click();
}

/** Fires at `coord` in the player's round (passing the AI's round first if needed). */
function playerShoots(coord: { row: number; col: number }) {
  passDefence();
  cell('ai', coord.row, coord.col).click();
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

  it('あなたの攻撃はマスを押した瞬間に発射され、守りのターンは「移動なし」を押すとAIが発射する', () => {
    startWithRandomFleet();
    expect(q('[data-ref=status]').textContent).toContain('あなたの攻撃ターン');
    expect(q<HTMLButtonElement>('[data-ref=no-move]').disabled).toBe(true);
    cell('ai', 0, 0).click();
    expect(marks('ai')).toBe(1);
    expect(q('[data-ref=status]').textContent).toMatch(/A1：(外れ|命中)/);
    expect(app.game.turn).toBe('ai');
    expect(q('[data-ref=status]').textContent).toContain('移動なし');
    expect(marks('player')).toBe(0);

    q<HTMLButtonElement>('[data-ref=no-move]').click();
    expect(marks('player')).toBe(1);
    expect(app.game.turn).toBe('player');
    expect(q('[data-ref=log]').children).toHaveLength(3);
  });

  it('シンキングタイムはなく、待っていても勝手には進まない', () => {
    startWithRandomFleet();
    expect(root.querySelector('[data-ref=thinking]')).toBeNull();
    vi.advanceTimersByTime(10000);
    expect(marks('ai')).toBe(0);
    expect(app.game.turn).toBe('player');
    cell('ai', 0, 0).click();
    vi.advanceTimersByTime(10000);
    expect(marks('player')).toBe(0);
    expect(app.game.turn).toBe('ai');
  });

  it('ミサイルが飛んでいる間は、攻撃も船の選択も「移動なし」もできない', () => {
    remount({ missileMs: 800 });
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    expect(root.querySelector('.missile[data-shooter=player]')).not.toBeNull();
    expect(q<HTMLButtonElement>('[data-ref=no-move]').disabled).toBe(true);
    q<HTMLButtonElement>('[data-ref=no-move]').click();
    expect(marks('player')).toBe(0);
    vi.advanceTimersByTime(800);
    expect(marks('ai')).toBe(1);

    q<HTMLButtonElement>('[data-ref=no-move]').click();
    expect(root.querySelector('.missile[data-shooter=ai]')).not.toBeNull();
    expect(q('[data-ref=status]').textContent).toMatch(/^AIが.+へミサイル発射！/);
    expect(cell('ai', 5, 5).disabled).toBe(true);
    cell('ai', 5, 5).click();
    root.querySelector<HTMLButtonElement>('button.cell[data-owner=player].ship')!.click();
    expect(marks('ai')).toBe(1);
    expect(root.querySelector('button.cell[data-owner=player].selected')).toBeNull();

    vi.advanceTimersByTime(800);
    expect(root.querySelector('.missile')).toBeNull();
    expect(marks('player')).toBe(1);
    cell('ai', 5, 5).click();
    expect(marks('ai')).toBe(2);
  });

  it('一度撃ったマスも、もう一度狙って撃てる', () => {
    startWithRandomFleet();
    playerShoots({ row: 3, col: 3 });
    passDefence();
    expect(cell('ai', 3, 3).disabled).toBe(false);
    cell('ai', 3, 3).click();
    expect(app.game.shots.player.total).toBe(2);
    expect(app.game.turn).toBe('ai');
  });

  it('敵を全滅させると勝利画面が出て、再スタートで初期状態に戻る', () => {
    remount({ difficulty: 'easy' });
    startWithRandomFleet();
    const targets = app.game.aiBoard.ships.flatMap((s) => s.cells);
    for (const t of targets) playerShoots(t);
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

  it('ミサイルが飛んでいる途中に再スタートしても、新しいゲームに前の攻撃が紛れ込まない', () => {
    remount({ missileMs: 800 });
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    q<HTMLButtonElement>('[data-ref=restart]').click();
    vi.advanceTimersByTime(2000);
    expect(app.game.phase).toBe('placement');
    expect(root.querySelectorAll('button.cell.hit, button.cell.miss')).toHaveLength(0);
  });

  it('敗北後は結果画面を閉じて、公開された敵の残りの船を確認できる', () => {
    startWithRandomFleet();
    for (let i = 0; i < 1000 && app.game.phase === 'playing'; i++) {
      if (app.game.turn === 'ai') {
        passDefence();
        continue;
      }
      const empty = cellsWhere((c) => !app.game.aiBoard.hasBeenShot(c) && app.game.aiBoard.shipAtCell(c) === null)[0];
      cell('ai', empty.row, empty.col).click();
    }
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

  it('守りのターンに船を選び、光ったマスをクリックすると1マス動いてからAIが発射する', () => {
    startWithRandomFleet();
    const pick = () => app.game.playerBoard.ships.find((s) => app.game.playerBoard.legalOffsets(s).length > 0)!;
    let ship = pick();
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(root.querySelectorAll('.cell.selected')).toHaveLength(0);

    cell('ai', 0, 0).click();
    expect(app.game.turn).toBe('ai');
    ship = pick();
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    expect(cell('player', ship.cells[0].row, ship.cells[0].col).classList.contains('selected')).toBe(true);
    expect(q('[data-ref=move-info]').textContent).toContain(ship.type.name);
    const offsets = app.game.playerBoard.legalOffsets(ship);
    const newCells = (o: { row: number; col: number }) =>
      ship.cells.map((c) => ({ row: c.row + o.row, col: c.col + o.col })).filter((c) => !ship.cells.some((d) => d.row === c.row && d.col === c.col));
    const expected = new Set(offsets.flatMap(newCells).map((c) => `${c.row},${c.col}`));
    expect(root.querySelectorAll('[data-owner=player].reach')).toHaveLength(expected.size);

    const before = ship.cells.map((c) => ({ ...c }));
    for (const c of before) cell('player', c.row, c.col).click();
    expect(ship.cells).toEqual(before);
    expect(app.game.turn).toBe('ai');

    const [offset] = offsets;
    const [dest] = newCells(offset);
    cell('player', dest.row, dest.col).click();
    expect(ship.cells).toEqual(before.map((c) => ({ row: c.row + offset.row, col: c.col + offset.col })));
    expect(q('[data-ref=log]').textContent).toContain(`あなた → ${ship.type.name}を`);
    expect(marks('player')).toBe(1);
    expect(app.game.turn).toBe('player');
  });

  it('矢印キーでも1マス動かせて、Escで選択を解除できる', () => {
    startWithRandomFleet();
    cell('ai', 0, 0).click();
    const ship = app.game.playerBoard.ships.find((s) => app.game.playerBoard.canMoveBy(s, { row: 0, col: 1 }))!;
    cell('player', ship.cells[0].row, ship.cells[0].col).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelectorAll('.cell.selected')).toHaveLength(0);
    expect(q('[data-ref=status]').textContent).toContain('AIの攻撃ターン');
    expect(app.game.turn).toBe('ai');

    const start = { ...ship.cells[0] };
    cell('player', start.row, start.col).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(ship.cells[0]).toEqual({ row: start.row, col: start.col + 1 });
    expect(app.game.turn).toBe('player');
  });

  it('被弾した船も、沈んでいなければ守りのターンに動かせる', () => {
    startWithRandomFleet();
    const shootAny = () => {
      const c = cellsWhere((x) => !app.game.aiBoard.hasBeenShot(x))[0];
      cell('ai', c.row, c.col).click();
    };
    for (let i = 0; i < 200 && !app.game.playerBoard.ships.some((s) => s.hitCount > 0 && !isSunk(s)); i++) {
      if (app.game.turn === 'ai') passDefence();
      else shootAny();
    }
    if (app.game.turn === 'player') shootAny();
    const damaged = app.game.playerBoard.ships.find((s) => s.hitCount > 0 && !isSunk(s) && app.game.playerBoard.legalOffsets(s).length > 0)!;
    cell('player', damaged.cells[0].row, damaged.cells[0].col).click();
    expect(q('[data-ref=move-info]').textContent).toContain(damaged.type.name);
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
    const cards = [...root.querySelectorAll('.side .card h3')].map((h) => h.textContent);
    expect(cards[0]).toContain('自艦隊');
    expect(cards[1]).toContain('敵艦隊');
    expect(rows().find((li) => li.textContent!.includes('駆逐艦'))!.querySelector('.hits')!.textContent).toBe('被弾 0/2');

    const destroyer = app.game.aiBoard.ships.find((s) => s.type.id === 'destroyer')!;
    const [first, second] = destroyer.cells.map((c) => ({ ...c }));
    playerShoots(first);
    const row = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(row.querySelector('.badge')!.textContent).toBe('被弾');
    expect(row.querySelector('.hits')!.textContent).toBe('被弾 1/2');
    expect(row.querySelectorAll('.hull s.hit')).toHaveLength(1);

    playerShoots(second);
    const sunk = rows().find((li) => li.textContent!.includes('駆逐艦'))!;
    expect(sunk.classList.contains('sunk')).toBe(true);
    expect(sunk.querySelector('.badge')!.textContent).toBe('撃沈');
    expect(sunk.querySelector('.hits')!.textContent).toBe('被弾 2/2');
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
      passDefence();
      sounds = [];
      cell('ai', target.row, target.col).click();
      expect(sounds).toEqual([effect]);
    }
  });

  it('AIの攻撃があなたの船に命中したときも効果音が鳴る', () => {
    startWithRandomFleet();
    let aiHits = 0;
    while (app.game.phase === 'playing' && aiHits === 0) {
      const empty = cellsWhere((c) => !app.game.aiBoard.hasBeenShot(c) && app.game.aiBoard.shipAtCell(c) === null)[0];
      cell('ai', empty.row, empty.col).click();
      sounds = [];
      passDefence();
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
