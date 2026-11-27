// Personalización del cocinero: color del delantal y un accesorio.
// Los accesorios se desbloquean con el récord (niveles superados) guardado en el navegador.

export type HatId =
  | 'gorro'
  | 'gorra'
  | 'panuelo'
  | 'bigote'
  | 'gafas'
  | 'corona'
  | 'copa'
  | 'vikingo'
  | 'dorado'
  | 'laurel'
  | 'flores'
  | 'pamela'
  | 'calabaza'
  | 'lana';

export interface Hat {
  id: HatId;
  name: string;
  /** Niveles superados (récord) que hacen falta para usarlo; -1: se compra en la tienda del Desafío; -2: ver `needs`. */
  unlock: number;
  /** Lo que hace falta si no es por récord ni tienda: «ach:versus» (un logro) o «hat:flores» (pase de temporada). */
  needs?: string;
}

export const HATS: Hat[] = [
  { id: 'gorro', name: 'Gorro de chef', unlock: 0 },
  { id: 'gorra', name: 'Gorra', unlock: 2 },
  { id: 'panuelo', name: 'Pañuelo', unlock: 4 },
  { id: 'bigote', name: 'Bigote', unlock: 6 },
  { id: 'gafas', name: 'Gafas de sol', unlock: 10 },
  { id: 'corona', name: 'Corona', unlock: 20 },
  { id: 'copa', name: 'Sombrero de copa', unlock: -1 },
  { id: 'vikingo', name: 'Casco vikingo', unlock: -1 },
  { id: 'dorado', name: 'Gorro dorado', unlock: -1 },
  { id: 'laurel', name: 'Corona de laurel', unlock: -2, needs: 'ach:versus' },
  { id: 'flores', name: 'Corona de flores', unlock: -2, needs: 'hat:flores' },
  { id: 'pamela', name: 'Pamela de playa', unlock: -2, needs: 'hat:pamela' },
  { id: 'calabaza', name: 'Gorro de calabaza', unlock: -2, needs: 'hat:calabaza' },
  { id: 'lana', name: 'Gorro de lana', unlock: -2, needs: 'hat:lana' },
];

/** Tonos de piel (los colores los pone el cliente). */
export const SKIN_TONES = 4;

/** Colores de pelo: los cinco primeros, para todos; los demás, del pase de temporada («hair:rosa»…). */
export const HAIR_COLORS: { id: string; name: string; needs?: string }[] = [
  { id: 'castano', name: 'Castaño' },
  { id: 'negro', name: 'Negro' },
  { id: 'rubio', name: 'Rubio' },
  { id: 'pelirrojo', name: 'Pelirrojo' },
  { id: 'gris', name: 'Gris' },
  { id: 'rosa', name: 'Rosa', needs: 'hair:rosa' },
  { id: 'azul', name: 'Azul', needs: 'hair:azul' },
  { id: 'naranja', name: 'Naranja', needs: 'hair:naranja' },
  { id: 'blanco', name: 'Blanco', needs: 'hair:blanco' },
];

export const BEARDS: { id: string; name: string }[] = [
  { id: 'nada', name: 'Sin barba' },
  { id: 'barba', name: 'Barba' },
  { id: 'perilla', name: 'Perilla' },
];

/** Estampados del delantal: unos se ganan con logros y el dorado con el pase de temporada. */
export const PATTERNS: { id: string; name: string; needs?: string }[] = [
  { id: 'liso', name: 'Liso' },
  { id: 'rayas', name: 'Rayas', needs: 'ach:cien' },
  { id: 'cuadros', name: 'Cuadros', needs: 'ach:limpio' },
  { id: 'lunares', name: 'Lunares', needs: 'ach:semana' },
  { id: 'dorado', name: 'Dorado', needs: 'pattern:dorado' },
];

/** Número de colores de delantal (los dibuja el cliente). */
export const APRONS = 8;

export interface ChefLook {
  apron: number;
  hat: HatId;
  /** Tono de piel (0-3), color de pelo, barba y estampado del delantal (opcionales: los antiguos no los tienen). */
  skin?: number;
  hair?: number;
  beard?: string;
  pattern?: string;
}

export const DEFAULT_LOOK: ChefLook = { apron: 0, hat: 'gorro' };

/** Limpia lo que manda un cliente. */
export function cleanLook(look: unknown, fallbackApron = 0): ChefLook {
  const l = (look ?? {}) as Partial<ChefLook>;
  const apron = Math.round(Number(l.apron));
  const index = (v: unknown, n: number) => {
    const i = Math.round(Number(v));
    return Number.isFinite(i) && i >= 0 && i < n ? i : 0;
  };
  return {
    apron: Number.isFinite(apron) && apron >= 0 && apron < APRONS ? apron : fallbackApron,
    hat: HATS.some((h) => h.id === l.hat) ? (l.hat as HatId) : 'gorro',
    skin: index(l.skin, SKIN_TONES),
    hair: index(l.hair, HAIR_COLORS.length),
    beard: BEARDS.some((b) => b.id === l.beard) ? l.beard : 'nada',
    pattern: PATTERNS.some((p) => p.id === l.pattern) ? l.pattern : 'liso',
  };
}

/** Gestos rápidos: un bocadillo encima del cocinero. */
export const EMOTES = ['¡Oído!', '¡Ayuda!', '¡Marchando!', '¡Gracias!', '¡Voy!'] as const;
