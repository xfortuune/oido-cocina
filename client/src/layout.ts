import { clamp } from './theme';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScreenLayout {
  W: number;
  H: number;
  portrait: boolean;
  topBar: Rect;
  tickets: Rect;
  kitchen: Rect;
  /** Zona del joystick y el botón de acción (null en escritorio sin pantalla táctil). */
  controls: Rect | null;
}

/** Reparto de la pantalla entre barra superior, comandas, cocina y controles táctiles. */
export function computeLayout(W: number, H: number, touch: boolean): ScreenLayout {
  const portrait = H > W * 1.05;
  const pad = 6;
  const topBar: Rect = { x: 0, y: 0, w: W, h: Math.round(clamp(H * 0.055, 32, 44)) };
  const ticketsH = Math.round(portrait ? clamp(H * 0.14, 100, 124) : clamp(H * 0.16, 80, 112));
  const tickets: Rect = { x: pad, y: topBar.h + pad, w: W - pad * 2, h: ticketsH };
  const kitchenTop = tickets.y + tickets.h + pad;

  let controls: Rect | null = null;
  let kitchenBottom = H - pad;
  if (portrait) {
    // En vertical los controles van debajo de la cocina, sin taparla.
    const h = Math.round(clamp(H * 0.24, 150, 230));
    controls = { x: 0, y: H - h, w: W, h };
    kitchenBottom = controls.y - pad;
  } else if (touch) {
    // En horizontal se superponen en las esquinas inferiores.
    const h = Math.round(clamp(H * 0.42, 140, 220));
    controls = { x: 0, y: H - h, w: W, h };
  } else {
    // Hueco para la línea de ayuda del teclado.
    kitchenBottom = H - 24;
  }
  const kitchen: Rect = { x: pad, y: kitchenTop, w: W - pad * 2, h: kitchenBottom - kitchenTop };
  return { W, H, portrait, topBar, tickets, kitchen, controls };
}

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
