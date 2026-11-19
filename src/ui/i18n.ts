import type { Difficulty, Offset, Orientation } from '../game/types';

/** Screen languages; the choice is kept in localStorage (`battleship-lang`). */
export type Lang = 'ja' | 'en';
export const LANGS: readonly Lang[] = ['ja', 'en'];
const STORAGE_KEY = 'battleship-lang';

export function loadLanguage(): Lang {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ja';
  } catch {
    return 'ja';
  }
}

export function saveLanguage(lang: Lang) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage unavailable: the choice lasts only for this page.
  }
}

type Side = 'player' | 'ai';

/** Every piece of text the screen shows, per language. */
export interface Messages {
  langName: string;
  ship: Record<string, string>;
  difficulty: Record<Difficulty, string>;
  /** Static texts in the page template, keyed by `data-i18n` / `data-i18n-label` / `data-i18n-title`. */
  static: Record<string, string>;
  placeIntro: string;
  cannotPlace(ship: string, length: number): string;
  placed(ship: string, next: string, length: number): string;
  allPlaced: string;
  randomPlaced: string;
  cleared: string;
  difficultySet(level: string): string;
  battleStart(level: string): string;
  attackHint: string;
  defenseHint: string;
  shipSunkCannotMove(ship: string): string;
  shipBlocked(ship: string): string;
  shipSelected(ship: string): string;
  cannotMoveThatWay(ship: string): string;
  sunkCell(where: string): string;
  fired(attacker: Side, where: string): string;
  miss(where: string): string;
  hit(where: string): string;
  sunk(where: string, attacker: Side, ship: string): string;
  logAttack(attacker: Side, text: string): string;
  attackReport(attacker: Side, text: string, next: string): string;
  aiMoved: string;
  playerMoved(ship: string, offset: Offset): string;
  sound(on: boolean): string;
  currentShip(ship: string, length: number, orientation: Orientation): string;
  allPlacedShort: string;
  aiLevel(level: string): string;
  moveIdle: string;
  moveSelected(ship: string): string;
  moveChoose: string;
  winText: string;
  loseText: string;
  stats: [shots: string, accuracy: string, shipsLeft: string];
  resultRecord(wins: number, losses: number, rate: number): string;
  gameOverWin: string;
  gameOverLose: string;
  restartHint: string;
  zone: Record<Side, string>;
  cell: { hit: string; sunk: string; miss: string; ship: string };
  hits(count: number, length: number): string;
  badge: { sunk: string; pending: string; damaged: string; intact: string };
  shipStatus(ship: string, badge: string): string;
  record: [label: string, wins: string, losses: string];
}

const ja: Messages = {
  langName: '日本語',
  ship: { carrier: '空母', battleship: '戦艦', cruiser: '巡洋艦', submarine: '潜水艦', destroyer: '駆逐艦' },
  difficulty: { easy: '弱い', normal: '普通', hard: '強い' },
  static: {
    tagline: '敵艦隊をすべて撃沈したら勝ち。攻守は1ターンごとに交代。守り側は攻撃を受ける前に、船を1隻だけ上下左右に1マス動かせます。',
    recordLabel: '通算成績',
    soundTitle: '命中・撃沈の効果音を切り替え',
    langLabel: '表示言語',
    controls: '操作',
    difficulty: 'AIの強さ',
    rotate: '向きを変える (R)',
    random: 'ランダム配置',
    clear: '配置をやり直す',
    start: 'ゲーム開始',
    up: '上へ移動',
    down: '下へ移動',
    left: '左へ移動',
    right: '右へ移動',
    moveCancel: '選択解除 (Esc)',
    noMove: '移動なし',
    restart: '最初からやり直す',
    battlefield: '盤面（左が自陣、右が敵陣）',
    ownZone: '自陣',
    ownZoneSub: 'あなたの艦隊',
    enemyZone: '敵陣',
    legend: '凡例',
    legendShip: '自分の船',
    legendHit: '命中',
    legendMiss: '外れ',
    legendSunk: '撃沈',
    ownFleet: '自艦隊',
    enemyFleet: '敵艦隊',
    remaining: '残り',
    shipsUnit: '隻',
    ownShips: 'あなたの船',
    enemyShips: '敵の船',
    log: '戦況ログ',
    playAgain: 'もう一度遊ぶ',
    viewBoards: '盤面を確認する',
  },
  placeIntro: '船を配置してください。自陣（左側）のマスをクリックすると置けます。',
  cannotPlace: (ship, length) => `${ship}（${length}マス）はそこには置けません。はみ出しや重なりがない場所を選んでください。`,
  placed: (ship, next, length) => `${ship}を配置しました。次は${next}（${length}マス）です。`,
  allPlaced: 'すべての船を配置しました。「ゲーム開始」を押してください。',
  randomPlaced: 'ランダムに配置しました。気に入らなければもう一度押せます。準備ができたら「ゲーム開始」！',
  cleared: '配置をリセットしました。もう一度船を配置してください。',
  difficultySet: (level) => `AIの強さを「${level}」にしました。`,
  battleStart: (level) => `戦闘開始！（AIの強さ：${level}）`,
  attackHint: 'あなたの攻撃ターン：敵陣（右側）のマスをクリックすると発射します。',
  defenseHint: 'AIの攻撃ターン：船を1隻選んで上下左右に1マス動かすか、「移動なし」を押してください。押すとAIが発射します。',
  shipSunkCannotMove: (ship) => `${ship}は沈んでいるので動かせません。`,
  shipBlocked: (ship) => `${ship}は周りがふさがっていて動かせません。`,
  shipSelected: (ship) => `${ship}を選択中。光っているマスをクリックするか、矢印ボタン・矢印キーで1マス動かします。`,
  cannotMoveThatWay: (ship) => `${ship}はその方向には動かせません（盤面の外や、ほかの船と重なる場所には止まれません）。`,
  sunkCell: (where) => `${where}は沈んだ船のマスです。別のマスを選んでください。`,
  fired: (attacker, where) => `${attacker === 'player' ? '' : 'AIが'}${where}へミサイル発射！`,
  miss: (where) => `${where}：外れ`,
  hit: (where) => `${where}：命中！`,
  sunk: (where, attacker, ship) => `${where}：命中！ ${attacker === 'player' ? '敵の' : 'あなたの'}${ship}を撃沈！`,
  logAttack: (attacker, text) => `${attacker === 'player' ? 'あなた' : 'AI'} → ${text}`,
  attackReport: (attacker, text, next) => `${attacker === 'player' ? 'あなた' : 'AI'}の攻撃 ${text} ／ ${next}`,
  aiMoved: 'AI → 船を1隻動かした（どの船かは秘密）',
  playerMoved: (ship, { row, col }) => {
    const parts: string[] = [];
    if (row) parts.push(`${row < 0 ? '上' : '下'}${Math.abs(row)}`);
    if (col) parts.push(`${col < 0 ? '左' : '右'}${Math.abs(col)}`);
    return `あなた → ${ship}を${parts.join('・') || 'その場'}へ移動`;
  },
  sound: (on) => (on ? '効果音：ON' : '効果音：OFF'),
  currentShip: (ship, length, orientation) => `配置中：${ship}（${length}マス）／ 向き：${orientation === 'horizontal' ? '横' : '縦'}`,
  allPlacedShort: '全ての船を配置済み',
  aiLevel: (level) => `AI・${level}`,
  moveIdle: '移動：AIの攻撃ターンに、守りとして1隻を1マス動かせます',
  moveSelected: (ship) => `移動：${ship}`,
  moveChoose: '守り：船を選んで動かすか「移動なし」',
  winText: 'あなたの勝利！ 敵艦隊をすべて撃沈しました。',
  loseText: 'AIの勝利… あなたの艦隊はすべて沈められました。',
  stats: ['攻撃回数', '命中率', '残った自艦'],
  resultRecord: (wins, losses, rate) => `通算成績 ${wins}勝 ${losses}敗（勝率 ${rate}%）`,
  gameOverWin: 'ゲーム終了：あなたの勝利です！',
  gameOverLose: 'ゲーム終了：AIの勝利です。敵の残りの船の位置を表示しています。',
  restartHint: '「最初からやり直す」で新しいゲームを始められます。',
  zone: { player: '自陣', ai: '敵陣' },
  cell: { hit: '命中', sunk: '撃沈', miss: '外れ', ship: '船' },
  hits: (count, length) => `被弾 ${count}/${length}`,
  badge: { sunk: '撃沈', pending: '未配置', damaged: '被弾', intact: '健在' },
  shipStatus: (ship, badge) => `${ship}：${badge}`,
  record: ['通算成績 ', '勝 ', '敗 ｜ 勝率 '],
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const en: Messages = {
  langName: 'English',
  ship: { carrier: 'Carrier', battleship: 'Battleship', cruiser: 'Cruiser', submarine: 'Submarine', destroyer: 'Destroyer' },
  difficulty: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  static: {
    tagline: 'Sink the whole enemy fleet to win. Attack and defence switch every turn. Before being attacked, the defender may move one ship one cell up, down, left or right.',
    recordLabel: 'Record',
    soundTitle: 'Turn hit / sink sound effects on or off',
    langLabel: 'Language',
    controls: 'Controls',
    difficulty: 'AI strength',
    rotate: 'Rotate (R)',
    random: 'Random placement',
    clear: 'Reset placement',
    start: 'Start battle',
    up: 'Move up',
    down: 'Move down',
    left: 'Move left',
    right: 'Move right',
    moveCancel: 'Deselect (Esc)',
    noMove: 'No move',
    restart: 'Start over',
    battlefield: 'Battlefield (left: your zone, right: enemy zone)',
    ownZone: 'YOUR ZONE',
    ownZoneSub: 'Your fleet',
    enemyZone: 'ENEMY ZONE',
    legend: 'Legend',
    legendShip: 'Your ship',
    legendHit: 'Hit',
    legendMiss: 'Miss',
    legendSunk: 'Sunk',
    ownFleet: 'YOUR FLEET',
    enemyFleet: 'ENEMY FLEET',
    remaining: 'Left',
    shipsUnit: 'ships',
    ownShips: 'Your ships',
    enemyShips: 'Enemy ships',
    log: 'BATTLE LOG',
    playAgain: 'Play again',
    viewBoards: 'View the board',
  },
  placeIntro: 'Place your ships. Click a cell in your zone (left) to place one.',
  cannotPlace: (ship, length) => `The ${ship} (${plural(length, 'cell')}) can't go there. Pick a spot that stays on the board and doesn't overlap.`,
  placed: (ship, next, length) => `${ship} placed. Next: ${next} (${plural(length, 'cell')}).`,
  allPlaced: 'All ships placed. Press "Start battle".',
  randomPlaced: 'Ships placed at random. Press again for a new layout. Ready? Press "Start battle"!',
  cleared: 'Placement reset. Place your ships again.',
  difficultySet: (level) => `AI strength set to "${level}".`,
  battleStart: (level) => `Battle start! (AI strength: ${level})`,
  attackHint: 'Your attack turn: click a cell in the enemy zone (right) to fire.',
  defenseHint: 'AI attack turn: pick one ship and move it one cell up, down, left or right, or press "No move". The AI fires when you do.',
  shipSunkCannotMove: (ship) => `The ${ship} has sunk and can't move.`,
  shipBlocked: (ship) => `The ${ship} is boxed in and can't move.`,
  shipSelected: (ship) => `${ship} selected. Click a glowing cell, or use the arrow buttons / arrow keys to move it one cell.`,
  cannotMoveThatWay: (ship) => `The ${ship} can't move that way (it can't stop off the board or on another ship).`,
  sunkCell: (where) => `${where} holds a sunken ship. Pick another cell.`,
  fired: (attacker, where) => `${attacker === 'player' ? 'Missile' : 'AI missile'} fired at ${where}!`,
  miss: (where) => `${where}: miss`,
  hit: (where) => `${where}: hit!`,
  sunk: (where, attacker, ship) => `${where}: hit! ${attacker === 'player' ? 'Enemy' : 'Your'} ${ship} sunk!`,
  logAttack: (attacker, text) => `${attacker === 'player' ? 'You' : 'AI'} → ${text}`,
  attackReport: (attacker, text, next) => `${attacker === 'player' ? 'Your' : 'AI'} attack ${text} / ${next}`,
  aiMoved: 'AI → moved one ship (which one is secret)',
  playerMoved: (ship, { row, col }) => {
    const parts: string[] = [];
    if (row) parts.push(`${row < 0 ? 'up' : 'down'} ${Math.abs(row)}`);
    if (col) parts.push(`${col < 0 ? 'left' : 'right'} ${Math.abs(col)}`);
    return `You → moved the ${ship} ${parts.join(', ') || 'nowhere'}`;
  },
  sound: (on) => (on ? 'Sound: ON' : 'Sound: OFF'),
  currentShip: (ship, length, orientation) => `Placing: ${ship} (${plural(length, 'cell')}) / Direction: ${orientation}`,
  allPlacedShort: 'All ships placed',
  aiLevel: (level) => `AI · ${level}`,
  moveIdle: 'Move: on the AI attack turn, you may move one ship one cell to defend',
  moveSelected: (ship) => `Move: ${ship}`,
  moveChoose: 'Defend: select a ship to move, or "No move"',
  winText: 'You win! You sank the whole enemy fleet.',
  loseText: 'The AI wins… your whole fleet was sunk.',
  stats: ['Shots', 'Accuracy', 'Ships left'],
  resultRecord: (wins, losses, rate) => `Record ${wins}W ${losses}L (win rate ${rate}%)`,
  gameOverWin: 'Game over: you win!',
  gameOverLose: 'Game over: the AI wins. The remaining enemy ships are shown.',
  restartHint: ' Press "Start over" to begin a new game.',
  zone: { player: 'Your zone', ai: 'Enemy zone' },
  cell: { hit: 'hit', sunk: 'sunk', miss: 'miss', ship: 'ship' },
  hits: (count, length) => `Hits ${count}/${length}`,
  badge: { sunk: 'SUNK', pending: 'NOT PLACED', damaged: 'DAMAGED', intact: 'INTACT' },
  shipStatus: (ship, badge) => `${ship}: ${badge}`,
  record: ['Record ', 'W ', 'L | Win rate '],
};

export const MESSAGES: Record<Lang, Messages> = { ja, en };
