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

// Билинейная интерполяция четырёх углов (тройки чисел) по сетке, построчно
function mixGrid(cols, rows, [tl, tr, bl, br]) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const v = r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1);
      out.push([0, 1, 2].map((i) =>
        (1 - v) * ((1 - u) * tl[i] + u * tr[i]) + v * ((1 - u) * bl[i] + u * br[i])
      ));
    }
  }
  return out;
}

// Плитки по углам, смешанным прямо в LCh: оттенок идёт по кругу, а не
// напрямик через серый центр. Путь выбирают сами числа: от 5 до 295 — через
// зелёный (радуга набора), от 350 до 400 — коротко, через красный
const tileLabs = (cols, rows, corners) => mixGrid(cols, rows, corners).map((mix) => fitGamut(...mix));

// Цвета плиток по углам, заданным в OKLCH. Обычно смешиваем в OKLab,
// с mixHue — в LCh (см. tileLabs)
function buildColors(cols, rows, corners, mixHue = false) {
  const labs = mixHue
    ? tileLabs(cols, rows, corners)
    : mixGrid(cols, rows, corners.map(([L, C, h]) => fitGamut(L, C, h)));
  return labs.map((lab) => ({ css: labToCss(lab), light: lab[0] > 0.72 }));
}

// ---------- Уровни ----------

const SET_SIZE = 10;

// Наборы уровней. corners — оформление набора (превью на карточке, полоска
// прогресса, фоновый оттенок экранов): углы [L, C, h] в OKLCH — левый верхний,
// правый верхний, левый нижний, правый нижний. Оттенки записаны без перехода
// через 360° (390, а не 30). Радуга смешивается в LCh: оттенок идёт по
// столбцам от красного до синего, светлота — по строкам.
// mood — характер набора для палитр его уровней (см. makePalette): оттенки
// hues (от и до, без перехода через 360°; весь круг — у Пастели и Радуги),
// предел насыщенности C, пределы светлоты L (по умолчанию 0.35–0.92) и доля
// уровней с переходом «тёплый → холодный» warm (только с WARM_COLD_FROM)
const SETS = [
  { name: 'Рассвет', corners: [[0.93, 0.08, 90], [0.78, 0.15, 40], [0.64, 0.15, -10], [0.42, 0.14, -60]],
    mood: { hues: [350, 440], C: 0.16, L: [0.4, 0.92] } },   // розовый, персиковый, золотой
  { name: 'Океан',   corners: [[0.94, 0.07, 190], [0.76, 0.12, 235], [0.64, 0.12, 160], [0.36, 0.12, 265]],
    mood: { hues: [185, 265], C: 0.15, L: [0.32, 0.9] } },   // бирюзовый, голубой, синий
  { name: 'Лес',     corners: [[0.94, 0.10, 120], [0.76, 0.13, 85], [0.64, 0.15, 145], [0.38, 0.09, 175]],
    mood: { hues: [120, 170], C: 0.17 } },                   // салатовый, зелёный, хвойный
  { name: 'Пастель', corners: [[0.97, 0.06, 340], [0.80, 0.12, 290], [0.76, 0.11, 390], [0.56, 0.11, 250]],
    mood: { hues: [0, 360], C: 0.1, L: [0.55, 0.93] } },
  { name: 'Закат',   corners: [[0.90, 0.12, 85], [0.70, 0.19, 30], [0.66, 0.15, -15], [0.36, 0.13, -70]],
    mood: { hues: [340, 435], C: 0.19, L: [0.38, 0.9] } },   // розовый, коралловый, оранжевый
  { name: 'Ночь',    corners: [[0.74, 0.10, 300], [0.56, 0.14, 275], [0.54, 0.13, 370], [0.26, 0.08, 260]],
    mood: { hues: [250, 305], C: 0.15, L: [0.25, 0.78] } },  // синий, индиго, фиолетовый
  { name: 'Лаванда', corners: [[0.95, 0.05, 310], [0.76, 0.13, 270], [0.74, 0.14, 350], [0.46, 0.15, 300]],
    mood: { hues: [285, 340], C: 0.15, L: [0.42, 0.92] } },  // фиолетовый, сиреневый
  { name: 'Осень',   corners: [[0.92, 0.12, 100], [0.72, 0.16, 45], [0.70, 0.14, 135], [0.42, 0.11, 60]],
    mood: { hues: [20, 100], C: 0.17, L: [0.38, 0.9], warm: 0.3 } }, // бордовый, оранжевый, жёлтый
  { name: 'Лёд',     corners: [[0.96, 0.03, 215], [0.84, 0.13, 268], [0.66, 0.11, 185], [0.54, 0.15, 232]],
    mood: { hues: [195, 255], C: 0.13, L: [0.5, 0.92] } },  // ледяной голубой
  { name: 'Радуга',  corners: [[0.86, 0.12, 5], [0.82, 0.12, 295], [0.58, 0.16, 5], [0.54, 0.16, 295]], mixHue: true,
    mood: { hues: [0, 360], C: 0.19, L: [0.42, 0.9], warm: 0.5 } },
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

// ---------- Палитры уровней ----------

const GOLDEN = 137.5;      // золотой угол: оттенки соседних уровней далеко друг от друга
const PALETTE_GAP = 0.045; // наименьшее расстояние между палитрами любых двух уровней (OKLab)
const NEIGHBOR_GAP = 0.08; // …и между палитрами соседних уровней
const HUE_STEP = 7;        // шаг сдвига оттенка, если палитра похожа на уже созданную
const THEME_SHIFT = 28;    // дальше этого сдвиг не уводит оттенок от темы набора
const WARM_COLD_FROM = 71; // переход «тёплый → холодный» бывает только с этого уровня

// Разница светлоты между самым светлым и самым тёмным углом сужается от 0.5
// на 1-м уровне до 0.15 на последнем: сложность растёт за счёт неё и размера
// поля, а не за счёт резких цветов
const lightSpan = (level) => 0.5 - 0.35 * progress(level);

// Разность оттенков a − b, приведённая к −180…180
const hueDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

// Наибольшая насыщенность, при которой цвет ещё помещается в sRGB
const maxChroma = (L, h) => Math.hypot(...fitGamut(L, 0.4, h).slice(1));

// Как оси палитры ложатся на углы (левый верхний, правый верхний, левый
// нижний, правый нижний). p — ось светлоты (0 — светлый конец, 1 — тёмный),
// q — перпендикулярная ей ось, вдоль которой меняются насыщенность и оттенок,
// поэтому на поле нет двух одинаковых плиток. Наклон k: 0 — светлота идёт
// по диагонали от левого верхнего угла к правому нижнему, 0.5 — по вертикали
const axes = (k) => ({ p: [0, 0.5 - k, 0.5 + k, 1], q: [0.5 - k, 1, 0, 0.5 + k] });
const TILTS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

// Отражения поля: какой угол канонической раскладки попадает в каждый угол.
// Вариант v = 0…7: отражение v % 4, при v ≥ 4 ось q ещё и развёрнута
const MIRRORS = [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0]];
const VARIANTS = 8;

// Схемы палитр: mono — один оттенок, вторая ось — насыщенность; analog — два
// соседних оттенка (не дальше 60°); warm — от тёплого к холодному через
// промежуточные оттенки, только по диагонали (соседние углы — около половины пути)
const SCHEMES = { mono: 'монохромная', analog: 'аналоговая', warm: 'тёплый → холодный' };

// Среднее расстояние в OKLab между соответствующими углами двух палитр
function paletteDistance(p, q) {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = lchToLab(...p[i]), b = lchToLab(...q[i]);
    sum += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return sum / 4;
}

// Наименьшее расстояние в OKLab между любыми двумя плитками поля.
// Считаем квадраты расстояний — Math.hypot здесь заметно медленнее
function tileGap(cols, rows, corners) {
  const tiles = tileLabs(cols, rows, corners);
  let gap = Infinity;
  for (let i = 1; i < tiles.length; i++) {
    const [L, a, b] = tiles[i];
    for (let j = 0; j < i; j++) {
      const t = tiles[j];
      const d = (L - t[0]) ** 2 + (a - t[1]) ** 2 + (b - t[2]) ** 2;
      if (d < gap) gap = d;
    }
  }
  return Math.sqrt(gap);
}

// Углы палитры [L, C, h] по её описанию. Оттенок записан без перехода через
// 360° (например, 350 → 400), поэтому смешивание в LCh идёт кратчайшим путём.
// Насыщенность задана долей f от наибольшей возможной при этих L и h (не выше
// предела набора): так угол всегда помещается в sRGB, а разница по
// насыщенности не съедается обрезкой у очень светлых и тёмных цветов
function paletteCorners({ v, k, h, dh, w, top, span, f, cap }, shift = 0) {
  const { p, q } = axes(k);
  return MIRRORS[v % 4].map((j) => {
    const pj = p[j], qj = v >= 4 ? 1 - q[j] : q[j];
    const L = top - span * pj;
    const hue = h + shift + dh * (w * pj + (1 - w) * qj);
    return [L, (f[0] + (f[1] - f[0]) * qj) * Math.min(cap, maxChroma(L, hue)), hue];
  });
}

// Палитра уровня строится детерминированно по номеру: своё зерно, схема,
// оттенок из диапазона темы набора, окно светлоты шириной lightSpan. Если
// палитра ближе PALETTE_GAP к палитре любого предыдущего уровня (или ближе
// NEIGHBOR_GAP к предыдущему по номеру), пробуем другие раскладки, затем
// сдвигаем оттенок на ±HUE_STEP, ±2·HUE_STEP… в пределах темы
function makePalette(level, made) {
  const rng = mulberry32(Math.imul(level, 0x85ebca6b) ^ 0xc0105);
  const { mood } = SETS[setOf(level)];
  const [lo, hi] = mood.hues;
  const [Lmin, Lmax] = mood.L || [0.35, 0.92];
  const t = progress(level);
  const span = lightSpan(level);

  let scheme = rng() < 0.4 ? 'mono' : 'analog';
  if (level >= WARM_COLD_FROM && rng() < (mood.warm || 0)) scheme = 'warm';

  // Полный разброс оттенка по полю. У аналоговой он растёт с уровнем
  // (25–40° в начале, 40–60° в конце): светлоты становится меньше, и
  // плитки различаются за счёт оттенка
  const dir = rng() < 0.5 ? 1 : -1;
  const dh = scheme === 'mono' ? 0
    : scheme === 'warm' ? 120 + 30 * rng()
    : 25 + 15 * t + (15 + 5 * t) * rng();

  // Начальный оттенок. Тёплый конец — оранжевый: вверх по кругу путь идёт
  // через жёлтый и зелёный к бирюзовому и синему, вниз — через красный и
  // розовый к фиолетовому
  let h;
  if (scheme === 'warm') {
    h = dir > 0 ? 50 + 30 * rng() : 20 + 30 * rng();
  } else {
    const centre = hi - lo >= 360
      ? (GOLDEN * level) % 360
      : lo + dh / 2 + Math.max(0, hi - lo - dh) * ((level * 0.618034 + 0.25 * rng()) % 1);
    h = centre - (dir * dh) / 2;
  }

  const desc = {
    scheme,
    v: Math.floor(rng() * VARIANTS),
    k: 0,
    h,
    dh: dir * dh,
    // Доля оттенка, которая меняется вместе со светлотой («тёмно-зелёный →
    // салатовый»); остальное — вдоль второй оси
    w: scheme === 'analog' ? 0.3 * rng() : 0,
    top: Lmax - (Lmax - Lmin - span) * rng(), // окно светлоты внутри пределов набора
    span,
    // Вдоль второй оси насыщенность растёт от приглушённой до сочной: одного
    // оттенка (до 60°) мало, чтобы соседние плитки различались
    f: scheme === 'warm' ? [0.75 + 0.2 * rng(), 0.75 + 0.2 * rng()] : [0.3 + 0.15 * rng(), 0.9 + 0.1 * rng()],
    cap: mood.C,
  };

  // Наклон подбираем под размер поля: берём тот, при котором две самые
  // похожие плитки различаются сильнее всего. Переход «тёплый → холодный»
  // идёт только по диагонали, чтобы соседние углы делили путь оттенка
  const [cols, rows] = gridSize(level);
  let widest = -1;
  for (const k of scheme === 'warm' ? [0, 0.1] : TILTS) {
    const gap = tileGap(cols, rows, paletteCorners({ ...desc, k }));
    if (gap > widest) { desc.k = k; widest = gap; }
  }
  const variants = Array.from({ length: VARIANTS }, (_, i) => (desc.v + i * 3) % VARIANTS);

  // Запас по порогу: 1 и больше — палитра подходит
  const need = (i) => (i === made.length - 1 ? NEIGHBOR_GAP : PALETTE_GAP);
  const reach = hi - lo >= 360 ? 180 : THEME_SHIFT;
  let best = null, bestFit = -1;
  for (let n = 0; Math.ceil(n / 2) * HUE_STEP <= reach; n++) {
    const shift = (n % 2 ? 1 : -1) * Math.ceil(n / 2) * HUE_STEP; // 0, +7, −7, +14…
    for (const v of variants) {
      const pal = paletteCorners({ ...desc, v }, shift);
      const fit = Math.min(Infinity, ...made.map((q, i) => paletteDistance(pal, q) / need(i)));
      if (fit > bestFit) { best = pal; bestFit = fit; }
      if (fit >= 1) break;
    }
    if (bestFit >= 1) break;
  }
  best.scheme = scheme; // для отладки и таблицы палитр
  return best; // если порог недостижим — самая непохожая из всех
}

const palettes = []; // palettes[level − 1], строятся по порядку при первом обращении

// Четыре угла уровня [L, C, h] в OKLCH, уже в пределах sRGB:
// левый верхний, правый верхний, левый нижний, правый нижний
function getPalette(level) {
  while (palettes.length < level) palettes.push(makePalette(palettes.length + 1, palettes));
  return palettes[level - 1];
}

// Фоновый оттенок экранов набора: тёмный, едва окрашенный оттенком его углов
function setTint(set) {
  const [, a, b] = [0, 1, 2].map((i) =>
    SETS[set].corners.reduce((sum, c) => sum + lchToLab(...c)[i], 0));
  return labToCss(lchToLab(0.25, 0.035, (Math.atan2(b, a) * 180) / Math.PI));
}

// ---------- Закреплённые плитки ----------

const EDGE_LEVELS = 20; // до этого уровня закреплено больше четырёх плиток

// Сколько плиток закрепить — как прежде: на уровнях 1–20 четыре угла и доля
// краёв (от 50% до 20%), дальше четыре, на последних 10 уровнях — две
function fixedCount(level, cols, rows) {
  if (level > LEVEL_COUNT - SET_SIZE) return 2;
  if (level > EDGE_LEVELS) return 4;
  const share = 0.5 - (0.3 * (level - 1)) / (EDGE_LEVELS - 1);
  return 4 + 2 * Math.round((cols - 2) * share) + 2 * Math.round((rows - 2) * share);
}

// Фишер–Йейтс на seeded-генераторе
function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Шаблоны расстановки: каждый даёт клетки [c, r], из которых выбираются опоры.
// Первые mandatory клеток ставятся прежде остальных, остальные перемешаны
const FIXED_PATTERNS = [
  // Углы и случайные точки на краях: все четыре угла, если опор много, иначе
  // одна пара противоположных
  function cornersAndEdges(cols, rows, n, rng) {
    const corners = rng() < 0.5
      ? [[0, 0], [cols - 1, rows - 1], [cols - 1, 0], [0, rows - 1]]
      : [[cols - 1, 0], [0, rows - 1], [0, 0], [cols - 1, rows - 1]];
    const edges = [];
    for (let c = 1; c < cols - 1; c++) edges.push([c, 0], [c, rows - 1]);
    for (let r = 1; r < rows - 1; r++) edges.push([0, r], [cols - 1, r]);
    const mandatory = n > 4 ? 4 : 2;
    return { mandatory, cells: [...corners.slice(0, mandatory), ...shuffle(edges, rng)] };
  },
  // Диагональ: точки на обеих диагоналях поля. Когда опор мало, без углов —
  // иначе выйдет тот же шаблон, что «углы»
  function diagonals(cols, rows, n) {
    const cells = [];
    const m = Math.max(cols, rows);
    const skip = n > 4 ? 0 : 1;
    for (let i = skip; i < m - skip; i++) {
      const c = Math.round((i * (cols - 1)) / (m - 1)), r = Math.round((i * (rows - 1)) / (m - 1));
      cells.push([c, r], [cols - 1 - c, r]);
    }
    return { cells };
  },
  // Крест: центральные строка и столбец, через одну. На поле чётной ширины
  // (высоты) точки по очереди встают в обе средние линии — так крест стоит
  // ровно посередине
  function cross(cols, rows, n, rng) {
    const mid = (size, i) => (size % 2 ? (size - 1) / 2 : size / 2 - 1 + (i % 2));
    const cells = [];
    const pr = rng() < 0.5 ? 0 : 1, pc = rng() < 0.5 ? 0 : 1;
    for (let r = pr, i = 0; r < rows; r += 2, i++) cells.push([mid(cols, i), r]);
    for (let c = pc, i = 0; c < cols; c += 2, i++) cells.push([c, mid(rows, i)]);
    return { cells };
  },
  // Рамка через одну: по краю поля, на больших полях — бывает с отступом в клетку
  function frame(cols, rows, n, rng) {
    const d = cols >= 6 && rows >= 8 && rng() < 0.5 ? 1 : 0;
    const ring = [];
    for (let c = d; c < cols - 1 - d; c++) ring.push([c, d]);
    for (let r = d; r < rows - 1 - d; r++) ring.push([cols - 1 - d, r]);
    for (let c = cols - 1 - d; c > d; c--) ring.push([c, rows - 1 - d]);
    for (let r = rows - 1 - d; r > d; r--) ring.push([d, r]);
    const phase = rng() < 0.5 ? 0 : 1;
    return { cells: ring.filter((_, i) => i % 2 === phase) };
  },
  // Случайные точки с равномерным распределением: поле делится на полосы
  // gx × gy, в каждой — случайная клетка
  function scatter(cols, rows, n, rng) {
    const gx = Math.max(1, Math.min(cols, Math.round(Math.sqrt((n * cols) / rows))));
    const gy = Math.min(rows, Math.ceil(n / gx));
    const cells = [];
    for (let i = 0; i < gx; i++) {
      for (let j = 0; j < gy; j++) {
        const c0 = Math.floor((i * cols) / gx), c1 = Math.floor(((i + 1) * cols) / gx);
        const r0 = Math.floor((j * rows) / gy), r1 = Math.floor(((j + 1) * rows) / gy);
        // Ближе к середине полосы, чтобы соседние точки не слипались на границе
        const pick = (a, b) => a + Math.floor((b - a) * (0.25 + 0.5 * rng()));
        cells.push([pick(c0, c1), pick(r0, r1)]);
      }
    }
    return { cells };
  },
  // Две-три линии опор, вертикальные или горизонтальные; точки на линии
  // через одну, на соседних линиях вразбежку
  function lines(cols, rows, n, rng) {
    const vertical = rng() < 0.5;
    const across = vertical ? cols : rows, along = vertical ? rows : cols;
    const k = across >= 6 && rng() < 0.5 ? 3 : 2;
    const cells = [];
    for (let i = 0; i < k; i++) {
      const x = Math.min(across - 1, Math.floor(((i + 0.5) * across) / k - 0.5 + rng()));
      for (let y = i % 2; y < along; y += 2) cells.push(vertical ? [x, y] : [y, x]);
    }
    return { cells };
  },
];

// Четверти поля, в которые попадает клетка; средние строка и столбец
// нечётного поля относятся к обеим половинам
function quarters(c, r, cols, rows) {
  const xs = [], ys = [];
  if (2 * c <= cols - 1) xs.push(0);
  if (2 * c >= cols - 1) xs.push(1);
  if (2 * r <= rows - 1) ys.push(0);
  if (2 * r >= rows - 1) ys.push(2);
  return xs.flatMap((x) => ys.map((y) => x + y));
}

// Расстановка опор из клеток шаблона. Опоры стоят вразброс: сначала
// выбираются клетки шаблона, далеко отстоящие от уже выбранных, затем
// требование расстояния понемногу ослабляется. Нигде нет трёх опор подряд
// в строке или столбце, и при четырёх опорах и больше в каждой четверти
// поля есть хотя бы одна. Если правила не дают набрать n опор (так не бывает
// на полях игры), остаток добирается без них
function drawFixed(cols, rows, n, cells, mandatory, rng) {
  const total = cols * rows;
  const on = new Set();
  const at = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && on.has(r * cols + c);
  // Длина отрезка опор через клетку (c, r) по направлению (dc, dr)
  const run = (c, r, dc, dr) => {
    let len = 1;
    for (let k = 1; at(c + k * dc, r + k * dr); k++) len++;
    for (let k = 1; at(c - k * dc, r - k * dr); k++) len++;
    return len;
  };
  // В одной строке или столбце — не больше своей доли опор, чтобы они не
  // выстраивались в линию (даже через одну)
  const perLine = Math.max(2, Math.ceil((1.5 * n) / Math.min(cols, rows)));
  const inLine = (c, r) => {
    let col = 0, row = 0;
    for (const p of on) { if (p % cols === c) col++; if (Math.floor(p / cols) === r) row++; }
    return Math.max(col, row);
  };
  const fits = (c, r) => !on.has(r * cols + c) && run(c, r, 1, 0) < 3 && run(c, r, 0, 1) < 3 && inLine(c, r) < perLine;
  const nearest = (c, r, skip = -1) => {
    let d = Infinity;
    for (const p of on) if (p !== skip) d = Math.min(d, Math.hypot(p % cols - c, Math.floor(p / cols) - r));
    return d;
  };

  const pool = [...cells.slice(0, mandatory), ...shuffle(cells.slice(mandatory), rng)];
  pool.slice(0, mandatory).forEach(([c, r]) => on.add(r * cols + c));
  // Клетки шаблона — пока соседние опоры не касаются сторонами; потом,
  // если опор всё ещё мало, любые клетки поля
  const all = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push([c, r]);
  for (const [list, floor] of [[pool, 1.01], [shuffle(all.slice(), rng), 0]]) {
    for (let need = 1.3 * Math.sqrt(total / n); on.size < n && need >= floor; need *= 0.85) {
      for (const [c, r] of list) {
        if (on.size >= n) break;
        if (fits(c, r) && nearest(c, r) >= need) on.add(r * cols + c);
      }
    }
  }
  for (const [c, r] of all) if (on.size < n) on.add(r * cols + c);

  // Пустую четверть заполняем: убираем опору из самой людной части поля
  // (ту, что ближе всех к соседям и не единственная в своих четвертях) и
  // ставим в пустую четверть клетку подальше от остальных
  if (n >= 4) {
    const count = (q) => [...on].filter((p) => quarters(p % cols, Math.floor(p / cols), cols, rows).includes(q)).length;
    for (let q = 0; q < 4; q++) {
      if (count(q) > 0) continue;
      let victim = -1, crowd = Infinity;
      for (const p of on) {
        const qs = quarters(p % cols, Math.floor(p / cols), cols, rows);
        const d = nearest(p % cols, Math.floor(p / cols), p);
        if (qs.every((x) => count(x) > 1) && d < crowd) { victim = p; crowd = d; }
      }
      if (victim < 0) continue;
      on.delete(victim);
      let spot = null, room = -1;
      for (const [c, r] of [...pool, ...all]) {
        if (!quarters(c, r, cols, rows).includes(q) || !fits(c, r)) continue;
        const d = nearest(c, r);
        if (d > room) { spot = r * cols + c; room = d; }
      }
      on.add(spot ?? victim);
    }
  }
  return on;
}

// Насколько ровно стоят опоры: наименьшее расстояние между ними минус
// наибольшее расстояние от клетки поля до ближайшей опоры (большие пустоты)
function evenness(on, cols, rows) {
  const pts = [...on].map((p) => [p % cols, Math.floor(p / cols)]);
  let close = Infinity, hole = 0;
  pts.forEach(([c, r], i) => pts.slice(0, i).forEach(([x, y]) => { close = Math.min(close, Math.hypot(c - x, r - y)); }));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) hole = Math.max(hole, Math.min(...pts.map(([x, y]) => Math.hypot(c - x, r - y))));
  }
  return close - hole;
}

const FIXED_DRAWS = 4; // из стольких случайных расстановок берём самую ровную

// Одна попытка расстановки опор по шаблону (attempt — номер попытки, см. getFixedTiles)
function placeFixed(level, cols, rows, attempt) {
  const rng = mulberry32(Math.imul(level + 1000 * attempt, 0x27d4eb2f) ^ 0xf1ed);
  const n = fixedCount(level, cols, rows);
  const pattern = FIXED_PATTERNS[(level - 1 + attempt) % FIXED_PATTERNS.length];
  const { cells, mandatory = 0 } = pattern(cols, rows, n, rng);
  let best = null, score = -Infinity;
  for (let i = 0; i < FIXED_DRAWS; i++) {
    const on = drawFixed(cols, rows, n, cells, mandatory, rng);
    const e = evenness(on, cols, rows);
    if (e > score) { best = on; score = e; }
  }
  return best;
}

const fixedMemo = new Map();
const layoutKey = (set) => [...set].sort((a, b) => a - b).join();

// Плитки, закреплённые на уровне: детерминированно по номеру (своё зерно),
// по шаблону, который зависит от номера. Если расстановка совпала с одним из
// предыдущих уровней того же размера, берём следующий шаблон и новое зерно.
// На последних 10 уровнях — два противоположных угла, диагональ чередуется
// от уровня к уровню
function getFixedTiles(level, cols, rows) {
  const total = cols * rows;
  if (level > LEVEL_COUNT - SET_SIZE) return new Set(level % 2 ? [0, total - 1] : [cols - 1, total - cols]);

  const key = `${level}:${cols}x${rows}`;
  if (!fixedMemo.has(key)) {
    const taken = new Set();
    for (let l = level - 1; l >= 1 && gridSize(l).join() === `${cols},${rows}`; l--) {
      taken.add(layoutKey(getFixedTiles(l, cols, rows)));
    }
    let fixed;
    for (let attempt = 0; attempt < FIXED_PATTERNS.length; attempt++) {
      fixed = placeFixed(level, cols, rows, attempt);
      if (!taken.has(layoutKey(fixed))) break;
    }
    fixedMemo.set(key, fixed);
  }
  return new Set(fixedMemo.get(key));
}

// Полное описание уровня по номеру: сетка, цвета, фиксированные плитки,
// стартовая раскладка и эталонное число обменов
function generateLevel(level) {
  const rng = rngFor(level);
  const [cols, rows] = gridSize(level);
  const fixed = getFixedTiles(level, cols, rows);
  const set = SETS[setOf(level)];
  const colors = buildColors(cols, rows, getPalette(level), true);
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
// 1 — 60 уровней (5 × 12), поля v ещё не было; 2 — 100 уровней;
// 3 — опоры на каждом уровне стоят по-своему, стартовые раскладки другие
const SAVE_VERSION = 3;
const UNLOCK_AT = 7;   // столько уровней набора открывают следующий набор
const HINT_MAX = 5;
const HINT_EVERY = 5;  // новая подсказка за каждые 5 впервые пройденных уровней

// Версия 1: уровни были другими, поэтому пройденные переносим по порядку
// на уровни 1, 2, 3… со своими звёздами. Лучший результат на прежнем поле
// к новому не относится — сбрасываем его (0 — «ещё неизвестен»). Версия 2:
// уровни те же, но стартовые раскладки другие — сбрасываем только лучшие результаты
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
  const stale = raw !== null && src.v !== SAVE_VERSION; // нужна миграция
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
  else if (stale) for (const r of Object.values(done)) r.best = 0;

  const out = {
    v: SAVE_VERSION,
    done,
    hints: int(src.hints, 0, HINT_MAX, HINT_MAX),
    charge: int(src.charge, 0, HINT_EVERY - 1, 0), // пройдено новых уровней к следующей подсказке
    last: old ? 1 : int(src.last, 1, LEVEL_COUNT, 1), // последний запущенный уровень
  };
  if (stale) store.set(SAVE_KEY, out); // миграция однократная
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

  document.documentElement.style.setProperty('--tint', setTint(set));
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

    // Мини-градиент из углов палитры уровня; у закрытых он приглушён
    const face = btn.appendChild(el('span', 'lv-face'));
    const [tl, tr, bl, br] = getPalette(level).map(cornerCss);
    Object.entries({ tl, tr, bl, br }).forEach(([k, v]) => face.style.setProperty('--' + k, v));
    const num = face.appendChild(el('span', 'lv-num'));
    if (open) num.textContent = i + 1;
    else num.innerHTML = LOCK_SVG;

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
  document.documentElement.style.setProperty('--tint', setTint(setOf(level)));

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
