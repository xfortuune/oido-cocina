// Progresión de la campaña: capítulos con objetivos, tablón de encargos, concurso de los domingos
// y formación de los cocineros (las habilidades del Desafío, ganadas con experiencia).

import {
  menuOn,
  PUERTO,
  type Campaign,
  type ChefTraining,
  type DayReport,
  type Mission,
  isNightShift,
  weatherDay,
} from './campaign';
import { makeDilemma } from './barrio';
import { makeReviews } from './reviews';
import { insights } from './analysis';
import { holidayOf } from './weather';
import { levelParams, MAX_LEVEL, type Estilo, type LevelParams } from './levels';
import { getPerk, perkCount, PERKS } from './perks';
import { getRecipe, RECIPES } from './recipes';
import type { TurnStats } from './sim';

// ---------------------------------------------------------------- capítulos

export interface Objective {
  text: string;
  done: boolean;
  progress?: string;
}

export interface Chapter {
  n: number;
  title: string;
  story: string;
  reward: number;
  objectives: (c: Campaign) => Objective[];
}

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    title: 'El puesto del barrio',
    story: 'Abrís Mordiscos Mandarina con un préstamo del banco. Aguantad la primera semana y devolvedlo.',
    reward: 60,
    objectives: (c) => [
      { text: 'Llegar al día 8', done: c.day >= 8, progress: `día ${Math.min(c.day, 8)} de 8` },
      { text: 'Devolver toda la deuda', done: c.debt === 0, progress: c.debt ? `quedan ${c.debt}` : undefined },
    ],
  },
  {
    n: 2,
    title: 'La hora punta',
    story: 'El barrio ya os conoce. Toca crecer: más fama, más manos en la cocina y encargos especiales.',
    reward: 120,
    objectives: (c) => {
      const served = c.totals.served - c.chapterStart.served;
      const missions = c.missionsDone - c.chapterStart.missions;
      return [
        { text: 'Reputación 60 o más', done: c.reputation >= 60, progress: `${c.reputation} de 60` },
        { text: 'Tener al menos un empleado', done: c.staff.length >= 1 },
        { text: 'Servir 60 hamburguesas', done: served >= 60, progress: `${Math.min(served, 60)} de 60` },
        { text: 'Completar 2 encargos del tablón', done: missions >= 2, progress: `${Math.min(missions, 2)} de 2` },
      ];
    },
  },
  {
    n: 3,
    title: 'El concurso del barrio',
    story: 'Llega el concurso de hamburguesas del barrio. Ampliad la carta y llevaos el trofeo.',
    reward: 200,
    objectives: (c) => {
      const recipes = RECIPES.filter((r) => menuKnows(c, r.id)).length;
      const contests = c.contestsWon - c.chapterStart.contests;
      return [
        { text: 'Saber hacer 4 recetas', done: recipes >= 4, progress: `${recipes} de 4` },
        { text: 'Ganar un concurso de cocina (los domingos)', done: contests >= 1 },
        { text: 'Tener 300 monedas', done: c.money >= 300, progress: `${Math.min(c.money, 300)} de 300` },
      ];
    },
  },
  {
    n: 4,
    title: 'El segundo local',
    story: 'Mordiscos Mandarina se queda pequeño. Abrid un local en el puerto… pero cuidado: la cadena Mega Mordisco ha puesto el ojo en el barrio.',
    reward: 300,
    objectives: (c) => {
      const served = c.totals.served - c.chapterStart.served;
      return [
        { text: `Abrir El Puerto (pestaña Local, ${PUERTO.price})`, done: c.puertoOpen },
        { text: 'Tener 3 empleados', done: c.staff.length >= 3, progress: `${Math.min(c.staff.length, 3)} de 3` },
        { text: 'Servir 150 hamburguesas', done: served >= 150, progress: `${Math.min(served, 150)} de 150` },
      ];
    },
  },
  {
    n: 5,
    title: 'La guerra de las hamburguesas',
    story: 'Mega Mordisco quiere quedarse con la ciudad. Ganadles en fama, llevaos la Gran Final y demostrad quién manda.',
    reward: 500,
    objectives: (c) => {
      const rival = c.rival?.rep ?? 0;
      const finals = c.contestsWon - c.chapterStart.contests;
      return [
        { text: 'Más reputación que Mega Mordisco', done: c.reputation > rival, progress: `${c.reputation} contra ${rival}` },
        { text: 'Ganar la Gran Final (un domingo)', done: finals >= 1 },
        { text: 'Tener 2000 monedas', done: c.money >= 2000, progress: `${Math.min(c.money, 2000)} de 2000` },
      ];
    },
  },
];

/** La cadena rival aparece en el capítulo 4 y gana fama cada día. */
export const RIVAL = { name: 'Mega Mordisco', start: 65, perDay: 1, max: 95 };

/** Capítulo actual (undefined cuando ya se han completado todos los que hay). */
export function currentChapter(c: Campaign): Chapter | undefined {
  return CHAPTERS.find((ch) => ch.n === c.chapter);
}

function menuKnows(c: Campaign, recipeId: string): boolean {
  return ['chispa', 'huertana'].includes(recipeId) || c.learnedRecipes.includes(recipeId);
}

/** Si el capítulo actual está completo: cobra la recompensa y pasa al siguiente. */
export function checkChapter(c: Campaign): DayReport['chapterDone'] {
  const ch = currentChapter(c);
  if (!ch || !ch.objectives(c).every((o) => o.done)) return null;
  c.money += ch.reward;
  c.chapter++;
  c.chapterStart = { served: c.totals.served, missions: c.missionsDone, contests: c.contestsWon };
  if (c.chapter >= 4 && !c.rival) c.rival = { rep: RIVAL.start };
  // Capítulo 5 completado: ¡el final! Después se puede seguir jugando libre.
  if (ch.n === CHAPTERS[CHAPTERS.length - 1].n) c.finished = true;
  return { n: ch.n, title: ch.title, reward: ch.reward };
}

// ---------------------------------------------------------------- tablón de encargos

/** Número pseudoaleatorio repetible para un día (0-1): el mismo tablón para todo el grupo. */
function rnd(day: number, salt: number): number {
  let h = (Math.imul(day, 2654435761) ^ Math.imul(salt, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  // >>> 0: el XOR deja un entero con signo; negativo daría un índice fuera de la lista.
  return ((h >>> 0) % 10000) / 10000;
}

/** Los encargos del tablón aparecen a partir del capítulo 2: dos por mañana. */
export function makeBoard(c: Campaign): Mission[] {
  if (c.chapter < 2) return [];
  const menu = menuOn(c).map((m) => m.recipeId);
  const big = menu.map((id) => getRecipe(id)).sort((a, b) => b.layers.length - a.layers.length)[0];
  const lvl = Math.min(4, c.chapter);
  const all: Mission[] = [
    {
      id: 'boda',
      kind: 'boda',
      title: 'Boda en el barrio',
      text: `Servid ${2 + lvl} ${big.name} hoy.`,
      recipeId: big.id,
      target: 2 + lvl,
      reward: 35 + 10 * lvl,
      rep: 3,
    },
    { id: 'critico', kind: 'critico', title: 'Viene un crítico', text: `${2 + lvl} pedidos perfectos hoy.`, target: 2 + lvl, reward: 40 + 10 * lvl, rep: 4 },
    { id: 'festival', kind: 'festival', title: 'Festival del barrio', text: `Servid ${6 + 2 * lvl} pedidos hoy.`, target: 6 + 2 * lvl, reward: 45 + 10 * lvl, rep: 2 },
    { id: 'inspeccion', kind: 'inspeccion', title: 'Inspección sanitaria', text: 'Nada quemado ni tirado a la basura hoy.', target: 0, reward: 35 + 5 * lvl, rep: 3 },
    { id: 'colegio', kind: 'colegio', title: 'Excursión del colegio', text: `${1 + lvl} menús completos (con patatas y bebida).`, target: 1 + lvl, reward: 40 + 10 * lvl, rep: 2 },
  ];
  const a = Math.floor(rnd(c.day, 1) * all.length) % all.length;
  let b = Math.floor(rnd(c.day, 2) * all.length) % all.length;
  if (b === a) b = (a + 2) % all.length;
  return [all[a], all[b]].map((m) => ({ ...m, id: `${m.id}-${c.day}` }));
}

export function acceptMission(c: Campaign, id: string): boolean {
  if (c.activeMission || c.contestToday) return false;
  const m = c.board.find((x) => x.id === id);
  if (!m) return false;
  c.activeMission = m;
  return true;
}

/** Cómo va un encargo con las estadísticas del servicio. */
export function missionProgress(m: Mission, s: TurnStats): { ok: boolean; progress: string } {
  switch (m.kind) {
    case 'boda': {
      const n = s.byRecipe?.[m.recipeId ?? ''] ?? 0;
      return { ok: n >= m.target, progress: `${n} de ${m.target}` };
    }
    case 'critico':
      return { ok: s.perfect >= m.target, progress: `${s.perfect} de ${m.target}` };
    case 'festival':
      return { ok: s.served >= m.target, progress: `${s.served} de ${m.target}` };
    case 'inspeccion': {
      const bad = s.burnt + s.trashed;
      return { ok: bad === 0, progress: bad ? `${bad} fallos` : 'sin fallos' };
    }
    case 'colegio': {
      const n = s.combos ?? 0;
      return { ok: n >= m.target, progress: `${n} de ${m.target}` };
    }
  }
}

// ---------------------------------------------------------------- concurso de los domingos

export function contestAvailable(c: Campaign): boolean {
  return c.day % 7 === 0;
}

export function setContest(c: Campaign, on: boolean): boolean {
  if (on && (!contestAvailable(c) || c.activeMission)) return false;
  c.contestToday = on;
  return true;
}

/** Cada concurso es más difícil que el anterior. */
export function contestLevel(c: Campaign): number {
  const base = Math.min(MAX_LEVEL, 4 + 2 * Math.floor(c.day / 7));
  return isGrandFinal(c) ? Math.max(14, base) : base;
}

/** En el capítulo 5 el concurso de los domingos es la Gran Final (más difícil y con más premio). */
export function isGrandFinal(c: Campaign): boolean {
  return c.chapter === 5;
}

export function contestPrize(c: Campaign): number {
  return isGrandFinal(c) ? 300 : CONTEST_PRIZE;
}

export const CONTEST_PRIZE = 100;

export function contestParams(c: Campaign, players: number, estilo: Estilo): LevelParams {
  // En el concurso no hay eventos: se compite en igualdad.
  return { ...levelParams(contestLevel(c), players, estilo), incidents: 0, night: false, stock: 0, boss: false };
}

// ---------------------------------------------------------------- formación

/** Experiencia por punto de formación. */
export const XP_PER_POINT = 40;

export function chefPoints(t: ChefTraining): number {
  return Math.floor(t.xp / XP_PER_POINT) - t.perks.length;
}

export function chefFor(c: Campaign, key: string, name: string): ChefTraining {
  const t = (c.chefs[key] ??= { name, xp: 0, perks: [] });
  t.name = name;
  return t;
}

/** Aprender una habilidad con un punto de formación (las que se pueden repetir, hasta su máximo). */
export function train(c: Campaign, key: string, perkId: string): boolean {
  const t = c.chefs[key];
  const perk = getPerk(perkId);
  if (!t || !perk || chefPoints(t) <= 0 || perkCount(t.perks, perk.id) >= perk.max) return false;
  t.perks.push(perk.id);
  return true;
}

export const TRAINABLE = PERKS;

// ---------------------------------------------------------------- después del cierre

export interface DayExtras {
  stats: TurnStats;
  contest: { served: number; goal: number } | null;
  /** Experiencia de cada cocinero presente: clave, nombre y puntos ganados. */
  xp: { key: string; name: string; gained: number }[];
  /** Parte de la despensa de calidad al abrir (para las reseñas). */
  quality?: number;
}

/** Tras cerrar el día: encargo, concurso, experiencia, capítulo y tablón de mañana. */
export function afterClose(c: Campaign, r: DayReport, e: DayExtras): void {
  // Encargo aceptado
  if (c.activeMission) {
    const m = c.activeMission;
    const { ok, progress } = missionProgress(m, e.stats);
    if (ok) {
      c.money += m.reward;
      c.reputation = Math.min(100, c.reputation + m.rep);
      c.missionsDone++;
    } else c.reputation = Math.max(0, c.reputation - 2);
    r.mission = { title: m.title, ok, reward: ok ? m.reward : 0, rep: ok ? m.rep : -2, progress };
  }
  // Concurso
  if (e.contest) {
    const won = e.contest.served >= e.contest.goal;
    const prize = won ? contestPrize(c) : 20;
    c.money += prize;
    if (won) {
      c.contestsWon++;
      c.reputation = Math.min(100, c.reputation + 5);
    }
    r.contest = { ...e.contest, won, prize };
  }
  // Experiencia de los cocineros
  r.xp = e.xp.map(({ key, name, gained }) => {
    const t = chefFor(c, key, name);
    const before = chefPoints(t);
    t.xp += gained;
    return { name, gained, newPoints: chefPoints(t) - before };
  });
  // La cadena rival gana fama cada día.
  if (c.rival) c.rival.rep = Math.min(RIVAL.max, c.rival.rep + RIVAL.perDay);
  r.rivalRep = c.rival?.rep ?? null;
  r.moneyAfter = c.money;
  r.repAfter = c.reputation;
  r.chapterDone = checkChapter(c);
  if (r.chapterDone) r.moneyAfter = c.money;
  // Reseñas de los clientes y un consejo (no en el concurso)
  if (!e.contest) {
    r.advice = insights(e.stats)[0];
    const items = menuOn(c);
    const priceRatio = items.reduce((n, m) => n + m.price / getRecipe(m.recipeId).price, 0) / Math.max(1, items.length);
    r.reviews = makeReviews({
      day: r.day,
      stats: e.stats,
      priceRatio,
      quality: e.quality ?? 0,
      weather: r.weather ?? '',
      night: isNightShift(r.day),
      holiday: !!holidayOf(weatherDay({ day: r.day, city: c.city })),
      chefs: e.xp.map((x) => x.name),
    });
  }
  // Mañana
  c.activeMission = null;
  c.contestToday = false;
  c.board = makeBoard(c);
  c.dilemma = makeDilemma(c);
}

/** Al cambiar algo en la gestión (por ejemplo, devolver la deuda) puede completarse el capítulo. */
export function checkChapterNow(c: Campaign): DayReport['chapterDone'] {
  const done = checkChapter(c);
  if (done) c.board = c.board.length ? c.board : makeBoard(c);
  return done;
}
