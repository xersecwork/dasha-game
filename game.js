'use strict';

/* =========================================================
   Дашина Игра — головоломка «собери градиент»
   ========================================================= */

// ---------- Цвет: OKLab → sRGB ----------

// Линейный канал → гамма sRGB (0..1)
function linToSrgb(x) {
  x = Math.min(1, Math.max(0, x));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

// OKLab → линейный sRGB (матрицы Бьёрна Оттосона)
function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function lchToLab(L, C, h) {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

// Снижаем насыщенность, пока цвет не поместится в sRGB
function fitGamut(L, C, h) {
  if (inGamut(oklabToLinear(lchToLab(L, C, h)))) return lchToLab(L, C, h);
  let lo = 0, hi = C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinear(lchToLab(L, mid, h)))) lo = mid; else hi = mid;
  }
  return lchToLab(L, lo, h);
}

function labToCss(lab) {
  const [r, g, b] = oklabToLinear(lab).map((v) => Math.round(linToSrgb(v) * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- Градиент ----------

const cornerCss = ([L, C, h]) => labToCss(fitGamut(L, C, h));

// Билинейная интерполяция углов, заданных в OKLCH. Обычно смешиваем в OKLab;
// с mixHue — прямо в LCh, чтобы оттенок шёл по кругу (радуга без серого центра)
function buildColors(cols, rows, corners, mixHue = false) {
  const [tl, tr, bl, br] = mixHue ? corners : corners.map(([L, C, h]) => fitGamut(L, C, h));
  const out = [];
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      const mix = [0, 1, 2].map((i) =>
        (1 - v) * ((1 - u) * tl[i] + u * tr[i]) + v * ((1 - u) * bl[i] + u * br[i])
      );
      const lab = mixHue ? fitGamut(...mix) : mix;
      out.push({ css: labToCss(lab), light: lab[0] > 0.72 });
    }
  }
  return out;
}

// ---------- Уровни ----------

const SET_SIZE = 10;

// Наборы уровней: углы [L, C, h] в OKLCH — левый верхний, правый верхний,
// левый нижний, правый нижний. Светлый угол напротив тёмного, оттенки
// в пределах ~150°, без противоположных пар — иначе центр уходит в серый.
// Правый верхний и левый нижний углы расходятся по оттенку: тогда шаги цвета
// по строке и по столбцу непохожи и на поле нет двух одинаковых плиток.
// Оттенки записаны без перехода через 360° (390, а не 30): по ним считается
// среднее, к которому стягиваются углы на поздних уровнях.
// Радуга — исключение: смешивается в LCh, оттенок идёт по столбцам
// от красного до синего, светлота — по строкам
const SETS = [
  { name: 'Рассвет', corners: [[0.93, 0.08, 90], [0.78, 0.15, 40], [0.64, 0.15, -10], [0.42, 0.14, -60]] },
  { name: 'Океан',   corners: [[0.94, 0.07, 190], [0.76, 0.12, 235], [0.64, 0.12, 160], [0.36, 0.12, 265]] },
  { name: 'Лес',     corners: [[0.94, 0.10, 120], [0.76, 0.13, 85], [0.64, 0.15, 145], [0.38, 0.09, 175]] },
  { name: 'Пастель', corners: [[0.97, 0.06, 340], [0.80, 0.12, 290], [0.76, 0.11, 390], [0.56, 0.11, 250]] },
  { name: 'Закат',   corners: [[0.90, 0.12, 85], [0.70, 0.19, 30], [0.66, 0.15, -15], [0.36, 0.13, -70]] },
  { name: 'Ночь',    corners: [[0.74, 0.10, 300], [0.56, 0.14, 275], [0.54, 0.13, 370], [0.26, 0.08, 260]] },
  { name: 'Лаванда', corners: [[0.95, 0.05, 310], [0.76, 0.13, 270], [0.74, 0.14, 350], [0.46, 0.15, 300]] },
  { name: 'Осень',   corners: [[0.92, 0.12, 100], [0.72, 0.16, 45], [0.70, 0.14, 135], [0.42, 0.11, 60]] },
  { name: 'Лёд',     corners: [[0.96, 0.03, 215], [0.84, 0.13, 268], [0.66, 0.11, 185], [0.54, 0.15, 232]] },
  { name: 'Радуга',  corners: [[0.86, 0.12, 5], [0.82, 0.12, 295], [0.58, 0.16, 5], [0.54, 0.16, 295]], mixHue: true },
];
const LEVEL_COUNT = SETS.length * SET_SIZE;

// mulberry32: детерминированный генератор чисел 0..1 по 32-битному зерну
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Зерно зависит только от номера — у всех игроков одно и то же поле
const rngFor = (level) => mulberry32(Math.imul(level, 0x9e3779b1) ^ 0x5eed);

// Положение уровня во всей игре: 0 — первый, 1 — последний
const progress = (level) => (level - 1) / (LEVEL_COUNT - 1);

const setOf = (level) => Math.floor((level - 1) / SET_SIZE);
const firstOf = (set) => set * SET_SIZE + 1;
const indexOf = (level) => ((level - 1) % SET_SIZE) + 1; // номер внутри набора

// Сетка растёт линейно от 4×5 до 9×13 (столбцы × строки): за уровень
// прибавляется не больше одного ряда или столбца
function gridSize(level) {
  const t = progress(level);
  return [Math.round(4 + 5 * t), Math.round(5 + 8 * t)];
}

// Контраст: к последнему уровню углы стягиваются к своему среднему до 65%
// исходного разброса — соседние плитки различаются тоньше, но не сливаются
const contrast = (level) => 1 - 0.35 * progress(level);

// Углы набора с лёгкими вариациями: оттенок плавно дрейфует внутри набора,
// плюс небольшой шум яркости, насыщенности и оттенка от зерна уровня.
// Возвращает [L, C, h] в OKLCH, ещё без подгонки под sRGB
function levelCorners(level, rng) {
  const set = SETS[setOf(level)];
  const k = (indexOf(level) - 1) / (SET_SIZE - 1);
  const drift = (k - 0.5) * 16 + (rng() - 0.5) * 10;
  const raw = set.corners.map(([L, C, h]) =>
    [L + (rng() - 0.5) * 0.03, C * (0.95 + rng() * 0.1), h + drift + (rng() - 0.5) * 6]
  );
  const f = contrast(level);
  const mean = [0, 1, 2].map((i) => raw.reduce((sum, c) => sum + c[i], 0) / raw.length);
  return raw.map((c) => c.map((x, i) => mean[i] + (x - mean[i]) * f));
}

const EDGE_LEVELS = 20; // до этого уровня закреплена ещё и часть краёв

// Первые 20 уровней: углы и равномерно расставленная доля краёв — от 50%
// до 20%. Дальше только углы, на последних 10 — два противоположных угла
// (диагональ чередуется от уровня к уровню)
function fixedTiles(level, cols, rows) {
  const total = cols * rows;
  const [tl, tr, bl, br] = [0, cols - 1, total - cols, total - 1];
  if (level > LEVEL_COUNT - SET_SIZE) return new Set(level % 2 ? [tl, br] : [tr, bl]);

  const fixed = new Set([tl, tr, bl, br]);
  if (level > EDGE_LEVELS) return fixed;
  const share = 0.5 - (0.3 * (level - 1)) / (EDGE_LEVELS - 1);
  const edges = [ // [длина края без углов, позиция i-й плитки]
    [cols - 2, (i) => 1 + i],                // верхний
    [cols - 2, (i) => total - cols + 1 + i], // нижний
    [rows - 2, (i) => (1 + i) * cols],       // левый
    [rows - 2, (i) => (2 + i) * cols - 1],   // правый
  ];
  for (const [n, at] of edges) {
    const k = Math.round(n * share);
    for (let j = 0; j < k; j++) fixed.add(at(Math.round(((j + 1) * (n + 1)) / (k + 1)) - 1));
  }
  return fixed;
}

// Полное описание уровня по номеру: сетка, цвета, фиксированные плитки,
// стартовая раскладка и эталонное число обменов
function generateLevel(level) {
  const rng = rngFor(level);
  const [cols, rows] = gridSize(level);
  const fixed = fixedTiles(level, cols, rows);
  const set = SETS[setOf(level)];
  const colors = buildColors(cols, rows, levelCorners(level, rng), set.mixHue);
  const order = shuffled(cols * rows, fixed, rng);
  return {
    cols, rows, fixed, colors, order,
    par: minSwaps(order),
    theme: set.name,
    index: indexOf(level),
  };
}

// Звёзды: ≤ эталон + 20% — три, ≤ эталон + 60% — две, иначе одна.
// Сравнение в целых числах, чтобы не ловить ошибки округления
function starsFor(moves, par) {
  if (moves * 5 <= par * 6) return 3;
  if (moves * 5 <= par * 8) return 2;
  return 1;
}

// Любое обращение к localStorage может бросить исключение (приватный режим,
// запрет хранилища, переполнение) — тогда игра просто работает без сохранений
const store = {
  get(key, def) {
    try { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* приватный режим */ }
  },
};

// ---------- Прогресс ----------

// Ключ остался от прежнего названия игры — чтобы не потерять прогресс
const SAVE_KEY = 'pereliv.save';
const SAVE_VERSION = 2; // 1 — 60 уровней (5 × 12), поля v ещё не было; 2 — 100 уровней
const UNLOCK_AT = 7;   // столько уровней набора открывают следующий набор
const HINT_MAX = 5;
const HINT_EVERY = 5;  // новая подсказка за каждые 5 впервые пройденных уровней

// Версия 1: уровни были другими, поэтому пройденные переносим по порядку
// на уровни 1, 2, 3… со своими звёздами. Лучший результат на прежнем поле
// к новому не относится — сбрасываем его (0 — «ещё неизвестен»)
function migrateV1(done) {
  const out = {};
  Object.keys(done).map(Number).sort((a, b) => a - b)
    .forEach((_, i, old) => { out[i + 1] = { stars: done[old[i]].stars, best: 0 }; });
  return out;
}

// Читаем сохранение и отбрасываем всё, что не похоже на правду
function loadSave() {
  const raw = store.get(SAVE_KEY, null);
  const src = raw && typeof raw === 'object' ? raw : {};
  const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
  const old = raw !== null && src.v === undefined;
  const maxLevel = old ? 60 : LEVEL_COUNT;

  let done = {}; // done[level] = { stars, best }
  if (src.done && typeof src.done === 'object') {
    for (const [key, r] of Object.entries(src.done)) {
      const level = Number(key);
      if (!Number.isInteger(level) || level < 1 || level > maxLevel || !r || typeof r !== 'object') continue;
      done[level] = { stars: int(r.stars, 1, 3, 1), best: int(r.best, 0, 1e6, 0) };
    }
  }
  if (old) done = migrateV1(done);

  const out = {
    v: SAVE_VERSION,
    done,
    hints: int(src.hints, 0, HINT_MAX, HINT_MAX),
    charge: int(src.charge, 0, HINT_EVERY - 1, 0), // пройдено новых уровней к следующей подсказке
    last: old ? 1 : int(src.last, 1, LEVEL_COUNT, 1), // последний запущенный уровень
  };
  if (old) store.set(SAVE_KEY, out); // миграция однократная
  return out;
}

const save = loadSave();
const persist = () => store.set(SAVE_KEY, save);

const isDone = (level) => save.done[level] !== undefined;
const allDone = () => Object.keys(save.done).length >= LEVEL_COUNT;

function solvedIn(set) {
  let n = 0;
  for (let l = firstOf(set); l < firstOf(set + 1); l++) if (isDone(l)) n++;
  return n;
}

function starsIn(set) {
  let n = 0;
  for (let l = firstOf(set); l < firstOf(set + 1); l++) if (isDone(l)) n += save.done[l].stars;
  return n;
}

const setUnlocked = (set) => set === 0 || solvedIn(set - 1) >= UNLOCK_AT;

// Уровень открыт, если открыт его набор и пройден предыдущий уровень набора
function levelUnlocked(level) {
  const set = setOf(level);
  return setUnlocked(set) && (level === firstOf(set) || isDone(level - 1));
}

function totalStars() {
  let n = 0;
  for (let s = 0; s < SETS.length; s++) n += starsIn(s);
  return n;
}

// Куда ведёт «Продолжить»: первый открытый непройденный уровень; 0 — всё пройдено
function continueLevel() {
  for (let l = 1; l <= LEVEL_COUNT; l++) if (levelUnlocked(l) && !isDone(l)) return l;
  return 0;
}

// Записываем результат и возвращаем, что изменилось — для окна победы
function record(level, moves, par) {
  const prev = save.done[level];
  const stars = starsFor(moves, par);
  const nextSet = setOf(level) + 1;
  const hasNext = nextSet < SETS.length;
  const wasOpen = hasNext && setUnlocked(nextSet);

  save.done[level] = {
    stars: Math.max(stars, prev ? prev.stars : 0),
    best: prev && prev.best ? Math.min(prev.best, moves) : moves,
  };

  // Подсказки начисляются только за новые уровни, чтобы их нельзя было фармить повторами
  let bonus = false;
  if (!prev && ++save.charge >= HINT_EVERY) {
    save.charge = 0;
    if (save.hints < HINT_MAX) { save.hints++; bonus = true; }
  }
  persist();

  return {
    stars,
    moves,
    best: prev ? prev.best : 0,
    record: !!prev && prev.best > 0 && moves < prev.best,
    bonus,
    opened: hasNext && !wasOpen && setUnlocked(nextSet) ? SETS[nextSet].name : '',
  };
}

// ---------- Звук ----------

// Всё синтезируется кодом через Web Audio, без файлов. AudioContext создаём
// только по касанию: iOS не запускает звук без жеста пользователя
const SOUND_KEY = 'pereliv.sound';
const PENTA = [0, 2, 4, 7, 9]; // мажорная пентатоника — любые ноты звучат вместе

const sound = {
  on: store.get(SOUND_KEY, true) !== false,
  ctx: null,
  out: null,

  // Вызывается на каждом касании: создаёт контекст и будит его после сворачивания
  unlock() {
    if (!this.on) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // Не прерываем музыку игрока и уважаем беззвучный режим iPhone
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* нет API */ }
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.35; // общая громкость — фоновая
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },

  set(on) {
    this.on = on;
    store.set(SOUND_KEY, on);
    if (on) {
      this.unlock();
      this.ctx?.resume().then(() => this.click(), () => {});
    } else {
      this.ctx?.suspend().catch(() => {});
    }
  },

  // Пока контекст спит, звуки не копим — иначе они разом сыграют при пробуждении
  ready() { return this.on && this.ctx && this.ctx.state === 'running'; },

  // Одна нота: мягкая атака и экспоненциальное затухание
  tone(freq, { type = 'sine', at = 0, gain = 0.1, attack = 0.005, decay = 0.2, slide = 1 } = {}) {
    const { ctx } = this;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  },

  // Выбор плитки: короткий тихий «тик» с падающей высотой
  click() {
    if (this.ready()) this.tone(900, { gain: 0.06, decay: 0.05, slide: 0.6 });
  },

  // Обмен: нота пентатоники по диагонали поля — светлый левый верхний угол
  // звучит выше всего, тёмный правый нижний ниже всего
  swap(pos) {
    if (!this.ready()) return;
    const { cols, rows } = state;
    const t = ((pos % cols) / (cols - 1) + Math.floor(pos / cols) / (rows - 1)) / 2;
    const step = Math.round((1 - t) * (PENTA.length * 2 - 1));
    const semis = PENTA[step % PENTA.length] + 12 * Math.floor(step / PENTA.length);
    this.tone(196 * 2 ** (semis / 12), { type: 'triangle', gain: 0.08, decay: 0.16 }); // от соль малой
  },

  // «Я тебя люблю»: мягкий высокий звон — ми второй октавы и тихий отзвук выше
  love() {
    if (!this.ready()) return;
    this.tone(1318.5, { gain: 0.06, attack: 0.01, decay: 0.35 });
    this.tone(1975.5, { at: 0.06, gain: 0.025, attack: 0.01, decay: 0.3 });
  },

  // Победа: до-ми-соль-до вверх, ноты тянутся и сливаются в аккорд
  chord() {
    if (!this.ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, { at: i * 0.09, gain: 0.06, attack: 0.02, decay: 1.3 });
      this.tone(f / 2, { type: 'triangle', at: i * 0.09, gain: 0.025, attack: 0.02, decay: 1.1 });
    });
  },
};

// ---------- Состояние ----------

const state = {
  level: 1,
  cols: 5,
  rows: 7,
  colors: [],     // colors[id] — цвет плитки с номером id (id = её правильная позиция)
  order: [],      // order[pos] — id плитки, стоящей на позиции pos
  start: [],      // стартовая раскладка уровня (для перезапуска)
  theme: '',
  index: 1,       // номер уровня внутри набора
  fixed: new Set(),
  selected: -1,
  moves: 0,
  minMoves: 0,
  locked: true,
  tile: 48,
};

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const board = $('board');
const sheet = $('win');
const tip = $('tip');
let cells = [];   // DOM-элементы позиций
let timers = [];

function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

const isSolved = (order) => order.every((id, pos) => id === pos);

// 1 ход, 2 хода, 5 ходов
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// ---------- Перемешивание ----------

// Фишер–Йейтс только по подвижным плиткам на seeded-генераторе;
// повторяем, если вышло собранное поле
function shuffled(total, fixed, rng) {
  const free = [];
  for (let p = 0; p < total; p++) if (!fixed.has(p)) free.push(p);

  const order = Array.from({ length: total }, (_, i) => i);
  do {
    const ids = free.slice();
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    free.forEach((pos, k) => { order[pos] = ids[k]; });
  } while (isSolved(order));
  return order;
}

// Эталон: число неверно стоящих плиток минус число циклов среди них
function minSwaps(order) {
  const seen = new Array(order.length).fill(false);
  let misplaced = 0, cycles = 0;
  for (let i = 0; i < order.length; i++) {
    if (seen[i] || order[i] === i) continue;
    cycles++;
    for (let j = i; !seen[j]; j = order[j]) { seen[j] = true; misplaced++; }
  }
  return misplaced - cycles;
}

// ---------- Экраны ----------

const screens = { menu: $('menu'), sets: $('sets'), levels: $('levels'), game: $('game') };
let screen = 'menu';

function show(name) {
  screen = name;
  for (const [key, node] of Object.entries(screens)) node.classList.toggle('active', key === name);
}

// Уходя с игрового экрана, гасим таймеры и блокируем поле
function leaveGame() {
  clearTimers();
  deselect();
  setWon(false);
  state.locked = true;
}

// Превью набора: маленький градиент из его исходных углов
function mosaic(node, cols, rows, set) {
  node.replaceChildren();
  buildColors(cols, rows, set.corners, set.mixHue).forEach((c, i) => {
    const t = node.appendChild(el('i'));
    t.style.background = c.css;
    t.style.setProperty('--d', ((i % cols) + Math.floor(i / cols)) * 70);
  });
}

function openMenu() {
  leaveGame();

  const next = continueLevel();
  $('continue-sub').textContent = next
    ? `${SETS[setOf(next)].name} · уровень ${indexOf(next)}`
    : 'Все уровни пройдены';
  $('choose-sub').textContent = `★ ${totalStars()} / ${LEVEL_COUNT * 3}`;

  show('menu');

  // Логотип приветствует волной
  const logo = $('logo');
  logo.classList.remove('wave');
  void logo.offsetWidth;
  logo.classList.add('wave');
}

// Список наборов: прогресс «6/10» и звёзды каждого, сверху — все звёзды игры
function openSets() {
  leaveGame();

  const list = $('set-list');
  list.replaceChildren();
  SETS.forEach((set, i) => {
    const open = setUnlocked(i);
    const solved = solvedIn(i);
    const stars = starsIn(i);

    const card = el('button', 'set' + (open ? '' : ' locked'));
    card.type = 'button';
    card.dataset.set = i;

    mosaic(card.appendChild(el('span', 'mosaic')), 4, 3, set);

    const info = card.appendChild(el('span', 'set-info'));
    info.appendChild(el('b', '', set.name));
    if (open) {
      info.appendChild(el('small', '', `${solved}/${SET_SIZE}`));
      const fill = info.appendChild(el('span', 'meter')).appendChild(el('span'));
      const [tl, , , br] = set.corners.map(cornerCss);
      fill.style.width = (solved / SET_SIZE) * 100 + '%';
      fill.style.background = `linear-gradient(90deg, ${tl}, ${br})`;
    } else {
      const left = UNLOCK_AT - solvedIn(i - 1);
      info.appendChild(el('small', '', `Ещё ${left} ${plural(left, 'уровень', 'уровня', 'уровней')} в «${SETS[i - 1].name}»`));
    }

    const meta = card.appendChild(el('span', 'set-meta'));
    if (open) meta.textContent = `★ ${stars}`;
    else meta.innerHTML = LOCK_SVG;

    card.setAttribute('aria-label', open
      ? `${set.name}: пройдено ${solved} из ${SET_SIZE}, звёзд ${stars}`
      : `${set.name}: закрыт`);
    list.appendChild(card);
  });
  $('total-stars').textContent = `★ ${totalStars()} / ${LEVEL_COUNT * 3}`;

  show('sets');
}

function openLevels(set) {
  leaveGame();

  $('levels-title').textContent = SETS[set].name;
  $('levels-stars').textContent = `★ ${starsIn(set)} / ${SET_SIZE * 3}`;

  const grid = $('level-grid');
  grid.replaceChildren();
  for (let i = 0; i < SET_SIZE; i++) {
    const level = firstOf(set) + i;
    const open = levelUnlocked(level);
    const done = save.done[level];

    const btn = el('button', 'lv' + (open ? (done ? '' : ' current') : ' locked'));
    btn.type = 'button';
    btn.dataset.level = level;
    if (!open) btn.disabled = true;

    const face = btn.appendChild(el('span', 'lv-face'));
    const num = face.appendChild(el('span', 'lv-num'));
    if (open) {
      // Углы те же, что у самого уровня: levelCorners — первый потребитель генератора
      const [tl, tr, bl, br] = levelCorners(level, rngFor(level)).map(cornerCss);
      Object.entries({ tl, tr, bl, br }).forEach(([k, v]) => face.style.setProperty('--' + k, v));
      num.textContent = i + 1;
    } else {
      num.innerHTML = LOCK_SVG;
    }

    const stars = btn.appendChild(el('span', 'lv-stars'));
    for (let s = 0; s < 3; s++) stars.appendChild(el('span', done && s < done.stars ? 'on' : '', '★'));

    btn.setAttribute('aria-label', `Уровень ${i + 1}` +
      (!open ? ', закрыт' : done ? `, звёзд ${done.stars}` + (done.best ? `, лучший результат ${done.best}` : '') : ''));
    grid.appendChild(btn);
  }

  const nextSet = set + 1;
  const solved = solvedIn(set);
  let note = '';
  if (nextSet < SETS.length && !setUnlocked(nextSet)) {
    const left = UNLOCK_AT - solved;
    note = `Пройдите ещё ${left} ${plural(left, 'уровень', 'уровня', 'уровней')}, чтобы открыть «${SETS[nextSet].name}»`;
  } else if (solved === SET_SIZE) {
    note = 'Набор пройден полностью';
  }
  $('levels-note').textContent = note;

  show('levels');
}

function openLevel(level) {
  show('game');
  startLevel(level);
}

// ---------- Отрисовка поля ----------

function buildBoard() {
  const { cols, rows } = state;
  board.innerHTML = '';
  board.style.setProperty('--cols', cols);
  cells = [];
  // Угловые позиции поля — только у них скруглённые внешние углы
  const corners = { 0: 'c-tl', [cols - 1]: 'c-tr', [(rows - 1) * cols]: 'c-bl', [cols * rows - 1]: 'c-br' };

  for (let pos = 0; pos < cols * rows; pos++) {
    const cell = document.createElement('div');
    cell.className = 'tile';
    cell.dataset.pos = pos;
    cell.setAttribute('role', 'gridcell');
    if (corners[pos]) cell.classList.add(corners[pos]);
    if (state.fixed.has(pos)) {
      cell.classList.add('fixed');
      if (state.colors[pos].light) cell.classList.add('light');
    }
    cell.appendChild(document.createElement('div')).className = 'swatch';
    board.appendChild(cell);
    cells.push(cell);
  }
  state.order.forEach((_, pos) => paint(pos));
}

// color тоже ставим: им рисуется полупиксельная тень, закрывающая щели между плитками
function paint(pos) {
  const sw = cells[pos].firstChild;
  sw.style.backgroundColor = sw.style.color = state.colors[state.order[pos]].css;
}

// Подгоняем размер плитки под свободное место. clientWidth/Height, а не
// getBoundingClientRect — на размер не должен влиять transform экрана.
// Плитка — целое число пикселей, чтобы между плитками не было щелей
function fit() {
  const t = Math.max(16, Math.floor(Math.min(stage.clientWidth / state.cols, stage.clientHeight / state.rows)));
  state.tile = t;
  board.style.setProperty('--tile', t + 'px');
  board.style.setProperty('--corner', Math.min(14, Math.round(t * 0.22)) + 'px');
}

function updateHud() {
  $('hud-set').textContent = state.theme;
  $('hud-level').textContent = `Уровень ${state.index}`;
  $('hud-level').title = `Уровень ${state.level} из ${LEVEL_COUNT} · ${state.cols}×${state.rows}`;
  $('hud-goal').textContent = `★★★ до ${Math.floor((state.minMoves * 6) / 5)}`;
  $('moves').textContent = state.moves;
  $('moves-word').textContent = plural(state.moves, 'ход', 'хода', 'ходов');

  $('hint-count').textContent = save.hints;
  $('hint').setAttribute('aria-disabled', save.hints === 0 || state.locked);
  $('hint').setAttribute('aria-label', `Подсказка, осталось ${save.hints}`);
  $('restart').setAttribute('aria-disabled', state.locked || state.moves === 0);
  updateTip();
}

// Строка под полем: обучающая подсказка на первых уровнях или короткое сообщение
const TIP = 'Коснитесь двух плиток, чтобы поменять их местами';
let toastTimer = 0;

function updateTip() {
  if (toastTimer) return;
  const on = !state.locked && state.moves === 0 && state.level <= 3;
  if (on) tip.textContent = TIP;
  tip.classList.toggle('show', on);
}

function toast(text) {
  clearTimeout(toastTimer);
  tip.textContent = text;
  tip.classList.add('show');
  toastTimer = setTimeout(() => { toastTimer = 0; updateTip(); }, 2400);
}

// ---------- Ходы ----------

function select(pos) {
  deselect();
  state.selected = pos;
  cells[pos].classList.add('selected');
}

function deselect() {
  if (state.selected >= 0 && cells[state.selected]) cells[state.selected].classList.remove('selected');
  state.selected = -1;
}

// FLIP: плитка стартует с чужой позиции и «прилетает» на свою
function fly(to, from) {
  const cell = cells[to];
  const sw = cell.firstChild;
  const { cols, tile } = state;
  const dx = ((from % cols) - (to % cols)) * tile;
  const dy = (Math.floor(from / cols) - Math.floor(to / cols)) * tile;

  cell.classList.add('moving');
  sw.style.transition = 'none';
  sw.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
  void sw.offsetWidth; // фиксируем стартовое положение
  sw.style.transition = '';
  sw.style.transform = '';
  setTimeout(() => cell.classList.remove('moving'), 300);
}

function swap(a, b) {
  deselect();
  const { order } = state;
  [order[a], order[b]] = [order[b], order[a]];
  paint(a);
  paint(b);
  fly(a, b);
  fly(b, a);
  sound.swap(b);
  state.moves++;
  if (isSolved(order)) win();
  updateHud();
}

function onPointerDown(e) {
  if (!e.isPrimary || state.locked) return;
  const cell = e.target.closest('.tile');
  if (!cell) return;
  e.preventDefault();

  const pos = Number(cell.dataset.pos);
  if (state.fixed.has(pos)) return;

  if (state.selected === -1) { select(pos); sound.click(); }
  else if (state.selected === pos) deselect();
  else swap(state.selected, pos);
}

// Подсказка ставит одну неверную плитку на её место (это обычный обмен,
// поэтому он считается ходом). Если выбрана неверная плитка — берём её
function useHint() {
  if (state.locked) return;
  if (save.hints === 0) {
    const left = HINT_EVERY - save.charge;
    toast(allDone()
      ? 'Подсказки закончились'
      : `Новая подсказка — через ${left} ${plural(left, 'новый уровень', 'новых уровня', 'новых уровней')}`);
    return;
  }

  const { order, selected } = state;
  let from = selected >= 0 && order[selected] !== selected ? selected : -1;
  if (from < 0) {
    const wrong = [];
    order.forEach((id, pos) => { if (id !== pos) wrong.push(pos); });
    from = wrong[Math.floor(Math.random() * wrong.length)];
  }
  const to = order[from];

  save.hints--;
  persist();
  swap(from, to);

  const cell = cells[to];
  cell.classList.add('hinted');
  setTimeout(() => cell.classList.remove('hinted'), 900);
}

// ---------- Ход игры ----------

function startLevel(level) {
  clearTimers();
  setWon(false);

  const lv = generateLevel(level);
  Object.assign(state, {
    level,
    cols: lv.cols,
    rows: lv.rows,
    theme: lv.theme,
    index: lv.index,
    colors: lv.colors,
    start: lv.order,
    order: Array.from({ length: lv.cols * lv.rows }, (_, i) => i),
    fixed: lv.fixed,
    minMoves: lv.par,
    selected: -1,
    moves: 0,
    locked: true,
  });
  save.last = level;
  persist();

  // Сначала показываем цельный градиент, потом перемешиваем
  board.classList.remove('wave');
  board.classList.add('solved');
  buildBoard();
  fit();
  updateHud();
  later(scramble, 1200);
}

// Выкладываем стартовую раскладку уровня — она всегда одна и та же
function scramble() {
  clearTimers();
  setWon(false);
  deselect();
  Object.assign(state, { order: state.start.slice(), moves: 0, locked: true });

  board.classList.remove('solved', 'wave');
  board.classList.add('fade');
  state.order.forEach((_, pos) => paint(pos));
  updateHud();

  later(() => {
    board.classList.remove('fade');
    state.locked = false;
    updateHud();
  }, 650);
}

// Волна по диагоналям от левого верхнего угла; возвращает её длительность
function wave() {
  const { cols, rows } = state;
  const span = cols + rows - 2;
  const step = Math.min(45, 650 / span);
  cells.forEach((cell, pos) => {
    cell.style.setProperty('--d', Math.round(((pos % cols) + Math.floor(pos / cols)) * step));
  });
  board.classList.add('wave');
  return Math.round(span * step) + 550;
}

function win() {
  state.locked = true;
  const result = record(state.level, state.moves, state.minMoves);

  // Ждём, пока долетит последняя пара, затем волна, затем швы смыкаются
  later(() => {
    const dur = wave();
    sound.chord();
    later(() => {
      board.classList.remove('wave');
      board.classList.add('solved');
    }, dur);
    later(() => showWin(result), dur + 650);
  }, 320);
}

function showWin(r) {
  const par = state.minMoves;
  [...$('win-stars').children].forEach((s, i) => s.classList.toggle('on', i < r.stars));
  $('win-stars').setAttribute('aria-label', `Звёзд: ${r.stars} из 3`);
  $('win-moves').textContent = r.moves;
  $('win-best').textContent = r.best && !r.record ? `· лучший ${r.best}` : '';
  $('win-min').textContent = par;
  $('win-3').textContent = Math.floor((par * 6) / 5);
  $('win-2').textContent = Math.floor((par * 8) / 5);

  const chips = [];
  if (r.record) chips.push('Новый рекорд');
  if (r.bonus) chips.push('+1 подсказка');
  if (r.opened) chips.push(`Открыт набор «${r.opened}»`);
  $('win-chips').replaceChildren(...chips.map((t) => el('span', 'chip', t)));

  $('next').textContent = state.level < LEVEL_COUNT ? 'Дальше' : 'В меню';
  setWon(true);
}

// Окно победы перекрывает нижние кнопки — на это время прячем их
function setWon(on) {
  sheet.hidden = !on;
  screens.game.classList.toggle('won', on);
}

function next() {
  const n = state.level + 1;
  if (n > LEVEL_COUNT) openMenu();
  else if (levelUnlocked(n)) startLevel(n);
  else openLevels(setOf(state.level));
}

// ---------- «Я тебя люблю» ----------

const HEART_PATH = 'M12 21s-7.4-4.5-9.5-9.1C1 8.6 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.2 1.7-2 3.1-3.2 5.3-3.2 3.7 0 5.7 4.1 4.2 7.4C19.4 16.5 12 21 12 21z';
const HEART_COLORS = ['#ff4d6d', '#ff758f', '#ff8fa3', '#ffb3c1', '#ff5c8a', '#ff2e63', '#e5383b', '#c9184a'];
const HEART_MAX = 80; // одновременно живущих сердечек, чтобы не тормозило
const hearts = $('hearts');
const rand = (a, b) => a + Math.random() * (b - a);

// Одно сердечко: вылетает из точки (x, y) вверх и в сторону, покачивается,
// растёт и растворяется, затем удаляется из DOM
function heart(x, y) {
  const size = Math.round(rand(14, 36));
  const node = el('span', 'heart');
  node.innerHTML = `<svg viewBox="0 0 24 24"><path d="${HEART_PATH}"/></svg>`;
  node.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px;` +
    `color:${HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)]}`;
  hearts.appendChild(node);

  const angle = (rand(-150, -30) * Math.PI) / 180; // веер вверх
  const dist = rand(110, 280);
  const dx = Math.cos(angle) * dist;
  const dy = Math.sin(angle) * dist - rand(40, 160);
  const sway = rand(8, 22) * (Math.random() < 0.5 ? -1 : 1);
  const waves = rand(1.2, 2.6);
  const grow = rand(1.1, 1.7);
  const spin = rand(-25, 25);

  const frames = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const e = 1 - (1 - t) ** 2; // быстрый вылет, плавное торможение
    const s = Math.sin(t * waves * 2 * Math.PI);
    frames.push({
      offset: t,
      transform: `translate(${(dx * e + sway * s).toFixed(1)}px, ${(dy * e).toFixed(1)}px) ` +
        `rotate(${(spin * t + s * 12).toFixed(1)}deg) scale(${(0.3 + (grow - 0.3) * e).toFixed(2)})`,
      opacity: t < 0.1 ? t / 0.1 : t < 0.55 ? 1 : (1 - t) / 0.45,
    });
  }
  const anim = node.animate(frames, { duration: rand(1500, 2500), fill: 'both' });
  anim.onfinish = () => node.remove();
}

function loveBurst(btn) {
  btn.animate([{ transform: 'scale(0.95)' }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'cubic-bezier(0.3, 1.6, 0.5, 1)' });
  sound.love();
  try { navigator.vibrate?.(15); } catch { /* нет API */ }

  const r = btn.getBoundingClientRect();
  const n = 12 + Math.floor(Math.random() * 9); // 12–20 за нажатие
  for (let i = 0; i < n; i++) {
    // Сверх лимита старые сердечки уступают место новым
    if (hearts.childElementCount >= HEART_MAX) hearts.firstChild.remove();
    heart(r.left + r.width / 2 + rand(-0.3, 0.3) * r.width, r.top + r.height / 2 + rand(-0.2, 0.2) * r.height);
  }
}

// Web Animations API есть в Safari с 13.1; без него кнопка просто ничего не делает
const loveBtn = $('love');
if (loveBtn.animate) loveBtn.addEventListener('click', () => loveBurst(loveBtn));

// ---------- Запуск ----------

board.addEventListener('pointerdown', onPointerDown);

$('continue').addEventListener('click', () => {
  const level = continueLevel();
  if (level) openLevel(level); else openSets();
});
$('choose').addEventListener('click', openSets);
$('sets-back').addEventListener('click', openMenu);

$('set-list').addEventListener('click', (e) => {
  const card = e.target.closest('.set');
  if (!card) return;
  const set = Number(card.dataset.set);
  if (setUnlocked(set)) { openLevels(set); return; }
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
});

const soundBtn = $('sound');
const renderSound = () => soundBtn.setAttribute('aria-checked', sound.on);
soundBtn.addEventListener('click', () => { sound.set(!sound.on); renderSound(); });

// Любое касание будит звук; capture — чтобы успеть раньше обработчиков игры
['pointerdown', 'touchend', 'click', 'keydown'].forEach((type) =>
  document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true })
);
// В фоне усыпляем контекст, чтобы не тратить батарею; разбудит следующее касание
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sound.ctx?.suspend().catch(() => {});
});

$('levels-back').addEventListener('click', openSets);
$('level-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('.lv');
  if (btn && !btn.disabled) openLevel(Number(btn.dataset.level));
});

$('back').addEventListener('click', () => openLevels(setOf(state.level)));
$('restart').addEventListener('click', () => { if (!state.locked && state.moves) scramble(); });
$('hint').addEventListener('click', useHint);
$('retry').addEventListener('click', scramble);
$('next').addEventListener('click', next);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (screen === 'game') openLevels(setOf(state.level));
  else if (screen === 'levels') openSets();
  else if (screen === 'sets') openMenu();
});

// Блокируем жесты масштабирования в Safari
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stage);
else window.addEventListener('resize', fit);

mosaic($('logo'), 7, 4, SETS[0]);
renderSound();
openMenu();

// Офлайн-режим: путь относительный, чтобы работать из подпапки на GitHub Pages
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
