import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/game/types';
import { CELL, EFFECTS, orientTransform, PALETTES, SHIP_IDS, shipIcon, shipSegment } from '../src/ui/sprites';

const svgOf = (url: string) => decodeURIComponent(url.replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));

describe('船のイラスト（SVG）', () => {
  it('艦隊のすべての船にイラストがあり、全体画像は「長さ×1マス」の大きさ', () => {
    expect(SHIP_IDS.sort()).toEqual(FLEET.map((t) => t.id).sort());
    for (const type of FLEET) {
      const svg = svgOf(shipIcon(type.id, 'player'));
      expect(svg).toContain(`viewBox="0 0 ${type.length * CELL} ${CELL}"`);
      expect(svg).toContain(PALETTES.player.edge);
    }
  });

  it('マスごとの切り抜きは、横向きなら左から、縦向きなら上から順に1マス分ずつ', () => {
    expect(shipSegment('destroyer', 'horizontal', 1, 'player')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(svgOf(shipSegment('destroyer', 'horizontal', 1, 'player'))).toContain(`viewBox="${CELL} 0 ${CELL} ${CELL}"`);
    expect(svgOf(shipSegment('cruiser', 'vertical', 2, 'enemy'))).toContain(`viewBox="0 ${2 * CELL} ${CELL} ${CELL}"`);
  });

  it('自分の船は右（縦なら上）、敵の船は左（縦なら下）を向く', () => {
    // Bow tip of a right-facing drawing is at (length*CELL, 50); apply each matrix to it.
    const bow = (t: string, len: number) => {
      if (!t) return { x: len * CELL, y: 50 };
      const [a, b, c, d, e, f] = t.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const x = len * CELL;
      return { x: a * x + c * 50 + e, y: b * x + d * 50 + f };
    };
    expect(bow(orientTransform(3, 'horizontal', 'player'), 3)).toEqual({ x: 300, y: 50 });
    expect(bow(orientTransform(3, 'horizontal', 'enemy'), 3)).toEqual({ x: 0, y: 50 });
    expect(bow(orientTransform(3, 'vertical', 'player'), 3)).toEqual({ x: 50, y: 0 });
    expect(bow(orientTransform(3, 'vertical', 'enemy'), 3)).toEqual({ x: 50, y: 300 });
  });

  it('撃沈した船は焦げた色（wreck）で描かれる', () => {
    expect(svgOf(shipIcon('battleship', 'player', 'wreck'))).toContain(PALETTES.wreck.hull);
    expect(svgOf(shipIcon('battleship', 'player', 'wreck'))).not.toContain(PALETTES.player.hull);
  });

  it('命中・外れ・ミサイルの画像を作れる', () => {
    for (const url of [EFFECTS.hit(), EFFECTS.miss(), EFFECTS.missile('player'), EFFECTS.missile('enemy')]) {
      expect(svgOf(url)).toMatch(/^<svg /);
    }
    expect(svgOf(EFFECTS.missile('enemy'))).toContain(PALETTES.enemy.light);
  });
});
