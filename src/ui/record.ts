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
  const read = () => {
    try {
      return parse(storage?.getItem(RECORD_KEY));
    } catch {
      return null;
    }
  };
  let record = read() ?? { wins: 0, losses: 0 };
  return {
    get record() {
      return record;
    },
    add(won) {
      // Re-read first so results saved by other open tabs are not overwritten.
      record = read() ?? record;
      record = won ? { ...record, wins: record.wins + 1 } : { ...record, losses: record.losses + 1 };
      try {
        storage?.setItem(RECORD_KEY, JSON.stringify(record));
      } catch {
        // Storage may be full or blocked; the record still counts for this visit.
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
