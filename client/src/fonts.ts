// Fuente pixel art del juego: Jersey 15. Gruesa, compacta y clara incluso en el móvil.
// Las letras pixel solo se ven nítidas a ciertos tamaños; Jersey aguanta bien cualquier tamaño
// a partir de 14 px, y se pide un poco más grande porque su letra es pequeña para su tamaño.
import '@fontsource/jersey-15/400.css';

export const FONT_FAMILY = 'Jersey 15';
const SCALE = 1.25;
const MIN = 14;

/** Tamaño real de la letra para un tamaño pedido. */
export function fontPx(size: number): number {
  return Math.max(MIN, Math.round(size * SCALE));
}
