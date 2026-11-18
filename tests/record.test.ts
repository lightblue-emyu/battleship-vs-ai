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

  it('保存できない環境でも、その場では成績を数える', () => {
    const store = createRecordStore(null);
    store.add(false);
    expect(store.record).toEqual({ wins: 0, losses: 1 });
  });

  it('勝率は四捨五入した整数％（試合がなければ0％）', () => {
    expect(winRate({ wins: 0, losses: 0 })).toBe(0);
    expect(winRate({ wins: 2, losses: 1 })).toBe(67);
    expect(winRate({ wins: 3, losses: 2 })).toBe(60);
  });
});
