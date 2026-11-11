import Phaser from 'phaser';

export const COLORS = {
  bg: 0x2b1d14,
  ink: 0x2b1d14,
  panel: 0xfff4dc,
  panelShade: 0xe8d4ae,
  orange: 0xff8a3d,
  green: 0x43b049,
  red: 0xe5483a,
  yellow: 0xffc93c,
  blue: 0x4fa3e0,
};

export const INK = '#2b1d14';
export const FONT = '"Pixelify Sans", monospace';

/** Texto con la fuente pixel, nítido en pantallas de alta densidad. */
export function txt(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${Math.round(size)}px`,
      color: INK,
      ...style,
    })
    .setResolution(Math.min(window.devicePixelRatio || 1, 3));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Panel rectangular de estilo pixel: borde oscuro, esquinas recortadas y sombra. */
export function pixelPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = COLORS.panel,
  px = 3,
): Phaser.GameObjects.Graphics {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  g.fillStyle(0x000000, 0.25).fillRect(x + px, y + px * 2, w, h);
  g.fillStyle(COLORS.ink);
  g.fillRect(x + px, y, w - px * 2, h);
  g.fillRect(x, y + px, w, h - px * 2);
  g.fillStyle(fill);
  g.fillRect(x + px * 2, y + px, w - px * 4, h - px * 2);
  g.fillRect(x + px, y + px * 2, w - px * 2, h - px * 4);
  return g;
}

/** Fondo de baldosas oscuras detrás de todo. */
export function drawBackground(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const { width, height } = scene.scale;
  const g = scene.add.graphics();
  g.fillStyle(0x3a2a1e).fillRect(0, 0, width, height);
  g.fillStyle(0x33251a);
  const s = 32;
  for (let y = 0; y < height; y += s) for (let x = (y / s) % 2 ? s : 0; x < width; x += s * 2) g.fillRect(x, y, s, s);
  return g;
}

/** La escena está creándose o en marcha (no apagada): se puede dibujar en ella. */
export function sceneAlive(scene: Phaser.Scene): boolean {
  const st = scene.sys.settings.status;
  return st >= Phaser.Scenes.CREATING && st < Phaser.Scenes.SHUTDOWN;
}
