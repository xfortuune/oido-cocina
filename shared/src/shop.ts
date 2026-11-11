// Tienda entre rondas: mejoras de la cocina que el equipo paga con el dinero de la partida.
// Duran hasta que se pierde una ronda (como las habilidades), y entonces se pierden con el dinero.
// Las habilidades son de cada cocinero; las mejoras son del local y valen para todos.

export type UpgradeId = 'plancha3' | 'parrilla' | 'freidora' | 'dispensador' | 'terraza' | 'extintor' | 'tarro' | 'resenas';

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  /** Precio con un jugador; con más se encarece algo, porque también se gana más. */
  price: number;
  color: number;
}

export const UPGRADES: Upgrade[] = [
  { id: 'plancha3', name: 'Tercera plancha', description: 'Una plancha más, debajo de la mesa de montaje.', price: 45, color: 0xc0392b },
  { id: 'parrilla', name: 'Plancha de hierro', description: 'Toda la carne se hace un 20 % antes.', price: 35, color: 0x8e5a3c },
  { id: 'freidora', name: 'Freidora industrial', description: 'Todas las patatas se fríen un 30 % antes.', price: 30, color: 0xf1c40f },
  { id: 'dispensador', name: 'Dispensador doble', description: 'Todos los vasos se llenan un 40 % antes.', price: 25, color: 0x4fa3e0 },
  { id: 'terraza', name: 'Terraza con sombrillas', description: 'Los clientes esperan un 15 % más.', price: 40, color: 0x27ae60 },
  { id: 'extintor', name: 'Extintor', description: 'Lo quemado no cuesta dinero y todo tarda un 30 % más en quemarse.', price: 25, color: 0xe5483a },
  { id: 'tarro', name: 'Tarro de propinas', description: 'Las propinas valen el doble.', price: 20, color: 0xd4a017 },
  { id: 'resenas', name: 'Reseñas de 5 estrellas', description: 'Cada ronda empieza con 15 de reputación más.', price: 30, color: 0xff8a3d },
];

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): Upgrade | undefined {
  return UPGRADE_BY_ID.get(id as UpgradeId);
}

export function upgradePrice(u: Upgrade, players: number): number {
  return Math.round((u.price * (1 + 0.25 * (Math.max(1, players) - 1))) / 5) * 5;
}

/** Casilla de la tercera plancha (una encimera debajo de la mesa de montaje). */
export const EXTRA_GRILL = { x: 5, y: 6 };
