import { describe, expect, it, vi } from 'vitest';
import { createSoundPlayer, soundForOutcome } from '../src/ui/sound';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  } as unknown as Storage & { data: Map<string, string> };
}

/** Just enough of AudioContext to record which nodes a sound creates. */
function fakeAudioContext() {
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = (extra: object = {}) => {
    const n = { connect: vi.fn(() => n), start: vi.fn(), stop: vi.fn(), ...extra };
    return n;
  };
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume: vi.fn(async () => {}),
    createBuffer: vi.fn((_ch: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createBufferSource: vi.fn(() => node({ buffer: null })),
    createBiquadFilter: vi.fn(() => node({ type: '', frequency: param() })),
    createGain: vi.fn(() => node({ gain: param() })),
    createOscillator: vi.fn(() => node({ type: '', frequency: param() })),
  };
  return ctx;
}

describe('効果音', () => {
  it('命中と撃沈で別々の音を選び、外れは無音', () => {
    expect(soundForOutcome('hit')).toBe('hit');
    expect(soundForOutcome('sunk')).toBe('sunk');
    expect(soundForOutcome('miss')).toBeNull();
  });

  it('最初に音を鳴らすときに AudioContext を1回だけ作り、ドット風の音（矩形波＋ノイズ）を鳴らす', () => {
    const ctx = fakeAudioContext();
    const factory = vi.fn(() => ctx as unknown as AudioContext);
    const player = createSoundPlayer(factory, memoryStorage());
    expect(factory).not.toHaveBeenCalled();

    player.play('hit');
    player.play('sunk');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1 + 4);
    expect(ctx.createOscillator.mock.results[0].value.type).toBe('square');
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it('ミュート中は音を鳴らさず、設定は保存されて次回も引き継がれる', () => {
    const storage = memoryStorage();
    const factory = vi.fn(() => fakeAudioContext() as unknown as AudioContext);
    const player = createSoundPlayer(factory, storage);
    player.muted = true;
    player.play('sunk');
    expect(factory).not.toHaveBeenCalled();
    expect(createSoundPlayer(factory, storage).muted).toBe(true);
    player.muted = false;
    expect(createSoundPlayer(factory, storage).muted).toBe(false);
  });

  it('Web Audio が使えないブラウザでもエラーにならない', () => {
    const player = createSoundPlayer(() => null, null);
    expect(() => player.play('hit')).not.toThrow();
    const broken = createSoundPlayer(() => {
      throw new Error('not allowed');
    }, null);
    expect(() => broken.play('sunk')).not.toThrow();
  });

  it('一時停止中の AudioContext は再開してから鳴らす', () => {
    const ctx = { ...fakeAudioContext(), state: 'suspended' };
    createSoundPlayer(() => ctx as unknown as AudioContext, null).play('hit');
    expect(ctx.resume).toHaveBeenCalled();
  });
});
