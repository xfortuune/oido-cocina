// Pixel art de ¡Oído, Cocina!, generado en tiempo de carga a partir de mapas de caracteres.
// Así no hace falta cargar imágenes (y en Discord no hay que mapear más URLs).
import Phaser from 'phaser';
import { BEARDS, HAIR_COLORS, PATTERNS, type ChefLook, type Flavor, type HatId, type Ingredient, type Item, type Tile } from '@hora-punta/shared';

export const TILE = 16;

type Palette = Record<string, string>;

const BASE: Palette = {
  k: '#2b1d14', // contorno
  w: '#f7f4ee', // blanco (gorro, chaqueta)
  g: '#cfcbd6', // gris claro
  s: '#f2c09a', // piel
  S: '#d99a74', // piel sombra
  e: '#2b1d14', // ojos
  m: '#b5524a', // boca
  p: '#3b3b5c', // pantalón
};

/** Delantales de los cocineros (claro, oscuro). Los 4 primeros dan también el color de cada jugador. */
export const CHEF_COLORS: [string, string][] = [
  ['#ff8a3d', '#d9651c'],
  ['#4fa3e0', '#2f74b0'],
  ['#5cc46a', '#37913f'],
  ['#c77de0', '#9450ad'],
  ['#e5483a', '#b22f24'],
  ['#ffc93c', '#d9a01c'],
  ['#f28ac0', '#c45f93'],
  ['#3cc8b4', '#23917f'],
];

// ---------------------------------------------------------------- cocinero

const CHEF_HAT = [
  '................',
  '.....kkkkkk.....',
  '....kwwwwwwk....',
  '...kwwwwwwwwk...',
  '...kwwwwwwwgk...',
  '....kggggggk....',
];

const CHEF_DOWN = [
  ...CHEF_HAT,
  '....khsssshk....',
  '....kseSSesk....',
  '....kssmmssk....',
  '.....kssssk.....',
  '...kwwaaaawwk...',
  '..kswwaaaawwsk..',
  '..kkwaaaaaawkk..',
  '....kAAAAAAk....',
];
const CHEF_UP = [
  ...CHEF_HAT,
  '....khhhhhhk....',
  '....khhhhhhk....',
  '....kShhhhSk....',
  '.....kssssk.....',
  '...kwwwwwwwwk...',
  '..kswwwaawwwsk..',
  '..kkwwwwwwwwkk..',
  '....kwwwwwwk....',
];
const CHEF_SIDE = [
  ...CHEF_HAT,
  '....khhsssssk...',
  '....khsssseSk...',
  '....khsssssssk..',
  '.....kssssk.....',
  '....kwwwaaak....',
  '....kwwsaaak....',
  '....kwwwaaak....',
  '....kAAAAAk.....',
];
/** Cabeza según el accesorio (6 filas, encima de la cara). */
const HEADWEAR: Record<HatId, { down: string[]; up: string[]; side: string[] }> = (() => {
  const cap = (brim: string) => ['................', '................', '................', '.....kkkkkk.....', '....kaaaaaak....', brim];
  const bandana = ['................', '................', '................', '.....kkkkkk.....', '....krrwrrrk....', '....krrrrwrk....'];
  const crown = ['................', '................', '....y..yy..y....', '....yy.yy.yy....', '....yyyyyyyy....', '....kYYYYYYk....'];
  const topHat = ['.....kkkkkk.....', '.....knnnnk.....', '.....knnnnk.....', '.....krrrrk.....', '...kknnnnnnkk...', '....kkkkkkkk....'];
  const viking = ['..w..........w..', '..ww.kkkkkk.ww..', '...wkggggggkw...', '...kggggggggk...', '...kgYgggYggk...', '....kkkkkkkk....'];
  const golden = ['................', '.....kkkkkk.....', '....kyyyyyyk....', '...kyyyyyyyyk...', '...kyyyyyyyYk...', '....kYYYYYYk....'];
  const laurel = ['................', '................', '................', '....l.l..l.l....', '...lLlLllLlLl...', '...L.kkkkkk.L...'];
  const flowers = ['................', '................', '................', '....f.y..f.y....', '...fyfffyfffy...', '....kkkkkkkk....'];
  const sunHat = ['................', '.....kkkkkk.....', '....kbbbbbbk....', '....krrrrrrk....', '.kkbbbbbbbbbbkk.', '..kkkkkkkkkkkk..'];
  const pumpkin = ['.......L........', '......LL........', '....kkkkkkkk....', '...koOooOooOk...', '...koOooOooOk...', '....kkkkkkkk....'];
  const wool = ['.......ww.......', '.......ww.......', '.....kkkkkk.....', '....kcCcCcCk....', '...kcCcCcCcCk...', '...kwwwwwwwwk...'];
  const same = (rows: string[]) => ({ down: rows, up: rows, side: rows });
  return {
    gorro: same(CHEF_HAT),
    bigote: same(CHEF_HAT),
    gafas: same(CHEF_HAT),
    gorra: { down: cap('...kAAAAAAAAk...'), up: cap('....kAAAAAAk....'), side: cap('....kAAAAAAkkk..') },
    panuelo: { ...same(bandana), side: ['................', '................', '................', '.....kkkkkk.....', '...rkrrwrrrk....', '..r.krrrrwrk....'] },
    corona: same(crown),
    copa: same(topHat),
    vikingo: same(viking),
    dorado: same(golden),
    laurel: same(laurel),
    flores: same(flowers),
    pamela: same(sunHat),
    calabaza: same(pumpkin),
    lana: same(wool),
  };
})();

/** Cambios en la cara (filas 6-9 de la cara) para bigote y gafas. */
function face(rows: string[], hat: HatId, dir: 'down' | 'up' | 'side', beard = 'nada'): string[] {
  const out = [...rows];
  if (beard === 'barba' && dir === 'down') {
    out[8] = '....khhmmhhk....';
    out[9] = '.....khhhhk.....';
  }
  if (beard === 'barba' && dir === 'side') {
    out[8] = '....khsssshhhk..';
    out[9] = '.....khhhhk.....';
  }
  if (beard === 'perilla' && dir === 'down') out[9] = '.....kshhsk.....';
  if (beard === 'perilla' && dir === 'side') out[9] = '.....ksshhk.....';
  if (hat === 'bigote' && dir === 'down') out[8] = '....kshhhhsk....';
  if (hat === 'bigote' && dir === 'side') out[8] = '....khssshhhk...';
  if (hat === 'gafas' && dir === 'down') out[7] = '....kkwkkwkk....';
  if (hat === 'gafas' && dir === 'side') out[7] = '....khssskkkk...';
  return out;
}

const LEGS_FRONT = [
  ['....kpk..kpk....', '....kkk..kkk....'],
  ['...kpk...kpk....', '...kkk...kkk....'],
];
const LEGS_SIDE = [
  ['....kpk.kpk.....', '....kkk.kkk.....'],
  ['.....kpkpk......', '.....kkkkk......'],
];

// ---------------------------------------------------------------- clientes

const CUSTOMER = [
  '................',
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '...khhhhhhhhk...',
  '...khsssssshk...',
  '...khseSSeshk...',
  '....kssmmssk....',
  '.....kssssk.....',
  '...kttttttttk...',
  '..ksttttttttsk..',
  '..ksTttttttTsk..',
  '...kTTTTTTTTk...',
  '....kppppppk....',
  '....kpk..kpk....',
  '....kkk..kkk....',
];
const HAIRS = ['#5a3a22', '#2b1d14', '#e0b04a', '#b5482c', '#8a8a96', '#6b3fa0'];
const SHIRTS: [string, string][] = [
  ['#e5483a', '#b22f24'],
  ['#43b049', '#2e8a34'],
  ['#ffc93c', '#d9a01c'],
  ['#4fa3e0', '#2f74b0'],
  ['#f28ac0', '#c45f93'],
  ['#8d6e63', '#5d4037'],
];
const SKINS: [string, string][] = [
  ['#f2c09a', '#d99a74'],
  ['#c98e62', '#a86e46'],
  ['#8d5a3b', '#6b4029'],
];
export const CUSTOMER_LOOKS = HAIRS.length * SHIRTS.length;

// ---------------------------------------------------------------- ingredientes (12 px de ancho)

const ING: Palette = {
  O: '#f6c27a',
  o: '#e8a04a',
  x: '#fff4dc', // semillas
  C: '#a0582c',
  c: '#7a3e1d',
  d: '#4d230d',
  y: '#ffd23f',
  Y: '#e0a800',
  l: '#6cc04a',
  g: '#3f8f2a',
  r: '#e8412c',
  R: '#ff8a73',
  B: '#b5432f',
  b: '#f2b8a2',
  f: '#f3e2a9',
  F: '#d9c27a',
  w: '#ffffff',
  L: '#ffffff',
  z: '#e57f8a',
  Z: '#f4a6ae',
  h: '#2a1a12',
  H: '#4a3a32',
};

export const LAYERS: Record<Ingredient | 'pan_top' | 'carne_cruda' | 'carne_quemada', string[]> = {
  pan: ['kOOOOOOOOOOk', 'kooooooooook', '.kkkkkkkkkk.'],
  pan_top: ['...kkkkkk...', '.kkOOxOOOkk.', 'kOOOOOOOxOOk', 'kOxOOOOOOOOk', 'kooooooooook'],
  carne: ['.kCCCCCCCCk.', 'kcdcccdcccdk', '.kkkkkkkkkk.'],
  carne_cruda: ['.kZZZZZZZZk.', 'kzzZzzzzZzzk', '.kkkkkkkkkk.'],
  carne_quemada: ['.kHHHHHHHHk.', 'khhHhhhhHhhk', '.kkkkkkkkkk.'],
  queso: ['yyyyyyyyyyyy', '.Y..Y...Y.Y.'],
  lechuga: ['lgllglllgllg', 'g.g.g.gg.g.g'],
  tomate: ['.rrRr..rRrr.', '.rrrr..rrrr.'],
  bacon: ['BBBBBBBBBBBB', 'bbbbbbbbbbbb', 'BBBBBBBBBBBB'],
};

/** Acompañamientos (12 px de ancho, como las capas). */
const SIDES: Record<string, string[]> = {
  patatas: ['...f.ff.f...', '..ffFfffFf..', '.fFfffFffff.', '..kkkkkkkk..'],
  fritas: ['...y.y.y....', '..yyyyyyy...', '.kyyyyyyyk..', '.krrrrrrrk..', '.krrwwwrrk..', '..krrrrrk...', '..kkkkkkk...'],
  fritas_quemadas: ['...h.h.h....', '..hhhhhhh...', '.khhhhhhhk..', '.krrrrrrrk..', '.krrwwwrrk..', '..krrrrrk...', '..kkkkkkk...'],
  vaso: ['......k.....', '.....k......', '..kkkkkkkk..', '..kLLLLLLk..', '..kkkkkkkk..', '...kCCCCk...', '...kCwwCk...', '...kCCCCk...', '....kCCk....', '....kkkk....'],
};
const FLAVOR_COLORS: Record<Flavor, string> = { cola: '#c0392b', naranja: '#ff8a3d' };

/** Clave de textura de una capa; un pan que no es la base se dibuja como tapa. */
export function layerKey(layers: readonly Ingredient[], i: number): string {
  const ing = layers[i];
  return ing === 'pan' && i > 0 ? 'ing_pan_top' : `ing_${ing}`;
}

export function layerHeight(key: string): number {
  return LAYERS[key.slice(4) as keyof typeof LAYERS].length;
}

// ---------------------------------------------------------------- generación

function paint(scene: Phaser.Scene, key: string, rows: string[], palette: Palette, width = rows[0].length): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, width, rows.length)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
}

/** Textura dibujada a mano con el contexto 2D. */
function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
}

function rect(c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

const SKIN_COLORS: [string, string][] = [
  ['#f2c09a', '#d99a74'],
  ['#e0a878', '#c0845a'],
  ['#c98e62', '#a86e46'],
  ['#8d5a3b', '#6b4029'],
];
const HAIR_HEX: Record<string, string> = {
  castano: '#5a3a22',
  negro: '#3a2a22',
  rubio: '#e0b04a',
  pelirrojo: '#b5482c',
  gris: '#8a8a96',
  rosa: '#f28ac0',
  azul: '#4fa3e0',
  naranja: '#ff8a3d',
  blanco: '#e8e8ee',
};

/** Escena con la que se pintan los cocineros bajo demanda (hay demasiadas combinaciones para hacerlas todas). */
let painter: Phaser.Scene | null = null;

/**
 * Textura de un cocinero (con un número, el delantal de ese color y el gorro de chef). Se pinta la primera vez
 * que hace falta: delantal, estampado, accesorio, piel, pelo y barba.
 */
export function chefKey(look: ChefLook | number | undefined, dir: 'down' | 'up' | 'side', frame: number): string {
  const l: ChefLook = typeof look === 'number' ? { apron: look, hat: 'gorro' } : (look ?? { apron: 0, hat: 'gorro' });
  const apron = l.apron % CHEF_COLORS.length;
  const hat = HEADWEAR[l.hat] ? l.hat : 'gorro';
  const skin = (l.skin ?? 0) % SKIN_COLORS.length;
  const hair = (l.hair ?? 0) % HAIR_COLORS.length;
  const beard = BEARDS.some((b) => b.id === l.beard) ? l.beard! : 'nada';
  const pattern = PATTERNS.some((p) => p.id === l.pattern) ? l.pattern! : 'liso';
  const key = `chef_${apron}_${hat}_${skin}_${hair}_${beard}_${pattern}_${dir}_${frame}`;
  if (painter && !painter.textures.exists(key)) paintChef(painter, key, { apron, hat, skin, hair, beard, pattern }, dir, frame);
  return key;
}

function paintChef(scene: Phaser.Scene, key: string, l: Required<ChefLook>, dir: 'down' | 'up' | 'side', frame: number): void {
  const gold = l.pattern === 'dorado';
  const [a, A] = gold ? ['#ffd23f', '#e0a800'] : CHEF_COLORS[l.apron];
  const [sk, SK] = SKIN_COLORS[l.skin];
  const pal = {
    ...BASE,
    s: sk,
    S: SK,
    h: HAIR_HEX[HAIR_COLORS[l.hair].id] ?? '#5a3a22',
    a,
    A,
    r: '#e5483a',
    y: '#ffd23f',
    Y: '#e0a800',
    n: '#33333d',
    l: '#5cc46a',
    L: '#37913f',
    f: '#ff6b9d',
    b: '#e8c77a',
    o: '#ff8a3d',
    O: '#d9651c',
    c: '#4fa3e0',
    C: '#2f74b0',
  };
  const head = HEADWEAR[l.hat];
  const body = dir === 'down' ? CHEF_DOWN : dir === 'up' ? CHEF_UP : CHEF_SIDE;
  const legs = dir === 'side' ? LEGS_SIDE[frame] : LEGS_FRONT[frame];
  const rows = face([...head[dir], ...body.slice(CHEF_HAT.length)], l.hat, dir, l.beard);
  // Estampado del delantal (de la fila 10 en adelante: el cuerpo).
  for (let i = 10; i < rows.length; i++) {
    rows[i] = [...rows[i]]
      .map((ch, x) => {
        if (ch !== 'a') return ch;
        if (l.pattern === 'rayas' && i % 2 === 0) return 'A';
        if (l.pattern === 'cuadros' && (x + i) % 2 === 0) return 'A';
        if (l.pattern === 'lunares' && (x + 2 * i) % 4 === 0) return 'w';
        if (gold && (x + i) % 5 === 0) return 'w';
        return ch;
      })
      .join('');
  }
  paint(scene, key, [...rows, ...legs], pal);
}

export function customerKey(look: number): string {
  return `customer_${look % CUSTOMER_LOOKS}_${Math.floor(look / CUSTOMER_LOOKS) % SKINS.length}`;
}

export function tileKey({ kind, x, y, flavor }: Tile): string {
  if (kind === 'floor') return (x + y) % 2 ? 'tile_floor_a' : 'tile_floor_b';
  if (kind === 'outside') return y === 0 ? 'tile_street' : 'tile_outside';
  if (kind === 'drinks') return `tile_drinks_${flavor}`;
  return `tile_${kind}`;
}

/** Textura de un objeto que no es una pila de capas. */
export function itemKey(item: Exclude<Item, { kind: 'food' }>): string {
  switch (item.kind) {
    case 'raw':
      return 'ing_carne_cruda';
    case 'potatoes':
      return 'side_patatas';
    case 'fries':
      return 'side_fritas';
    case 'burnt':
      return item.what === 'carne' ? 'ing_carne_quemada' : 'side_fritas_quemadas';
    case 'drink':
      return `side_vaso_${item.flavor}`;
    case 'restock':
      return 'item_restock';
  }
}

export function drinkKey(flavor: Flavor): string {
  return `side_vaso_${flavor}`;
}

export function generateTextures(scene: Phaser.Scene): void {
  // Cocineros: se pintan bajo demanda (chefKey); aquí, solo los de los cuatro colores de jugador.
  painter = scene;
  for (let apron = 0; apron < 4; apron++) for (const dir of ['down', 'up', 'side'] as const) for (const frame of [0, 1]) chefKey(apron, dir, frame);

  // Clientes: combinaciones de pelo, camiseta y piel.
  for (let look = 0; look < CUSTOMER_LOOKS * SKINS.length; look++) {
    const [t, T] = SHIRTS[look % SHIRTS.length];
    const h = HAIRS[Math.floor(look / SHIRTS.length) % HAIRS.length];
    const [s, S] = SKINS[Math.floor(look / CUSTOMER_LOOKS) % SKINS.length];
    paint(scene, customerKey(look), CUSTOMER, { ...BASE, h, t, T, s, S });
  }

  for (const [name, rows] of Object.entries(LAYERS)) paint(scene, `ing_${name}`, rows, { ...BASE, ...ING }, 12);
  const sidePal = { ...BASE, ...ING, r: '#e5483a', y: '#ffd23f' };
  for (const name of ['patatas', 'fritas', 'fritas_quemadas']) paint(scene, `side_${name}`, SIDES[name], sidePal, 12);
  for (const [flavor, C] of Object.entries(FLAVOR_COLORS)) paint(scene, `side_vaso_${flavor}`, SIDES.vaso, { ...BASE, w: '#ffffff', L: '#ffffff', C }, 12);

  generateTiles(scene);
  generateIcons(scene);
}

function generateTiles(scene: Phaser.Scene): void {
  const T = TILE;
  canvas(scene, 'tile_floor_a', T, T, (c) => {
    rect(c, '#efe1c6', 0, 0, T, T);
    rect(c, '#e2cfae', 0, T - 1, T, 1);
    rect(c, '#e2cfae', T - 1, 0, 1, T);
  });
  canvas(scene, 'tile_floor_b', T, T, (c) => {
    rect(c, '#d9c4a0', 0, 0, T, T);
    rect(c, '#cbb48d', 0, T - 1, T, 1);
    rect(c, '#cbb48d', T - 1, 0, 1, T);
  });
  canvas(scene, 'tile_outside', T, T, (c) => {
    rect(c, '#a8673d', 0, 0, T, T);
    rect(c, '#94572f', 0, 5, T, 1);
    rect(c, '#94572f', 0, 11, T, 1);
    rect(c, '#94572f', 6, 0, 1, 5);
    rect(c, '#94572f', 12, 6, 1, 5);
    rect(c, '#94572f', 3, 12, 1, 4);
  });
  canvas(scene, 'tile_street', T, T, (c) => {
    rect(c, '#8a8f99', 0, 0, T, T);
    rect(c, '#7b808a', 0, 7, T, 1);
    rect(c, '#9aa0aa', 4, 2, 2, 1);
    rect(c, '#9aa0aa', 11, 11, 2, 1);
  });

  const counterBase = (c: CanvasRenderingContext2D, top = '#d8d3cb', front = '#8d8780') => {
    rect(c, '#2b1d14', 0, 0, T, T);
    rect(c, top, 1, 1, T - 2, 10);
    rect(c, '#ffffff', 1, 1, T - 2, 1);
    rect(c, front, 1, 11, T - 2, 4);
    rect(c, '#6d6862', 1, 14, T - 2, 1);
  };
  canvas(scene, 'tile_counter', T, T, (c) => counterBase(c));
  canvas(scene, 'tile_pase', T, T, (c) => {
    counterBase(c, '#f0e3c8', '#c0392b');
    rect(c, '#ffffff', 1, 12, T - 2, 1);
    rect(c, '#e74c3c', 3, 12, 2, 1);
    rect(c, '#e74c3c', 9, 12, 2, 1);
  });
  canvas(scene, 'tile_montaje', T, T, (c) => {
    counterBase(c);
    rect(c, '#2b1d14', 2, 2, 12, 8);
    rect(c, '#e3b07a', 3, 3, 10, 6);
    rect(c, '#c98f55', 3, 8, 10, 1);
  });
  canvas(scene, 'tile_grill', T, T, (c) => {
    rect(c, '#2b1d14', 0, 0, T, T);
    rect(c, '#55555f', 1, 1, T - 2, T - 2);
    rect(c, '#3a3a42', 2, 2, T - 4, 9);
    for (let x = 3; x < 13; x += 2) rect(c, '#6e6e7a', x, 2, 1, 9);
    rect(c, '#ff8a3d', 2, 12, 3, 2);
    rect(c, '#ffc93c', 6, 12, 2, 2);
    rect(c, '#ff8a3d', 10, 12, 3, 2);
  });
  canvas(scene, 'tile_trash', T, T, (c) => {
    rect(c, '#efe1c6', 0, 0, T, T);
    rect(c, '#2b1d14', 2, 2, 12, 13);
    rect(c, '#5b8f5f', 3, 5, 10, 9);
    rect(c, '#7fb583', 3, 3, 10, 2);
    rect(c, '#2b1d14', 6, 1, 4, 2);
    rect(c, '#46704a', 5, 7, 1, 6);
    rect(c, '#46704a', 8, 7, 1, 6);
    rect(c, '#46704a', 11, 7, 1, 6);
  });
  canvas(scene, 'tile_crate', T, T, (c) => {
    rect(c, '#efe1c6', 0, 0, T, T);
    rect(c, '#2b1d14', 0, 1, T, T - 1);
    rect(c, '#b97a45', 1, 2, T - 2, T - 3);
    rect(c, '#8c5529', 1, 6, T - 2, 1);
    rect(c, '#8c5529', 1, 11, T - 2, 1);
    rect(c, '#d69a62', 1, 2, T - 2, 1);
  });
  canvas(scene, 'tile_wall', T, T, (c) => {
    rect(c, '#6b4a35', 0, 0, T, T);
    rect(c, '#57392a', 0, 7, T, 1);
    rect(c, '#57392a', 0, 15, T, 1);
    rect(c, '#57392a', 7, 0, 1, 7);
    rect(c, '#57392a', 3, 8, 1, 7);
    rect(c, '#57392a', 12, 8, 1, 7);
    rect(c, '#7d5940', 0, 0, T, 1);
  });
  // Almacén: puerta con estanterías de cajas.
  canvas(scene, 'tile_almacen', T, T, (c) => {
    rect(c, '#6b4a35', 0, 0, T, T);
    rect(c, '#2b1d14', 1, 1, 14, 15);
    rect(c, '#8c5529', 2, 2, 12, 14);
    rect(c, '#b97a45', 3, 3, 4, 3);
    rect(c, '#b97a45', 9, 3, 4, 3);
    rect(c, '#6b4029', 2, 7, 12, 1);
    rect(c, '#b97a45', 3, 9, 4, 3);
    rect(c, '#d69a62', 9, 9, 4, 3);
    rect(c, '#ffd23f', 12, 13, 2, 2);
  });
  // Ventanilla de los pedidos para llevar: un hueco en la pared con mostrador y un rótulo.
  canvas(scene, 'tile_ventanilla', T, T, (c) => {
    rect(c, '#6b4a35', 0, 0, T, T);
    rect(c, '#2b1d14', 2, 1, 12, 13);
    rect(c, '#1f2a3a', 3, 2, 10, 8);
    rect(c, '#3a4d66', 3, 2, 10, 2);
    rect(c, '#d8d3cb', 2, 10, 12, 3);
    rect(c, '#ffffff', 2, 10, 12, 1);
    rect(c, '#ff8a3d', 5, 14, 6, 2);
  });
  canvas(scene, 'tile_fryer', T, T, (c) => {
    rect(c, '#2b1d14', 0, 0, T, T);
    rect(c, '#a9adb5', 1, 1, T - 2, T - 2);
    rect(c, '#2b1d14', 2, 2, 12, 9);
    rect(c, '#e8b84a', 3, 3, 10, 7);
    rect(c, '#f6d47a', 4, 4, 3, 1);
    rect(c, '#f6d47a', 9, 7, 2, 1);
    rect(c, '#6d6862', 1, 12, T - 2, 1);
    rect(c, '#e5483a', 3, 13, 2, 1);
  });
  for (const [flavor, color] of Object.entries(FLAVOR_COLORS)) {
    canvas(scene, `tile_drinks_${flavor}`, T, T, (c) => {
      rect(c, '#2b1d14', 0, 0, T, T);
      rect(c, '#d8d3cb', 1, 1, T - 2, T - 2);
      rect(c, color, 2, 2, 12, 4);
      rect(c, '#ffffff', 3, 3, 4, 1);
      rect(c, '#55555f', 6, 6, 4, 2);
      rect(c, '#3a3a42', 3, 11, 10, 3);
      rect(c, '#55555f', 4, 12, 8, 1);
    });
  }
}

function generateIcons(scene: Phaser.Scene): void {
  const pal = { ...BASE, y: '#ffd23f', Y: '#e0a800', r: '#e5483a', b: '#ffffff', c: '#4fa3e0' };
  paint(scene, 'icon_coin', ['..kkkk..', '.kyyyyk.', 'kyyYYyyk', 'kyyYyyyk', 'kyyYYyyk', 'kyyyyYyk', '.kyyyyk.', '..kkkk..'], pal);
  paint(scene, 'icon_star', ['...kk...', '..kyyk..', 'kkkyykkk', 'kyyyyyyk', '.kyyyyk.', '.kyyyyk.', 'kyykkyyk', 'kkk..kkk'], pal);
  paint(scene, 'icon_clock', ['..kkkk..', '.kbbbbk.', 'kbbbkbbk', 'kbbbkbbk', 'kbbbkkbk', 'kbbbbbbk', '.kbbbbk.', '..kkkk..'], pal);
  paint(scene, 'icon_burger', ['..kkkk..', '.kyyyyk.', 'kkkkkkkk', 'krrrrrrk', 'kkkkkkkk', '.kyyyyk.', '..kkkk..', '........'], { ...pal, y: '#e8a04a', r: '#7a3e1d' });
  // Altavoz: con música, solo efectos, y en silencio.
  const spk = ['....k....', '...kk....', 'kkkbk....', 'kbbbk....', 'kbbbk....', 'kkkbk....', '...kk....', '....k....'];
  const withRight = (right: string[]) => spk.map((r, i) => r.slice(0, 5) + right[i]);
  paint(scene, 'icon_sound_todo', withRight(['..y.', 'y..y', '.y.y', '.y.y', '.y.y', '.y.y', 'y..y', '..y.']), pal, 9);
  paint(scene, 'icon_sound_efectos', withRight(['....', '.c..', '..c.', '..c.', '..c.', '..c.', '.c..', '....']), pal, 9);
  paint(scene, 'icon_sound_nada', withRight(['....', 'r..r', '.rr.', '.rr.', 'r..r', '....', '....', '....']), pal, 9);
  // Gotita de sudor (clientes impacientes) y destello (servir).
  paint(scene, 'icon_pause', ['kkkkkkkkk', 'kbbbbbbbk', 'kbkkbkkbk', 'kbkkbkkbk', 'kbkkbkkbk', 'kbkkbkkbk', 'kbbbbbbbk', 'kkkkkkkkk'], pal, 9);
  paint(scene, 'icon_chat', ['.kkkkkkk.', 'kbbbbbbbk', 'kbkbkbkbk', 'kbbbbbbbk', '.kkbkkkk.', '..kk.....'], pal, 9);
  // Decoración del restaurante (se ve en la calle y en la cocina cuando se compra).
  const deco = { ...BASE, r: '#e5483a', R: '#ff8a73', y: '#ffd23f', Y: '#e0a800', g: '#5cc46a', G: '#37913f', b: '#8d5a3b', B: '#6b4029', c: '#4fa3e0', p: '#c77de0', n: '#ff4fa3', w: '#f7f4ee', s: '#bdbdbd' };
  paint(scene, 'deco_sombrilla', [
    '.....kkkkkk.....', '...kkrwrwrwkk...', '..krwrwrwrwrwk..', '.kkkkkkkkkkkkkk.', '.......kk.......', '.......kk.......',
    '.......kk.......', '..kkkkkkkkkkkk..', '..kbbbbbbbbbbk..', '..kkkkkkkkkkkk..', '...kk......kk...', '...kk......kk...',
  ], deco);
  paint(scene, 'deco_mesa', [
    '..kkkkkkkkkk..', '.kbbbbbbbbbbk.', '.kkkkkkkkkkkk.', 'k..kk....kk..k', 'kk.kk....kk.kk', 'kk..........kk', 'kk..........kk',
  ], deco);
  paint(scene, 'deco_planta', ['..g.g.g...', '.gGgGgGg..', 'gGgGgGgGg.', '.gGgGgGg..', '..kkkkk...', '..kbbbk...', '..kbbbk...', '...kkk....'], deco);
  paint(scene, 'deco_neon', [
    'kkkkkkkkkkkkkkkkkkkkkkkkkkk',
    'k.........................k',
    'k.nn..n.n.nn..nnn.nnn.nn..k',
    'k.n.n.n.n.n.n.n...n...n.n.k',
    'k.nn..n.n.nn..n.n.nn..nn..k',
    'k.n.n.n.n.n.n.n.n.n...n.n.k',
    'k.nn..nnn.n.n.nnn.nnn.n.n.k',
    'k.........................k',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ], deco);
  paint(scene, 'deco_cuadro', ['kkkkkkkkk', 'kyyyyyyyk', 'kycccccyk', 'kycgggcyk', 'kyggGggyk', 'kyyyyyyyk', 'kkkkkkkkk'], deco);
  paint(scene, 'deco_jukebox', [
    '...kkkkkk...', '..kppppppk..', '.kpyyyyyypk.', '.kpykkkkypk.', '.kpykrrkypk.', '.kpykkkkypk.', '.kpyyyyyypk.',
    '.kppnnnnppk.', '.kppnnnnppk.', '.kpppppppk..', '.kkkkkkkkk..',
  ], deco);
  paint(scene, 'deco_tarro', ['.kkkk.', 'kwwwwk', 'kwyywk', 'kyyyyk', 'kyYyyk', 'kkkkkk'], deco);
  paint(scene, 'deco_nota', ['..kk', '..kk', '..k.', 'kkk.', 'kkk.'], { k: '#ffd23f' });
  paint(scene, 'icon_heart', ['.kk.kk.', 'krrkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'], pal);
  // Bolsa de pedido para llevar, luna (turno de noche) y mancha del suelo.
  paint(scene, 'item_restock', ['kkkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbBbbbbbbBbk', 'kkkkkkkkkkkk', 'kbbbbyybbbbk', 'kbbbbbbbbbbk', 'kkkkkkkkkkkk'], { ...pal, b: '#c8955c', B: '#8c5529', y: '#ffd23f' }, 12);
  paint(scene, 'icon_group', ['.kk..kk..kk.', 'kssk.kssk.kssk'.slice(0, 12), 'kssk.kssk.ks', '.kk..kk..kk.', 'kaak.kaak.ka', 'kaak.kaak.ka'], { ...pal, s: '#f2c09a', a: '#4fa3e0' });
  paint(scene, 'icon_bag', ['..kk..', '.k..k.', 'kkkkkk', 'kbbbbk', 'kbyybk', 'kbbbbk', 'kkkkkk'], { ...pal, b: '#c8955c', y: '#ff8a3d' });
  paint(scene, 'icon_moon', ['..kkk.', '.kyyk.', 'kyyk..', 'kyyk..', 'kyyyk.', '.kyyyk', '..kkk.'], { ...pal, y: '#ffe07a' });
  paint(scene, 'spill', [
    '....cccc....', '..cccccccc..', '.cccCCcccccc', 'ccccCccccccc', 'cccccccccCc.', '.ccccccccc..', '...ccc.cc...', '.......c....',
  ], { c: '#c97b3a', C: '#f0b070' });
  paint(scene, 'icon_sweat', ['.c.', 'ccc', 'cbc', '.c.'], pal);
  paint(scene, 'icon_spark', ['..y..', '..y..', 'yybyy', '..y..', '..y..'], pal);
  paint(scene, 'icon_confetti', ['yy', 'yy'], { y: '#ffffff' });
  paint(scene, 'icon_smoke', ['..gg..', '.gwwg.', 'gwwwwg', '.gwwg.', '..gg..'], BASE);
  // Números de 3x5 para los bocadillos de los clientes.
  DIGITS.forEach((rows, n) => paint(scene, `digit_${n}`, rows, { k: '#2b1d14' }));
  // Y en claro, para los contadores de existencias de la campaña.
  DIGITS.forEach((rows, n) => paint(scene, `digitw_${n}`, rows, { k: '#fff4dc' }));
}

const DIGITS = [
  ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'],
  ['.k.', 'kk.', '.k.', '.k.', 'kkk'],
  ['kkk', '..k', 'kkk', 'k..', 'kkk'],
  ['kkk', '..k', '.kk', '..k', 'kkk'],
  ['k.k', 'k.k', 'kkk', '..k', '..k'],
  ['kkk', 'k..', 'kkk', '..k', 'kkk'],
  ['kkk', 'k..', 'kkk', 'k.k', 'kkk'],
  ['kkk', '..k', '..k', '.k.', '.k.'],
  ['kkk', 'k.k', 'kkk', 'k.k', 'kkk'],
  ['kkk', 'k.k', 'kkk', '..k', 'kkk'],
];
