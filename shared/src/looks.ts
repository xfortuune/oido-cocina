// Personalización del cocinero: color del delantal y un accesorio.
// Los accesorios se desbloquean con el récord (niveles superados) guardado en el navegador.

export type HatId = 'gorro' | 'gorra' | 'panuelo' | 'bigote' | 'gafas' | 'corona' | 'copa' | 'vikingo' | 'dorado';

export interface Hat {
  id: HatId;
  name: string;
  /** Niveles superados (récord) que hacen falta para usarlo; -1: se compra en la tienda del Desafío. */
  unlock: number;
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
];

/** Número de colores de delantal (los dibuja el cliente). */
export const APRONS = 8;

export interface ChefLook {
  apron: number;
  hat: HatId;
}

export const DEFAULT_LOOK: ChefLook = { apron: 0, hat: 'gorro' };

/** Limpia lo que manda un cliente. */
export function cleanLook(look: unknown, fallbackApron = 0): ChefLook {
  const l = (look ?? {}) as Partial<ChefLook>;
  const apron = Math.round(Number(l.apron));
  return {
    apron: Number.isFinite(apron) && apron >= 0 && apron < APRONS ? apron : fallbackApron,
    hat: HATS.some((h) => h.id === l.hat) ? (l.hat as HatId) : 'gorro',
  };
}

/** Gestos rápidos: un bocadillo encima del cocinero. */
export const EMOTES = ['¡Oído!', '¡Ayuda!', '¡Marchando!', '¡Gracias!', '¡Voy!'] as const;
