import { FLEET, type Orientation } from '../game/types';

/**
 * Top-down warship illustrations drawn as vector SVG.
 *
 * Every ship is drawn facing right (bow on the right) on a canvas of
 * `length * CELL` x `CELL` units, so each board cell is one CELL-wide slice.
 * The drawing is rotated / mirrored for vertical and enemy ships and then cut
 * into per-cell slices with the SVG viewBox.
 */
export const CELL = 100;

export interface Palette {
  hull: string;
  edge: string;
  deck: string;
  detail: string;
  turret: string;
  barrel: string;
  light: string;
  line: string;
}

export const PALETTES = {
  player: { hull: '#a9b8c9', edge: '#0d1622', deck: '#6f8197', detail: '#3a4a5e', turret: '#e1e9f2', barrel: '#24303e', light: '#3ee0ff', line: '#f2f7ff' },
  enemy: { hull: '#b3a0a8', edge: '#1d1015', deck: '#7d6670', detail: '#4a3540', turret: '#ebdde2', barrel: '#2e1c24', light: '#ff5a5f', line: '#fff0f2' },
  wreck: { hull: '#4a5058', edge: '#0e1013', deck: '#30353c', detail: '#1f2329', turret: '#5d646e', barrel: '#16191d', light: '#ff7a3d', line: '#6b727d' },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
export type Facing = 'player' | 'enemy';

/** Angular stealth hull: chamfered stern (left), long wave-piercing bow (right). */
function hullPoints(len: number, beam: number, bowStart = 0.68): string {
  const L = len * CELL;
  const b = beam;
  return [
    [6, 50 - b * 0.7], [16, 50 - b], [L * bowStart, 50 - b], [L - 2, 50],
    [L * bowStart, 50 + b], [16, 50 + b], [6, 50 + b * 0.7],
  ].map(([x, y]) => `${x},${y}`).join(' ');
}

/** Two-tone metal shading: lit upper facet, shaded lower facet, bright ridge line. */
function metal(p: Palette): string {
  return (
    '<defs>' +
    `<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.turret}"/><stop offset="0.5" stop-color="${p.hull}"/>` +
    `<stop offset="0.5" stop-color="${p.deck}"/><stop offset="1" stop-color="${p.detail}"/></linearGradient>` +
    `<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.light}" stop-opacity="0"/><stop offset="0.5" stop-color="${p.light}"/>` +
    `<stop offset="1" stop-color="${p.light}" stop-opacity="0"/></linearGradient>` +
    '</defs>'
  );
}

function hull(p: Palette, len: number, beam: number): string {
  const L = len * CELL;
  return (
    metal(p) +
    `<polygon points="${hullPoints(len, beam)}" fill="url(#m)" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/>` +
    `<line x1="14" y1="50" x2="${L - 6}" y2="50" stroke="${p.line}" stroke-opacity="0.35" stroke-width="1"/>` +
    `<polyline points="18,${50 + beam - 3} ${L * 0.66},${50 + beam - 3} ${L - 10},51" fill="none" stroke="url(#s)" stroke-width="1.6"/>`
  );
}

/** Faceted deckhouse with a glowing window slit at the front. */
function deckhouse(p: Palette, x: number, w: number, h: number): string {
  const t = 50 - h / 2;
  const btm = 50 + h / 2;
  return (
    `<polygon points="${x},${t + 4} ${x + w * 0.7},${t} ${x + w},${50 - h * 0.22} ${x + w},${50 + h * 0.22} ${x + w * 0.7},${btm} ${x},${btm - 4}" ` +
    `fill="url(#m)" stroke="${p.edge}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<polygon points="${x + w * 0.2},${t + 8} ${x + w * 0.62},${t + 5} ${x + w * 0.62},${btm - 5} ${x + w * 0.2},${btm - 8}" fill="${p.detail}" opacity="0.55"/>` +
    `<line x1="${x + w * 0.86}" y1="${50 - h * 0.2}" x2="${x + w * 0.86}" y2="${50 + h * 0.2}" stroke="${p.light}" stroke-width="2.5" stroke-linecap="round"/>`
  );
}

/** Stealth gun mount: a faceted wedge with a single long barrel. */
function gun(p: Palette, x: number, size = 1, aft = false): string {
  const r = 11 * size;
  return (
    `<g transform="translate(${x} 50)${aft ? ' rotate(180)' : ''}">` +
    `<rect x="${r * 0.6}" y="-1.6" width="${30 * size}" height="3.2" rx="1.6" fill="${p.barrel}"/>` +
    `<polygon points="${-r},${-r * 0.8} ${r * 0.3},${-r * 0.8} ${r * 1.1},0 ${r * 0.3},${r * 0.8} ${-r},${r * 0.8}" fill="${p.turret}" stroke="${p.edge}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<polygon points="${-r},${r * 0.05} ${r * 1.05},0 ${r * 0.3},${r * 0.8} ${-r},${r * 0.8}" fill="${p.hull}" opacity="0.7"/>` +
    '</g>'
  );
}

/** Block of vertical missile launch cells. */
function launchCells(p: Palette, x: number, cols: number): string {
  let cells = '';
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) cells += `<rect x="${x + c * 8}" y="${42 + r * 9}" width="6" height="7" rx="1" fill="${p.detail}" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="0.6"/>`;
  }
  return cells;
}

function aircraft(p: Palette, x: number, y: number): string {
  return (
    `<g transform="translate(${x} ${y})" fill="${p.turret}">` +
    '<path d="M12 0L-6 -2.2L-10 -1.2L-10 1.2L-6 2.2Z"/><path d="M4 -1L-5 -11L-8 -11L-3 -1ZM4 1L-5 11L-8 11L-3 1Z"/>' +
    `<path d="M-7 -1L-11 -5L-12 -1ZM-7 1L-11 5L-12 1Z" fill="${p.light}" opacity="0.8"/>` +
    '</g>'
  );
}

const SHIP_DRAWINGS: Record<string, (p: Palette) => string> = {
  carrier: (p) => {
    const L = 5 * CELL;
    return (
      metal(p) +
      `<polygon points="10,22 26,12 ${L - 90},12 ${L - 4},44 ${L - 4},56 ${L - 90},88 40,88 10,74" fill="url(#m)" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/>` +
      `<polygon points="18,24 30,17 ${L - 94},17 ${L - 14},46 ${L - 14},54 ${L - 94},83 42,83 18,72" fill="${p.detail}"/>` +
      `<line x1="34" y1="72" x2="${L - 190}" y2="24" stroke="${p.light}" stroke-opacity="0.75" stroke-width="1.4" stroke-dasharray="10 8"/>` +
      `<line x1="60" y1="56" x2="${L - 24}" y2="50" stroke="${p.line}" stroke-opacity="0.4" stroke-width="1.2" stroke-dasharray="16 10"/>` +
      `<line x1="${L - 150}" y1="62" x2="${L - 40}" y2="57" stroke="${p.light}" stroke-width="2" stroke-linecap="round"/>` +
      `<polygon points="${L * 0.5},74 ${L * 0.5 + 56},72 ${L * 0.5 + 68},78 ${L * 0.5 + 56},86 ${L * 0.5},86" fill="url(#m)" stroke="${p.edge}" stroke-width="1.4"/>` +
      `<line x1="${L * 0.5 + 60}" y1="76" x2="${L * 0.5 + 60}" y2="82" stroke="${p.light}" stroke-width="2.4" stroke-linecap="round"/>` +
      aircraft(p, 70, 36) + aircraft(p, 98, 36) + aircraft(p, 126, 36) + aircraft(p, 320, 40) + aircraft(p, 190, 66)
    );
  },
  battleship: (p) =>
    hull(p, 4, 32) +
    gun(p, 52, 1.2, true) +
    launchCells(p, 76, 4) +
    deckhouse(p, 128, 104, 42) +
    launchCells(p, 254, 4) +
    gun(p, 312, 1.25),
  cruiser: (p) => hull(p, 3, 27) + launchCells(p, 30, 3) + deckhouse(p, 82, 92, 36) + launchCells(p, 188, 3) + gun(p, 232, 1.05),
  submarine: (p) => {
    const L = 3 * CELL;
    return (
      metal({ ...p, turret: p.deck, hull: p.detail, deck: p.detail, detail: p.barrel }) +
      `<path d="M16 50C16 38 40 34 72 34H${L - 64}C${L - 24} 34 ${L - 6} 42 ${L - 4} 50C${L - 6} 58 ${L - 24} 66 ${L - 64} 66H72C40 66 16 62 16 50Z" fill="url(#m)" stroke="${p.edge}" stroke-width="2"/>` +
      `<polygon points="4,36 22,46 22,54 4,64 10,50" fill="${p.barrel}" stroke="${p.edge}" stroke-width="1.2"/>` +
      `<line x1="40" y1="61" x2="${L - 50}" y2="61" stroke="url(#s)" stroke-width="1.6"/>` +
      `<polygon points="${L * 0.52},29 ${L * 0.52 + 8},29 ${L * 0.52 + 8},71 ${L * 0.52},71" fill="${p.barrel}"/>` +
      `<path d="M${L * 0.48} 43H${L * 0.48 + 40}Q${L * 0.48 + 52} 50 ${L * 0.48 + 40} 57H${L * 0.48}Z" fill="${p.deck}" stroke="${p.edge}" stroke-width="1.4"/>` +
      `<circle cx="${L * 0.48 + 40}" cy="50" r="2.4" fill="${p.light}"/>`
    );
  },
  destroyer: (p) => hull(p, 2, 22) + launchCells(p, 22, 2) + deckhouse(p, 52, 72, 30) + gun(p, 156, 0.85),
};

export const SHIP_IDS = Object.keys(SHIP_DRAWINGS);

function drawing(shipId: string, palette: Palette): string {
  const draw = SHIP_DRAWINGS[shipId];
  if (!draw) throw new Error(`no drawing for ${shipId}`);
  return draw(palette);
}

/**
 * SVG transform that turns the right-facing drawing into the requested orientation:
 * player ships face right (up when vertical), enemy ships face left (down when vertical).
 */
export function orientTransform(length: number, orientation: Orientation, facing: Facing): string {
  const L = length * CELL;
  if (orientation === 'horizontal') return facing === 'player' ? '' : `matrix(-1 0 0 1 ${L} 0)`;
  return facing === 'player' ? `matrix(0 -1 1 0 0 ${L})` : `matrix(0 1 -1 0 ${CELL} 0)`;
}

function shipSvg(shipId: string, length: number, orientation: Orientation, facing: Facing, palette: Palette, viewBox: string) {
  const transform = orientTransform(length, orientation, facing);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none">` +
    `<g${transform ? ` transform="${transform}"` : ''}>${drawing(shipId, palette)}</g></svg>`
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

function shipLength(shipId: string): number {
  const length = FLEET.find((type) => type.id === shipId)?.length;
  if (!length) throw new Error(`no drawing for ${shipId}`);
  return length;
}

/** CSS `url(...)` for the part of a ship that sits in cell number `index` (counted from the top / left). */
export function shipSegment(
  shipId: string,
  orientation: Orientation,
  index: number,
  facing: Facing,
  palette: PaletteName = facing,
): string {
  return cached(`seg:${shipId}:${orientation}:${index}:${facing}:${palette}`, () => {
    const offset = index * CELL;
    const viewBox = orientation === 'horizontal' ? `${offset} 0 ${CELL} ${CELL}` : `0 ${offset} ${CELL} ${CELL}`;
    return dataUrl(shipSvg(shipId, shipLength(shipId), orientation, facing, PALETTES[palette], viewBox));
  });
}

/** CSS `url(...)` for a whole ship drawn horizontally (used in the fleet lists). */
export function shipIcon(shipId: string, facing: Facing, palette: PaletteName = facing): string {
  return cached(`icon:${shipId}:${facing}:${palette}`, () => {
    const length = shipLength(shipId);
    return dataUrl(shipSvg(shipId, length, 'horizontal', facing, PALETTES[palette], `0 0 ${length * CELL} ${CELL}`));
  });
}

const svg = (viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

/** Fireball with a bright core for a hit. */
const HIT_SVG = svg(
  '0 0 100 100',
  '<defs><radialGradient id="f"><stop offset="0" stop-color="#fff7d6"/><stop offset="0.25" stop-color="#ffd04a"/>' +
    '<stop offset="0.55" stop-color="#ff5a3c" stop-opacity="0.9"/><stop offset="1" stop-color="#ff2a3c" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="50" cy="50" r="46" fill="url(#f)"/>' +
    '<path d="M50 14L57 38L80 26L66 47L88 56L62 60L70 84L50 66L30 84L38 60L12 56L34 47L20 26L43 38Z" fill="#ffb13d" opacity="0.85"/>' +
    '<circle cx="50" cy="52" r="10" fill="#fff4c2"/>',
);

/** Water ripples for a miss. */
const MISS_SVG = svg(
  '0 0 100 100',
  '<circle cx="50" cy="50" r="30" fill="none" stroke="#8fd8ff" stroke-opacity="0.35" stroke-width="3"/>' +
    '<circle cx="50" cy="50" r="18" fill="none" stroke="#8fd8ff" stroke-opacity="0.6" stroke-width="3"/>' +
    '<circle cx="50" cy="50" r="6" fill="#cdeeff" opacity="0.85"/>',
);

/** Sleek missile flying to the right with an engine glow at the back. */
export const MISSILE_VIEWBOX = { width: 160, height: 50 };
function missileSvg(accent: string): string {
  return svg(
    `0 0 ${MISSILE_VIEWBOX.width} ${MISSILE_VIEWBOX.height}`,
    `<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>` +
      '<circle cx="22" cy="25" r="20" fill="url(#g)"/>' +
      '<path d="M34 10L50 19H40ZM34 40L50 31H40Z" fill="#9fb0c4"/>' +
      '<rect x="32" y="18" width="98" height="14" rx="7" fill="#eef3f9"/>' +
      '<rect x="32" y="27" width="98" height="5" rx="2.5" fill="#b9c6d6"/>' +
      `<path d="M128 18Q156 25 128 32Z" fill="${accent}"/>` +
      '<rect x="86" y="18" width="5" height="14" fill="#3a4757"/>',
  );
}

export const EFFECTS = {
  hit: () => cached('fx:hit', () => dataUrl(HIT_SVG)),
  miss: () => cached('fx:miss', () => dataUrl(MISS_SVG)),
  missile: (palette: Facing) => cached(`fx:missile:${palette}`, () => dataUrl(missileSvg(PALETTES[palette].light))),
};
