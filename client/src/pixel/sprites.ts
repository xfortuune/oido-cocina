// Pixel art de ¡Oído, Cocina!, generado en tiempo de carga a partir de mapas de caracteres.
// Así no hace falta cargar imágenes (y en Discord no hay que mapear más URLs).
import Phaser from 'phaser';
import { HATS, type ChefLook, type Flavor, type HatId, type Ingredient, type Item, type Tile } from '@hora-punta/shared';

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
  const same = (rows: string[]) => ({ down: rows, up: rows, side: rows });
  return {
    gorro: same(CHEF_HAT),
    bigote: same(CHEF_HAT),
    gafas: same(CHEF_HAT),
    gorra: { down: cap('...kAAAAAAAAk...'), up: cap('....kAAAAAAk....'), side: cap('....kAAAAAAkkk..') },
    panuelo: { ...same(bandana), side: ['................', '................', '................', '.....kkkkkk.....', '...rkrrwrrrk....', '..r.krrrrwrk....'] },
    corona: same(crown),
  };
})();

/** Cambios en la cara (filas 6-9 de la cara) para bigote y gafas. */
function face(rows: string[], hat: HatId, dir: 'down' | 'up' | 'side'): string[] {
  const out = [...rows];
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

/** Textura de un cocinero: con un número, el delantal de ese color y el gorro de chef. */
export function chefKey(look: ChefLook | number | undefined, dir: 'down' | 'up' | 'side', frame: number): string {
  const l = typeof look === 'number' ? { apron: look, hat: 'gorro' } : (look ?? { apron: 0, hat: 'gorro' });
  return `chef_${l.apron % CHEF_COLORS.length}_${l.hat}_${dir}_${frame}`;
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
  }
}

export function drinkKey(flavor: Flavor): string {
  return `side_vaso_${flavor}`;
}

export function generateTextures(scene: Phaser.Scene): void {
  // Cocineros: 8 delantales x 6 accesorios x 3 direcciones x 2 pasos.
  CHEF_COLORS.forEach(([a, A], apron) => {
    const pal = { ...BASE, h: '#5a3a22', a, A, r: '#e5483a', y: '#ffd23f', Y: '#e0a800' };
    for (const { id: hat } of HATS) {
      const head = HEADWEAR[hat];
      const look = { apron, hat };
      for (const frame of [0, 1]) {
        const body = (dir: 'down' | 'up' | 'side', rows: string[], legs: string[]) =>
          paint(scene, chefKey(look, dir, frame), face([...head[dir], ...rows.slice(CHEF_HAT.length), ...legs], hat, dir), pal);
        body('down', CHEF_DOWN, LEGS_FRONT[frame]);
        body('up', CHEF_UP, LEGS_FRONT[frame]);
        body('side', CHEF_SIDE, LEGS_SIDE[frame]);
      }
    }
  });

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
  paint(scene, 'icon_chat', ['.kkkkkkk.', 'kbbbbbbbk', 'kbkbkbkbk', 'kbbbbbbbk', '.kkbkkkk.', '..kk.....'], pal, 9);
  paint(scene, 'icon_sweat', ['.c.', 'ccc', 'cbc', '.c.'], pal);
  paint(scene, 'icon_spark', ['..y..', '..y..', 'yybyy', '..y..', '..y..'], pal);
  paint(scene, 'icon_confetti', ['yy', 'yy'], { y: '#ffffff' });
  paint(scene, 'icon_smoke', ['..gg..', '.gwwg.', 'gwwwwg', '.gwwg.', '..gg..'], BASE);
  // Números de 3x5 para los bocadillos de los clientes.
  DIGITS.forEach((rows, n) => paint(scene, `digit_${n}`, rows, { k: '#2b1d14' }));
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
