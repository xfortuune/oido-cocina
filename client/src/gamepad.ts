// Mando (Gamepad API del navegador): se lee una vez por fotograma desde la escena de encima (OverlayScene).
// - En la cocina: stick izquierdo o cruceta para moverse, A coger/dejar, X e Y gestos, Start pausa.
// - En los menús: cruceta o stick para elegir botón y A para pulsarlo.
import Phaser from 'phaser';

export type PadButton = 'a' | 'b' | 'x' | 'y' | 'start' | 'up' | 'down' | 'left' | 'right';

/** Botones del mapeo estándar. */
const MAP: Record<number, PadButton> = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

/** Estado del mando: dirección (-1..1) y si hay alguno conectado. */
export const pad = { x: 0, y: 0, connected: false };

/** Emite 'down' (PadButton) al pulsar un botón; el stick también emite up/down/left/right al inclinarlo. */
export const padEvents = new Phaser.Events.EventEmitter();

const prev = new Map<number, boolean>();
let stickDir: PadButton | null = null;

export function pollPad(): void {
  const list = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const g = [...list].find((p): p is Gamepad => !!p && p.connected);
  if (!g) {
    if (pad.connected) padEvents.emit('disconnected');
    pad.connected = false;
    pad.x = pad.y = 0;
    return;
  }
  if (!pad.connected) padEvents.emit('connected', g.id);
  pad.connected = true;
  const held = (i: number) => !!g.buttons[i]?.pressed;
  let x = g.axes[0] ?? 0;
  let y = g.axes[1] ?? 0;
  if (Math.hypot(x, y) < 0.3) x = y = 0;
  const dx = (held(15) ? 1 : 0) - (held(14) ? 1 : 0);
  const dy = (held(13) ? 1 : 0) - (held(12) ? 1 : 0);
  if (dx || dy) {
    x = dx;
    y = dy;
  }
  pad.x = x;
  pad.y = y;
  for (const [i, name] of Object.entries(MAP)) {
    const n = Number(i);
    const now = held(n);
    if (now && !prev.get(n)) padEvents.emit('down', name);
    prev.set(n, now);
  }
  // El stick como cruceta para los menús (un paso por inclinación).
  const ax = g.axes[0] ?? 0;
  const ay = g.axes[1] ?? 0;
  const dir: PadButton | null =
    Math.abs(ax) > 0.6 || Math.abs(ay) > 0.6 ? (Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up') : null;
  if (dir && dir !== stickDir) padEvents.emit('down', dir);
  stickDir = dir;
}
