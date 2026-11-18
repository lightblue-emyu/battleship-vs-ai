import { describe, expect, it } from 'vitest';
import { createRecordStore, RECORD_KEY, winRate } from '../src/ui/record';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  } as unknown as Storage & { data: Map<string, string> };
}

describe('通算成績', () => {
  it('勝ち・負けを数え、ブラウザに保存して次に開いたときも残る', () => {
    const storage = memoryStorage();
    const store = createRecordStore(storage);
    expect(store.record).toEqual({ wins: 0, losses: 0 });
    store.add(true);
    store.add(true);
    store.add(false);
    expect(store.record).toEqual({ wins: 2, losses: 1 });
    expect(createRecordStore(storage).record).toEqual({ wins: 2, losses: 1 });
  });

  it('別のタブで記録された成績を上書きしない', () => {
    const storage = memoryStorage();
    const tabA = createRecordStore(storage);
    const tabB = createRecordStore(storage);
    tabA.add(true);
    tabB.add(false);
    expect(createRecordStore(storage).record).toEqual({ wins: 1, losses: 1 });
  });

  it('保存データが壊れていても0勝0敗から始める', () => {
    expect(createRecordStore(memoryStorage({ [RECORD_KEY]: 'not json' })).record).toEqual({ wins: 0, losses: 0 });
    expect(createRecordStore(memoryStorage({ [RECORD_KEY]: '{"wins":-3,"losses":"x"}' })).record).toEqual({ wins: 0, losses: 0 });
  });

  it('保存できない環境でも、その場では成績を数え続ける', () => {
    const store = createRecordStore(null);
    store.add(false);
    store.add(true);
    expect(store.record).toEqual({ wins: 1, losses: 1 });
  });

  it('読み込み・書き込みでエラーが出ても、その場の成績は消えない', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } } as unknown as Storage;
    const store = createRecordStore(broken);
    store.add(true);
    store.add(true);
    expect(store.record).toEqual({ wins: 2, losses: 0 });

    const storage = memoryStorage({ [RECORD_KEY]: '{"wins":5,"losses":5}' });
    const full = createRecordStore({ getItem: storage.getItem, setItem: () => { throw new Error('full'); } } as unknown as Storage);
    full.add(true);
    full.add(true);
    expect(full.record).toEqual({ wins: 7, losses: 5 });
  });

  it('勝率は四捨五入した整数％（試合がなければ0％）', () => {
    expect(winRate({ wins: 0, losses: 0 })).toBe(0);
    expect(winRate({ wins: 2, losses: 1 })).toBe(67);
    expect(winRate({ wins: 3, losses: 2 })).toBe(60);
  });
});
