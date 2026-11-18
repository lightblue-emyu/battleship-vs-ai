import { EFFECTS, MISSILE_VIEWBOX } from './sprites';
import './missile.css';

export type Shooter = 'player' | 'ai';
export interface Point {
  x: number;
  y: number;
}
export interface FlightFrame extends Point {
  /** Heading in degrees (0 = flying right, 90 = flying down). */
  angle: number;
}

export const MISSILE_FLIGHT_MS = 800;

/**
 * Points along a curved flight path (a quadratic Bézier arc that rises above both ends)
 * from `from` to `to`, each with the direction the missile is facing.
 */
export function flightPath(from: Point, to: Point, steps = 16): FlightFrame[] {
  const rise = Math.min(Math.abs(to.x - from.x) * 0.3, 90) + 20;
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - rise };
  const frames: FlightFrame[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * control.x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * control.y + t * t * to.y;
    const dx = 2 * u * (control.x - from.x) + 2 * t * (to.x - control.x);
    const dy = 2 * u * (control.y - from.y) + 2 * t * (to.y - control.y);
    frames.push({ x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI });
  }
  return frames;
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Flies a missile across `grid` from the shooter's outer edge to the `target` cell.
 * While it is in the air the target cell is marked `incoming` (its result stays hidden);
 * on impact the missile is removed and `onImpact` runs. Returns a function that cancels the flight.
 */
export function launchMissile(
  grid: HTMLElement,
  target: HTMLElement,
  shooter: Shooter,
  durationMs = MISSILE_FLIGHT_MS,
  onImpact: () => void = () => {},
): () => void {
  const area = grid.getBoundingClientRect();
  const cell = target.getBoundingClientRect();
  const size = Math.max(cell.width * 1.6, 30);
  const from = { x: shooter === 'player' ? 0 : area.width, y: area.height / 2 };
  const to = { x: cell.left - area.left + cell.width / 2, y: cell.top - area.top + cell.height / 2 };

  const missile = document.createElement('span');
  missile.className = 'missile';
  missile.dataset.shooter = shooter;
  missile.setAttribute('aria-hidden', 'true');
  missile.style.width = `${size}px`;
  missile.style.height = `${(size * MISSILE_VIEWBOX.height) / MISSILE_VIEWBOX.width}px`;
  missile.style.setProperty('--sprite', EFFECTS.missile(shooter === 'player' ? 'player' : 'enemy'));
  const place = ({ x, y, angle }: FlightFrame) => ({
    transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}deg)`,
  });
  const frames = flightPath(from, to);
  Object.assign(missile.style, place(frames[0]));
  grid.append(missile);
  target.classList.add('incoming');
  missile.animate?.(frames.map(place), { duration: durationMs, easing: 'ease-in', fill: 'forwards' });

  const land = () => {
    missile.remove();
    target.classList.remove('incoming');
  };
  const timer = setTimeout(() => {
    land();
    onImpact();
  }, durationMs);
  return () => {
    clearTimeout(timer);
    land();
  };
}
