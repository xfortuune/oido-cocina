// Pase de temporada: cada estación del año (la de verdad, por la fecha) trae su tema y 10 niveles con
// recompensas para el cocinero. Se sube jugando (cualquier modo) y lo guarda el servidor en el perfil.
import type { Season } from './weather';

export const PASS_LEVELS = 10;
export const PASS_XP_PER_LEVEL = 100;

export interface PassReward {
  level: number;
  /** Lo que se desbloquea: «hat:calabaza», «hair:rosa», «pattern:dorado». */
  unlock: string;
  name: string;
}

export const SEASON_THEMES: Record<Season, { name: string; text: string; rewards: PassReward[] }> = {
  primavera: {
    name: 'Primavera en flor',
    text: 'Pétalos por la calle y todo huele a nuevo.',
    rewards: [
      { level: 2, unlock: 'hair:rosa', name: 'Pelo rosa' },
      { level: 5, unlock: 'hat:flores', name: 'Corona de flores' },
      { level: 10, unlock: 'pattern:dorado', name: 'Delantal dorado' },
    ],
  },
  verano: {
    name: 'Verano en la terraza',
    text: 'Calor, sombrillas y helado de postre.',
    rewards: [
      { level: 2, unlock: 'hair:azul', name: 'Pelo azul' },
      { level: 5, unlock: 'hat:pamela', name: 'Pamela de playa' },
      { level: 10, unlock: 'pattern:dorado', name: 'Delantal dorado' },
    ],
  },
  otono: {
    name: 'Otoño de castañas',
    text: 'Hojas cayendo y calabazas en la puerta.',
    rewards: [
      { level: 2, unlock: 'hair:naranja', name: 'Pelo naranja' },
      { level: 5, unlock: 'hat:calabaza', name: 'Gorro de calabaza' },
      { level: 10, unlock: 'pattern:dorado', name: 'Delantal dorado' },
    ],
  },
  invierno: {
    name: 'Invierno de luces',
    text: 'Luces de colores en la fachada y nieve en la calle.',
    rewards: [
      { level: 2, unlock: 'hair:blanco', name: 'Pelo blanco' },
      { level: 5, unlock: 'hat:lana', name: 'Gorro de lana' },
      { level: 10, unlock: 'pattern:dorado', name: 'Delantal dorado' },
    ],
  },
};

/** Estación de verdad según la fecha (hemisferio norte). */
export function realSeason(date = new Date()): Season {
  const m = date.getMonth();
  return m <= 1 || m === 11 ? 'invierno' : m <= 4 ? 'primavera' : m <= 7 ? 'verano' : 'otono';
}

/** Identificador de la temporada en curso, p. ej. «2026-otono» (el invierno cuenta desde diciembre). */
export function seasonId(date = new Date()): string {
  const y = date.getMonth() <= 1 ? date.getFullYear() - 1 : date.getFullYear();
  return `${y}-${realSeason(date)}`;
}

export function passLevel(xp: number): number {
  return Math.min(PASS_LEVELS, Math.floor(xp / PASS_XP_PER_LEVEL));
}

/** Experiencia del pase por una ronda o un servicio. */
export function passXp(served: number, perfect: number): number {
  return 10 + served * 2 + perfect;
}
