// Tienda del Desafío, entre rondas: el equipo gasta el dinero de la partida.
// - Mejoras y reformas del local: duran hasta que se pierde una ronda (como las habilidades).
// - Empleados (desde el nivel 6): hacen solos una zona de la cocina y cobran un sueldo cada ronda.
// - Consumibles: valen solo para la ronda siguiente y se pueden comprar una y otra vez.
// - Caja sorpresa: cada vez más cara; puede tocar de todo… o tomates podridos.
// - Ropa especial: gorros que se quedan para siempre, aunque se pierda la partida.

export type ShopKind = 'mejora' | 'reforma' | 'empleado' | 'consumible' | 'sorpresa' | 'ropa';

export interface Upgrade {
  id: string;
  kind: ShopKind;
  name: string;
  description: string;
  /** Precio con un jugador; con más se encarece algo, porque también se gana más. */
  price: number;
  color: number;
  /** Nivel a partir del que se puede comprar. */
  minLevel?: number;
  /** Hace falta haber comprado esto antes (la segunda reforma, tras la primera). */
  requires?: string;
  /** Empleados: sueldo que se descuenta del dinero de cada ronda superada. */
  wage?: number;
  /** Ropa: el gorro que desbloquea (looks.ts). */
  hat?: string;
}

export const UPGRADES: Upgrade[] = [
  // Mejoras
  { id: 'plancha3', kind: 'mejora', name: 'Tercera plancha', description: 'Una plancha más, debajo de la mesa de montaje.', price: 45, color: 0xc0392b },
  { id: 'parrilla', kind: 'mejora', name: 'Plancha de hierro', description: 'Toda la carne se hace un 20 % antes.', price: 35, color: 0x8e5a3c },
  { id: 'freidora', kind: 'mejora', name: 'Freidora industrial', description: 'Todas las patatas se fríen un 30 % antes.', price: 30, color: 0xf1c40f },
  { id: 'dispensador', kind: 'mejora', name: 'Dispensador doble', description: 'Todos los vasos se llenan un 40 % antes.', price: 25, color: 0x4fa3e0 },
  { id: 'terraza', kind: 'mejora', name: 'Terraza con sombrillas', description: 'Los clientes esperan un 15 % más.', price: 40, color: 0x27ae60 },
  { id: 'extintor', kind: 'mejora', name: 'Extintor', description: 'Lo quemado no cuesta dinero y todo tarda un 30 % más en quemarse.', price: 25, color: 0xe5483a },
  { id: 'tarro', kind: 'mejora', name: 'Tarro de propinas', description: 'Las propinas valen el doble.', price: 20, color: 0xd4a017 },
  { id: 'resenas', kind: 'mejora', name: 'Reseñas de 5 estrellas', description: 'Cada ronda empieza con 15 de reputación más.', price: 30, color: 0xff8a3d },
  // Reformas: la cocina crece
  { id: 'reforma1', kind: 'reforma', name: 'Reforma: ampliación', description: 'Cocina más ancha: otra plancha, montaje largo, dos basuras y un hueco más en la calle.', price: 120, color: 0x8d6e63, minLevel: 4 },
  { id: 'reforma2', kind: 'reforma', name: 'Reforma: gran cocina', description: 'Aún más grande: tres freidoras, dos islas de montaje y siete huecos en la calle.', price: 260, color: 0x6d4c41, minLevel: 8, requires: 'reforma1' },
  // Empleados: cada uno hace su zona solo
  { id: 'emp_camarero', kind: 'empleado', name: 'Camarero', description: 'Toma nota a todos los clientes: la caja solo entrega.', price: 40, color: 0x27ae60, minLevel: 6, wage: 6 },
  { id: 'emp_freidor', kind: 'empleado', name: 'Freidor', description: 'Echa patatas cuando las piden y vigila que no se quemen.', price: 50, color: 0xf1c40f, minLevel: 6, wage: 8 },
  { id: 'emp_barman', kind: 'empleado', name: 'Barman', description: 'Llena los vasos de los pedidos que llevan bebida.', price: 50, color: 0x4fa3e0, minLevel: 6, wage: 8 },
  { id: 'emp_limpiador', kind: 'empleado', name: 'Limpiador', description: 'Retira lo quemado al momento y tirar a la basura sale gratis.', price: 35, color: 0x9e9e9e, minLevel: 6, wage: 5 },
  // Consumibles (solo la ronda siguiente)
  { id: 'c_cafe', kind: 'consumible', name: 'Café cargado', description: 'La próxima ronda os movéis todos un 12 % más rápido.', price: 25, color: 0x6d4c41 },
  { id: 'c_hilo', kind: 'consumible', name: 'Hilo musical relajante', description: 'La próxima ronda los clientes esperan un 25 % más.', price: 30, color: 0x9b59b6 },
  { id: 'c_seguro', kind: 'consumible', name: 'Seguro de cocina', description: 'La próxima ronda, los 3 primeros pedidos equivocados no cuentan.', price: 20, color: 0x7f8c8d },
  { id: 'c_propinas', kind: 'consumible', name: 'Noche de propinas', description: 'La próxima ronda las propinas valen el doble.', price: 35, color: 0xd4a017 },
  // Caja sorpresa
  { id: 'sorpresa', kind: 'sorpresa', name: 'Caja sorpresa del proveedor', description: 'Una mejora, una habilidad, un consumible, dinero… o tomates podridos. Cada caja cuesta más.', price: 40, color: 0xff6b9d },
  // Ropa especial (para quien la compra, y para siempre)
  { id: 'ropa_copa', kind: 'ropa', name: 'Sombrero de copa', description: 'Para el cocinero más elegante. Tuyo para siempre.', price: 120, color: 0x34495e, hat: 'copa' },
  { id: 'ropa_vikingo', kind: 'ropa', name: 'Casco vikingo', description: 'A la plancha como a la batalla. Tuyo para siempre.', price: 180, color: 0xb0bec5, hat: 'vikingo' },
  { id: 'ropa_dorado', kind: 'ropa', name: 'Gorro de chef dorado', description: 'Solo para leyendas de la cocina. Tuyo para siempre.', price: 300, color: 0xffd23f, hat: 'dorado' },
];

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): Upgrade | undefined {
  return UPGRADE_BY_ID.get(id);
}

export function upgradePrice(u: Upgrade, players: number, surprisesBought = 0): number {
  const base = u.kind === 'sorpresa' ? u.price + 20 * surprisesBought : u.price;
  // La ropa es personal: no se encarece con más jugadores.
  const scale = u.kind === 'ropa' ? 1 : 1 + 0.25 * (Math.max(1, players) - 1);
  return Math.round((base * scale) / 5) * 5;
}

/** Sueldos por ronda de los empleados contratados. */
export function wagesPerRound(mejoras: readonly string[]): number {
  return mejoras.reduce((n, id) => n + (getUpgrade(id)?.wage ?? 0), 0);
}

export const SHOP_KIND_NAMES: Record<ShopKind, string> = {
  mejora: 'Mejoras',
  reforma: 'Reformas',
  empleado: 'Empleados',
  consumible: 'Para la próxima ronda',
  sorpresa: 'Sorpresa',
  ropa: 'Ropa especial',
};

// ---------------------------------------------------------------- caja sorpresa

export type SurpriseResult =
  | { kind: 'mejora'; id: string; text: string }
  | { kind: 'consumible'; id: string; text: string }
  | { kind: 'habilidad'; text: string }
  | { kind: 'dinero'; amount: number; text: string }
  | { kind: 'nada'; text: string };

const ROTTEN = [
  'Una caja de tomates podridos. Huele fatal.',
  'Un catálogo de servilletas. Nada más.',
  'Una nota del proveedor: «Vuelva usted mañana».',
  'Un pepinillo solitario. Os mira.',
];

/**
 * Lo que sale de la caja sorpresa. La habilidad la reparte el servidor (a quién y cuál).
 * `owned`: mejoras y reformas ya compradas; `queued`: consumibles ya pedidos para la próxima ronda.
 */
export function rollSurprise(owned: readonly string[], queued: readonly string[], price: number, random = Math.random): SurpriseResult {
  const r = random();
  const pick = <T>(list: T[]): T | undefined => list[Math.floor(random() * list.length)];
  if (r < 0.25) {
    const u = pick(UPGRADES.filter((x) => x.kind === 'mejora' && !owned.includes(x.id)));
    if (u) return { kind: 'mejora', id: u.id, text: `¡${u.name} gratis!` };
  }
  if (r < 0.45) {
    const u = pick(UPGRADES.filter((x) => x.kind === 'consumible' && !queued.includes(x.id)));
    if (u) return { kind: 'consumible', id: u.id, text: `¡${u.name} para la próxima ronda!` };
  }
  if (r < 0.65) return { kind: 'habilidad', text: '¡Una habilidad de regalo!' };
  if (r < 0.75) return { kind: 'dinero', amount: price * 2, text: `¡Premio gordo! +${price * 2} monedas` };
  if (r < 0.9) {
    const amount = Math.round(price / 2);
    return { kind: 'dinero', amount, text: `Unas monedas en el fondo: +${amount}` };
  }
  return { kind: 'nada', text: pick(ROTTEN)! };
}
