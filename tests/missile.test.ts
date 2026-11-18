// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp } from '../src/ui/app';
import { flightPath } from '../src/ui/missile';
import type { SoundEffect } from '../src/ui/sound';
import { SPRITE_ART } from '../src/ui/sprites';
import { seededRandom } from './helpers';

describe('ミサイルの弾道（flightPath）', () => {
  it('撃った側から狙ったマスまで、山なりの線を描いて飛ぶ', () => {
    const from = { x: 0, y: 100 };
    const to = { x: 400, y: 60 };
    const path = flightPath(from, to);
    expect(path[0]).toMatchObject(from);
    expect(path.at(-1)!.x).toBeCloseTo(to.x);
    expect(path.at(-1)!.y).toBeCloseTo(to.y);
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(to.y);
    expect(path[0].angle).toBeLessThan(0);
    expect(path[0].angle).toBeGreaterThan(-90);
    expect(path.at(-1)!.angle).toBeGreaterThan(0);
  });

  it('AIのミサイルは右から左へ向かって飛ぶ', () => {
    const path = flightPath({ x: 400, y: 100 }, { x: 50, y: 100 });
    expect(Math.abs(path[0].angle)).toBeGreaterThan(90);
    expect(path.at(-1)!.x).toBeCloseTo(50);
  });

  it('ミサイルのドット絵は全行が同じ幅', () => {
    const widths = new Set(SPRITE_ART.missile.map((row) => row.length));
    expect(widths.size).toBe(1);
  });
});

describe('ミサイルの演出（画面）', () => {
  let root: HTMLElement;
  let app: ReturnType<typeof mountApp>;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const cell = (owner: 'player' | 'ai', row: number, col: number) =>
    q<HTMLButtonElement>(`.cell[data-owner=${owner}][data-row="${row}"][data-col="${col}"]`);

  let sounds: SoundEffect[];

  function mount() {
    root = document.createElement('div');
    document.body.append(root);
    sounds = [];
    const sound = { muted: false, unlock: vi.fn(), play: (effect: SoundEffect) => void sounds.push(effect) };
    app = mountApp(root, { random: seededRandom(9), aiDelayMs: 500, missileMs: 400, sound });
    q<HTMLButtonElement>('[data-ref=random]').click();
    q<HTMLButtonElement>('[data-ref=start]').click();
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    app.destroy();
    root.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('あなたの攻撃：ミサイルが敵陣のマスへ飛び、着弾するまで結果を隠す', () => {
    mount();
    cell('ai', 4, 6).click();
    const missile = q('.grid .missile');
    expect(missile.dataset.shooter).toBe('player');
    expect(cell('ai', 4, 6).classList.contains('incoming')).toBe(true);
    expect(app.game.aiBoard.hasBeenShot({ row: 4, col: 6 })).toBe(true);

    vi.advanceTimersByTime(400);
    expect(root.querySelectorAll('.missile')).toHaveLength(0);
    expect(root.querySelectorAll('.incoming')).toHaveLength(0);
    const target = cell('ai', 4, 6);
    expect(target.classList.contains('hit') || target.classList.contains('miss')).toBe(true);
  });

  it('AIの攻撃：AIのミサイルが自陣のマスへ飛んでくる', () => {
    mount();
    cell('ai', 0, 0).click();
    vi.advanceTimersByTime(400);
    expect(root.querySelectorAll('.missile')).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(q('.grid .missile').dataset.shooter).toBe('ai');
    const incoming = root.querySelectorAll<HTMLElement>('.cell.incoming');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].dataset.owner).toBe('player');
    expect(app.game.playerBoard.hasBeenShot({ row: Number(incoming[0].dataset.row), col: Number(incoming[0].dataset.col) })).toBe(true);
    vi.advanceTimersByTime(400);
    expect(root.querySelectorAll('.missile, .incoming')).toHaveLength(0);
  });

  it('飛んでいる途中で「最初からやり直す」と、ミサイルも消える', () => {
    mount();
    cell('ai', 2, 2).click();
    expect(root.querySelectorAll('.missile')).toHaveLength(1);
    q<HTMLButtonElement>('[data-ref=restart]').click();
    expect(root.querySelectorAll('.missile, .incoming')).toHaveLength(0);
  });

  it('「視差効果を減らす」設定（prefers-reduced-motion）ではミサイルを飛ばさない', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    mount();
    cell('ai', 3, 3).click();
    expect(root.querySelectorAll('.missile, .incoming')).toHaveLength(0);
    expect(cell('ai', 3, 3).classList.contains('hit') || cell('ai', 3, 3).classList.contains('miss')).toBe(true);
  });

  it('メッセージ・戦況ログ・効果音は、ミサイルが着弾したときに出る', () => {
    mount();
    const target = app.game.aiBoard.ships[0].cells[0];
    cell('ai', target.row, target.col).click();
    expect(q('[data-ref=status]').textContent).toContain('ミサイル発射');
    expect(q('[data-ref=status]').textContent).not.toContain('命中');
    expect(sounds).toEqual([]);
    expect(root.textContent).not.toContain('あなた →');

    vi.advanceTimersByTime(400);
    expect(q('[data-ref=status]').textContent).toContain('命中');
    expect(sounds).toEqual(['hit']);
    expect(root.textContent).toContain('あなた →');
  });

  it('AIの攻撃も、着弾してから結果と効果音が出る', () => {
    mount();
    cell('ai', 0, 0).click();
    vi.advanceTimersByTime(500);
    expect(q('[data-ref=status]').textContent).toContain('AIが');
    expect(q('[data-ref=status]').textContent).toContain('ミサイル発射');
    expect(root.textContent).not.toContain('AI →');
    vi.advanceTimersByTime(400);
    expect(q('[data-ref=status]').textContent).toContain('AIの攻撃');
    expect(root.textContent).toContain('AI →');
  });
});
