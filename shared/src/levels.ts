// Niveles de ¡Oído, Cocina!: del 1 (pocos clientes y con mucha paciencia) al 20 (hora punta de verdad).
// El ritmo también depende de cuántos cocineros sois: con más gente llegan más clientes a la vez,
// y jugando solo (que lo haces todo) los clientes esperan un poco más.

import { RECIPES } from './recipes';

export const MAX_LEVEL = 20;

/** Nivel a partir del cual aparece cada receta en los pedidos. */
export const RECIPE_LEVEL: Record<string, number> = {
  chispa: 1,
  huertana: 3,
  jardin: 5,
  ahumada: 8,
  doble: 11,
  monstruo: 14,
};

export interface LevelParams {
  level: number;
  players: number;
  /** Duración de la ronda en segundos. */
  duration: number;
  /** Segundos entre clientes al principio y al final de la ronda. */
  spawnStart: number;
  spawnEnd: number;
  /** Clientes esperando a la vez como mucho. */
  maxOrders: number;
  /** Multiplica la paciencia base de cada pedido. */
  patience: number;
  /** Probabilidad de que un pedido lleve patatas / bebida. */
  sideChance: number;
  /** Recetas que se pueden pedir en este nivel. */
  recipes: string[];
  /** Pedidos que hay que servir para pasar de nivel. */
  goal: number;
}

/** Cuántos clientes más llegan según el número de cocineros. */
const CROWD = [1, 1, 1.4, 1.75, 2.05];
/** Paciencia según el número de cocineros (jugando solo lo haces todo tú). */
const CROWD_PATIENCE = [1, 1.15, 1.05, 1, 0.95];

export function clampLevel(n: unknown, max = MAX_LEVEL): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(max, MAX_LEVEL, v)) : 1;
}

export function levelParams(level: number, players: number): LevelParams {
  level = clampLevel(level);
  players = Math.max(1, Math.min(4, Math.round(players) || 1));
  // 0 en el nivel 1, 1 en el 20.
  const t = (level - 1) / (MAX_LEVEL - 1);

  const duration = 5 * Math.round((90 + 90 * t) / 5);
  // Al principio la dificultad sube despacio y se acelera en los últimos niveles.
  const base = lerp(24, 8, Math.pow(t, 0.85)) / CROWD[players];
  const spawnStart = base * 1.15;
  const spawnEnd = base * 0.85;
  const maxOrders = Math.max(2, Math.min(5, Math.round(lerp(2, 5, t) + (players - 1) * 0.35)));
  const patience = lerp(2, 0.85, t) * CROWD_PATIENCE[players];
  // En los dos primeros niveles solo hamburguesas.
  const sideChance = level <= 2 ? 0 : lerp(0.1, 0.75, t);
  const recipes = RECIPES.filter((r) => (RECIPE_LEVEL[r.id] ?? 1) <= level).map((r) => r.id);

  // Objetivo: algo más de la mitad de los clientes que llegarían en la ronda.
  const expected = Math.min(duration / ((spawnStart + spawnEnd) / 2), (duration / 25) * maxOrders);
  const goal = Math.max(2, Math.round(expected * 0.55));

  return { level, players, duration, spawnStart, spawnEnd, maxOrders, patience, sideChance, recipes, goal };
}

/** Recetas que aparecen por primera vez en este nivel. */
export function newRecipesAt(level: number): string[] {
  return Object.entries(RECIPE_LEVEL)
    .filter(([, l]) => l === level && level > 1)
    .map(([id]) => id);
}

/** Estrellas de una ronda (0 si no se ha llegado al objetivo). */
export function levelStars(served: number, goal: number): number {
  if (served < goal) return 0;
  if (served >= Math.ceil(goal * 1.6)) return 3;
  if (served >= Math.ceil(goal * 1.3)) return 2;
  return 1;
}

/** "1 min 30 s", "2 min", "45 s". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const r = Math.round(seconds % 60);
  if (m === 0) return `${r} s`;
  return r ? `${m} min ${r} s` : `${m} min`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
