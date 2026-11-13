import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/game/types';
import { orientArt, PALETTES, SPRITE_ART, shipSegment } from '../src/ui/sprites';

describe('ドット絵スプライト', () => {
  it('どの船も「船の長さ×8」ドット幅・8ドット高さで、パレットにある色だけを使う', () => {
    for (const type of FLEET) {
      const art = SPRITE_ART.ships[type.id];
      expect(art).toHaveLength(SPRITE_ART.cellPx);
      for (const row of art) {
        expect(row).toHaveLength(type.length * SPRITE_ART.cellPx);
        for (const ch of row) if (ch !== '.') expect(Object.keys(PALETTES.player)).toContain(ch);
      }
    }
  });

  it('縦向きにすると幅と高さが入れ替わり、自機は上・敵は下を向く', () => {
    const art = ['..W', '..W'];
    expect(orientArt(art, 'vertical', 'player')).toEqual(['WW', '..', '..']);
    expect(orientArt(art, 'vertical', 'enemy')).toEqual(['..', '..', 'WW']);
    expect(orientArt(art, 'horizontal', 'enemy')).toEqual(['W..', 'W..']);
  });

  it('マスごとの切り抜き画像（SVG）を作れる', () => {
    expect(shipSegment('destroyer', 'horizontal', 1, 'player')).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(decodeURIComponent(shipSegment('destroyer', 'horizontal', 1, 'player'))).toContain('viewBox="8 0 8 8"');
  });
});
