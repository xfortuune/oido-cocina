// Plano de la cocina de Mordiscos Mandarina, en casillas.
// Las coordenadas del juego van en casillas (1 = una casilla); el cliente las multiplica por el tamaño en píxeles.

import type { Ingredient } from './recipes';

/**
 * Leyenda:
 *  .  calle (clientes)           _  suelo de cocina (se puede andar)
 *  W  pared                      #  encimera libre (para dejar cosas)
 *  P  pase: se entregan aquí     G  plancha
 *  M  mesa de montaje            F  freidora
 *  D  máquina de cola            N  máquina de zumo de naranja
 *  T  basura
 *  b c q l p  cajas de pan, carne cruda, queso, lechuga y patatas
 *  t k        cajas de tomate y bacon (sus recetas salen en niveles más altos)
 */
export const KITCHEN_MAP = [
  '...........',
  '...........',
  '...........',
  'WW#PPP#WWWW',
  'G_________F',
  'G___MM____F',
  'W___##____D',
  'W_________N',
  'WbcqlpT#tkW',
];

export type TileKind =
  | 'outside'
  | 'floor'
  | 'wall'
  | 'counter'
  | 'pase'
  | 'grill'
  | 'montaje'
  | 'fryer'
  | 'drinks'
  | 'trash'
  | 'crate';

export type Flavor = 'cola' | 'naranja';

/** Lo que da cada caja. La carne y las patatas salen crudas. */
export type CrateContent = Exclude<Ingredient, 'carne'> | 'carne_cruda' | 'patatas';

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
  crate?: CrateContent;
  flavor?: Flavor;
}

const CRATES: Record<string, CrateContent> = {
  b: 'pan',
  c: 'carne_cruda',
  q: 'queso',
  l: 'lechuga',
  p: 'patatas',
  t: 'tomate',
  k: 'bacon',
};

const DRINKS: Record<string, Flavor> = { D: 'cola', N: 'naranja' };

const KINDS: Record<string, TileKind> = {
  '.': 'outside',
  _: 'floor',
  W: 'wall',
  '#': 'counter',
  P: 'pase',
  G: 'grill',
  M: 'montaje',
  F: 'fryer',
  T: 'trash',
};

export interface Kitchen {
  width: number;
  height: number;
  tiles: Tile[][];
}

export function parseKitchen(rows: string[] = KITCHEN_MAP): Kitchen {
  const tiles = rows.map((row, y) =>
    [...row].map((ch, x): Tile => {
      if (CRATES[ch]) return { x, y, kind: 'crate', crate: CRATES[ch] };
      if (DRINKS[ch]) return { x, y, kind: 'drinks', flavor: DRINKS[ch] };
      const kind = KINDS[ch];
      if (!kind) throw new Error(`Carácter desconocido en el mapa: "${ch}" (${x}, ${y})`);
      return { x, y, kind };
    }),
  );
  return { width: rows[0].length, height: rows.length, tiles };
}

/** Posición x (centro) de los clientes en la calle, uno por pedido abierto. */
export const CUSTOMER_SLOTS_X = [1.5, 3.5, 5.5, 7.5, 9.5];
export const CUSTOMER_Y = 2.45;

export const PLAYER_SPAWNS = [
  { x: 2.5, y: 7.5 },
  { x: 8.5, y: 7.5 },
  { x: 2.5, y: 4.5 },
  { x: 8.5, y: 4.5 },
];

/**
 * El segundo local de la campaña, en el puerto: más grande y con todo cambiado de sitio.
 * Bebidas y freidoras a la izquierda, planchas a la derecha, dos mesas de montaje en el centro
 * y dos tramos de pase. Mismo ancho de calle (los clientes esperan en los mismos huecos).
 */
export const PUERTO_MAP = [
  '...........',
  '...........',
  '...........',
  'WW#PP#PP#WW',
  'N_________G',
  'D__MM_MM__G',
  'F_________#',
  'F__#####__W',
  'W_________W',
  'WbcqlptkTWW',
];

export type KitchenId = 'barrio' | 'puerto';

export interface KitchenDef {
  id: KitchenId;
  name: string;
  rows: string[];
  spawns: { x: number; y: number }[];
  /** Casilla que se convierte en plancha con la mejora «Tercera plancha». */
  extraGrill: { x: number; y: number };
}

export const KITCHENS: Record<KitchenId, KitchenDef> = {
  barrio: { id: 'barrio', name: 'El Barrio', rows: KITCHEN_MAP, spawns: PLAYER_SPAWNS, extraGrill: { x: 5, y: 6 } },
  puerto: {
    id: 'puerto',
    name: 'El Puerto',
    rows: PUERTO_MAP,
    spawns: [
      { x: 2.5, y: 8.5 },
      { x: 8.5, y: 8.5 },
      { x: 2.5, y: 4.5 },
      { x: 8.5, y: 4.5 },
    ],
    extraGrill: { x: 10, y: 6 },
  },
};

export function getKitchen(id: string | undefined): KitchenDef {
  return KITCHENS[id as KitchenId] ?? KITCHENS.barrio;
}
