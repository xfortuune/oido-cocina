// Mini-habilidades: cada dos niveles superados, cada cocinero elige una entre tres.
// Le acompañan durante toda la partida, hasta que se pierde una ronda y se vuelve al nivel 1 sin ninguna.
// Algunas se pueden coger dos veces (el efecto se suma).

import type { Role } from './sim';

export type PerkId =
  | 'zapatillas'
  | 'vuelta'
  | 'termometro'
  | 'aceite'
  | 'grifo'
  | 'labia'
  | 'simpatia'
  | 'bandeja'
  | 'disculpa'
  | 'clientela';

export interface Perk {
  id: PerkId;
  name: string;
  /** Nombre corto para el HUD. */
  short: string;
  description: string;
  /** Puestos para los que sirve (vacío: para todos). */
  roles: Role[];
  /** Veces que se puede coger. */
  max: number;
  /** Color de la tarjeta. */
  color: number;
}

export const PERKS: Perk[] = [
  { id: 'zapatillas', short: 'Zapatillas', name: 'Zapatillas rápidas', description: 'Te mueves un 12 % más rápido.', roles: [], max: 2, color: 0x4aa3df },
  { id: 'vuelta', short: 'Vuelta y vuelta', name: 'Vuelta y vuelta', description: 'La carne que pones en la plancha se hace un 25 % antes.', roles: ['plancha'], max: 2, color: 0xc0392b },
  { id: 'termometro', short: 'Termómetro', name: 'Termómetro', description: 'Lo que pones en la plancha o la freidora tarda un 60 % más en quemarse.', roles: ['plancha', 'freidora'], max: 2, color: 0xe67e22 },
  { id: 'aceite', short: 'Aceite', name: 'Aceite nuevo', description: 'Las patatas que echas se fríen un 25 % antes.', roles: ['freidora'], max: 2, color: 0xf1c40f },
  { id: 'grifo', short: 'Grifo', name: 'Grifo a presión', description: 'Los vasos que pones se llenan un 35 % antes.', roles: ['freidora'], max: 2, color: 0x9b59b6 },
  { id: 'labia', short: 'Labia', name: 'Labia', description: 'Los clientes a los que tomas nota tienen un 20 % más de paciencia.', roles: ['caja'], max: 2, color: 0x27ae60 },
  { id: 'simpatia', short: 'Simpatía', name: 'Simpatía', description: 'Cada parte que entregas devuelve al cliente un 12 % de paciencia.', roles: ['caja'], max: 2, color: 0x2ecc71 },
  { id: 'bandeja', short: 'Bandeja', name: 'Bandeja', description: 'Con comida en las manos, coger de una caja de ingredientes lo apila encima.', roles: ['montaje'], max: 1, color: 0xd35400 },
  { id: 'disculpa', short: 'Disculpa', name: 'Disculpa a tiempo', description: 'Tu primer fallo de cada ronda no cuesta reputación ni dinero.', roles: [], max: 2, color: 0x7f8c8d },
  { id: 'clientela', short: 'Clientela', name: 'Clientela fiel', description: 'El equipo empieza cada ronda con 10 de reputación más.', roles: [], max: 2, color: 0xff8a3d },
];

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function getPerk(id: string): Perk | undefined {
  return PERK_BY_ID.get(id as PerkId);
}

/** Cada cuántos niveles superados se elige habilidad. */
export const PERK_EVERY = 2;

export function perkCount(perks: readonly string[], id: PerkId): number {
  let n = 0;
  for (const p of perks) if (p === id) n++;
  return n;
}

/**
 * Tres habilidades a elegir: primero las que sirven para tus puestos, sin repetir las que ya tienes al máximo.
 * `solo`: jugando solo no hay que tomar nota, así que Labia no sirve.
 */
export function rollPerkOffer(have: readonly string[], roles: readonly Role[], solo: boolean, random = Math.random): PerkId[] {
  const available = PERKS.filter((p) => perkCount(have, p.id) < p.max && !(solo && p.id === 'labia'));
  const useful = available.filter((p) => p.roles.length === 0 || p.roles.some((r) => roles.includes(r)));
  const pool = useful.length >= 3 ? useful : available;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3).map((p) => p.id);
}
