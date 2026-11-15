import type { AttackOutcome } from '../game/types';

export type SoundEffect = 'hit' | 'sunk';

export interface SoundPlayer {
  play(effect: SoundEffect): void;
  muted: boolean;
}

/** Which sound an attack result should make; a miss stays silent. */
export function soundForOutcome(outcome: AttackOutcome): SoundEffect | null {
  if (outcome === 'hit') return 'hit';
  if (outcome === 'sunk') return 'sunk';
  return null;
}

const MUTE_KEY = 'battleship-muted';

type ContextFactory = () => AudioContext | null;

function browserContext(): AudioContext | null {
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Retro 8-bit sound effects synthesised with the Web Audio API (no audio files).
 * The AudioContext is created on the first sound, which always follows a click,
 * so browsers' autoplay rules allow it. Without Web Audio it silently does nothing.
 */
export function createSoundPlayer(
  createContext: ContextFactory = browserContext,
  storage: Storage | null = browserStorage(),
): SoundPlayer {
  let ctx: AudioContext | null | undefined;
  let muted = storage?.getItem(MUTE_KEY) === '1';

  function context(): AudioContext | null {
    if (ctx === undefined) {
      try {
        ctx = createContext();
      } catch {
        ctx = null;
      }
    }
    if (ctx?.state === 'suspended') void ctx.resume();
    return ctx;
  }

  return {
    get muted() {
      return muted;
    },
    set muted(value: boolean) {
      muted = value;
      try {
        storage?.setItem(MUTE_KEY, value ? '1' : '0');
      } catch {
        // Private mode etc.: the setting just won't be remembered.
      }
    },
    play(effect) {
      if (muted) return;
      const ac = context();
      if (!ac) return;
      if (effect === 'hit') playHit(ac);
      else playSunk(ac);
    },
  };
}

/** Short white-noise burst whose volume drops quickly: a small "bang". */
function noiseBurst(ac: AudioContext, start: number, duration: number, volume: number, cutoff: number) {
  const length = Math.ceil(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  filter.frequency.exponentialRampToValueAtTime(100, start + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(ac.destination);
  source.start(start);
  source.stop(start + duration);
}

/** Square-wave tone sliding from one pitch to another, like an NES sound channel. */
function squareSweep(ac: AudioContext, start: number, duration: number, from: number, to: number, volume: number) {
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function playHit(ac: AudioContext) {
  const t = ac.currentTime;
  squareSweep(ac, t, 0.12, 660, 220, 0.12);
  noiseBurst(ac, t, 0.3, 0.35, 3000);
}

function playSunk(ac: AudioContext) {
  const t = ac.currentTime;
  noiseBurst(ac, t, 0.9, 0.5, 2000);
  [523, 392, 262, 131].forEach((freq, i) => squareSweep(ac, t + 0.1 + i * 0.12, 0.14, freq, freq * 0.8, 0.1));
}
