/** Win / loss record kept in the browser (localStorage), so it survives page reloads. */
export interface GameRecord {
  wins: number;
  losses: number;
}

export const RECORD_KEY = 'battleship-record';

export interface RecordStore {
  readonly record: GameRecord;
  add(won: boolean): GameRecord;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parse(raw: string | null | undefined): GameRecord {
  try {
    const value = JSON.parse(raw ?? '');
    const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? (n as number) : 0);
    return { wins: count(value?.wins), losses: count(value?.losses) };
  } catch {
    return { wins: 0, losses: 0 };
  }
}

export function createRecordStore(storage: Storage | null = browserStorage()): RecordStore {
  /** Saved totals, or null when nothing can be read (no storage, no data yet, or read error). */
  const read = (): GameRecord | null => {
    try {
      const raw = storage?.getItem(RECORD_KEY);
      return raw == null ? null : parse(raw);
    } catch {
      return null;
    }
  };
  let record = read() ?? { wins: 0, losses: 0 };
  // Only trust storage over memory while our last write succeeded; otherwise it may be stale.
  let synced = true;
  return {
    get record() {
      return record;
    },
    add(won) {
      // Re-read first so results saved by other open tabs are not overwritten.
      if (synced) record = read() ?? record;
      record = won ? { ...record, wins: record.wins + 1 } : { ...record, losses: record.losses + 1 };
      try {
        storage?.setItem(RECORD_KEY, JSON.stringify(record));
        synced = !!storage;
      } catch {
        // Storage may be full or blocked; the record still counts for this visit.
        synced = false;
      }
      return record;
    },
  };
}

/** Win rate in whole percent (0 when no games have been played). */
export function winRate({ wins, losses }: GameRecord): number {
  const games = wins + losses;
  return games === 0 ? 0 : Math.round((wins / games) * 100);
}
