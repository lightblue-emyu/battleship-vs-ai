import type { Orientation } from '../game/types';

/**
 * Retro pixel-art sprites in the style of 8-bit space shooters.
 *
 * Each ship is drawn facing right as a grid of letters: every 8x8 block is
 * one board cell, and each letter is a palette colour ('.' = transparent).
 * The art is turned into SVG so it stays sharp at any size.
 */
const CELL_PX = 8;

const SHIP_ART: Record<string, string[]> = {
  carrier: [
    '....LLLLLLLLLLLLLLLLLLLLLLLLLLLLL.......',
    '..LLGGGGGGGGGGGGGGGGGGGGGGGGGGGGGLL.....',
    'YOLGGDDDDDDDDDDCCCCDDDDCCCCDDDDDDGGLW...',
    'YOLGDDWWWWDDDDCCWWCCDDCCWWCCDDDDDDDGLLWW',
    'YOLGDDWWWWDDDDCCWWCCDDCCWWCCDDDDDDDGLLWW',
    'YOLGGDDDDDDDDDDCCCCDDDDCCCCDDDDDDGGLW...',
    '..LLGGGGGGGGGGGGGGGGGGGGGGGGGGGGGLL.....',
    '....LLLLLLLLLLLLLLLLLLLLLLLLLLLLL.......',
  ],
  battleship: [
    '........WWWW......WWWW..........',
    '.......WBBBBW....WBBBBW.........',
    '..WWWWWWWWWWWWWWWWWWWWWWWWW.....',
    'YOWLLLLLRLLLLLLLLRLLLLLLLLLLWWW.',
    'YOWGGGGGRGGGGCCGGRGGGGGGGGGLLLWW',
    '..WWWWWWWWWWWWWWWWWWWWWWWWW.....',
    '.......WBBBBW....WBBBBW.........',
    '........WWWW......WWWW..........',
  ],
  cruiser: [
    '......WW....WW..........',
    '.....WBBW..WBBW.........',
    '...WWWWWWWWWWWWWWW......',
    'YOWLLLLLLLLRLLLLLLLWWW..',
    'YOWGGGGGGGGRGGGGCCGLLLWW',
    '...WWWWWWWWWWWWWWW......',
    '.....WBBW..WBBW.........',
    '......WW....WW..........',
  ],
  submarine: [
    '........WWWW............',
    '......WCCCCW............',
    '..LLLLLWWWWWLLLLLLL.....',
    'YOLGGGGGGGGGGGGGGGGLLW..',
    'YOLDDDDDDDDDDDDDDDDLLWW.',
    '..LLLLLLLLLLLLLLLLLL....',
    '....BB.......BB.........',
    '........................',
  ],
  destroyer: [
    '....WW..........',
    '....WBW.........',
    '..WWWWWWWW......',
    'YOWLLLLLLLLWWW..',
    'YOWGGGGGCCGLLLWW',
    '..WWWWWWWW......',
    '....WBW.........',
    '....WW..........',
  ],
};

const EXPLOSION = [
  '...Y....',
  '.Y.OY.Y.',
  '..ORRO..',
  'YORWWROY',
  '.ORWWRO.',
  '..ORRO..',
  '.Y.OY.Y.',
  '....Y...',
];

const SPLASH = [
  '........',
  '........',
  '...CC...',
  '..C..C..',
  '..C..C..',
  '...CC...',
  '........',
  '........',
];

type Palette = Record<string, string>;

/** Colours picked from the NES palette. */
export const PALETTES = {
  player: { W: '#fcfcfc', L: '#bcbcbc', G: '#7c7c7c', D: '#404058', B: '#0058f8', C: '#3cbcfc', R: '#f83800', O: '#fca044', Y: '#f8b800' },
  enemy: { W: '#fcd8a8', L: '#fc7460', G: '#a81000', D: '#581800', B: '#f8b800', C: '#fcfc00', R: '#fcfcfc', O: '#3cbcfc', Y: '#0078f8' },
  wreck: { W: '#7c7c7c', L: '#585858', G: '#404040', D: '#202020', B: '#a81000', C: '#a81000', R: '#f83800', O: '#202020', Y: '#202020' },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
export type Facing = 'player' | 'enemy';

export function shipArt(shipId: string): string[] {
  const art = SHIP_ART[shipId];
  if (!art) throw new Error(`no sprite for ${shipId}`);
  return art;
}

/** Player ships face right (up when vertical); enemy ships face left (down). */
export function orientArt(art: string[], orientation: Orientation, facing: Facing): string[] {
  const width = art[0].length;
  if (orientation === 'horizontal') {
    return facing === 'player' ? art : art.map((row) => [...row].reverse().join(''));
  }
  // Rotate 90° counter-clockwise so the nose (right edge) points up.
  const up = Array.from({ length: width }, (_, i) => art.map((row) => row[width - 1 - i]).join(''));
  return facing === 'player' ? up : [...up].reverse();
}

function toSvg(art: string[], palette: Palette, viewBox: string): string {
  const rects: string[] = [];
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (row[x + run] === ch) run++;
      if (ch !== '.') rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[ch]}"/>`);
      x += run;
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    rects.join('') +
    '</svg>'
  );
}

function dataUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const cache = new Map<string, string>();
function cached(key: string, build: () => string): string {
  let value = cache.get(key);
  if (value === undefined) {
    value = build();
    cache.set(key, value);
  }
  return value;
}

/** CSS `url(...)` for the part of a ship that sits in cell number `index`. */
export function shipSegment(
  shipId: string,
  orientation: Orientation,
  index: number,
  facing: Facing,
  palette: PaletteName = facing,
): string {
  return cached(`seg:${shipId}:${orientation}:${index}:${facing}:${palette}`, () => {
    const art = orientArt(shipArt(shipId), orientation, facing);
    const offset = index * CELL_PX;
    const viewBox = orientation === 'horizontal' ? `${offset} 0 ${CELL_PX} ${CELL_PX}` : `0 ${offset} ${CELL_PX} ${CELL_PX}`;
    return dataUrl(toSvg(art, PALETTES[palette], viewBox));
  });
}

/** CSS `url(...)` for a whole ship drawn horizontally (used in the fleet lists). */
export function shipIcon(shipId: string, facing: Facing, palette: PaletteName = facing): string {
  return cached(`icon:${shipId}:${facing}:${palette}`, () => {
    const art = orientArt(shipArt(shipId), 'horizontal', facing);
    return dataUrl(toSvg(art, PALETTES[palette], `0 0 ${art[0].length} ${art.length}`));
  });
}

export const EFFECTS = {
  hit: () => cached('fx:hit', () => dataUrl(toSvg(EXPLOSION, PALETTES.player, '0 0 8 8'))),
  miss: () => cached('fx:miss', () => dataUrl(toSvg(SPLASH, PALETTES.player, '0 0 8 8'))),
};

export const SPRITE_ART = { ships: SHIP_ART, explosion: EXPLOSION, splash: SPLASH, cellPx: CELL_PX };
