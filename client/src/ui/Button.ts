import Phaser from 'phaser';
import { COLORS, txt } from '../theme';

export interface ButtonOptions {
  w: number;
  h: number;
  color: number;
  label: string;
  fontSize?: number;
  textColor?: string;
  onPress: () => void;
}

/** Botón pixel con sombra, que reacciona al tocar (pointerdown) para ir rápido en móvil. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly opts: ButtonOptions) {
    super(scene, Math.round(x), Math.round(y));
    const { w, h } = opts;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.label = txt(scene, 0, -2, opts.label, opts.fontSize ?? Math.min(h * 0.42, 28), {
      color: opts.textColor ?? '#ffffff',
      stroke: '#2b1d14',
      strokeThickness: 4,
    }).setOrigin(0.5);
    if (this.label.width > w - 12) this.label.setScale((w - 12) / this.label.width);
    this.add(this.label);
    this.drawBg(false);

    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.press());
    this.on('pointerup', () => this.drawBg(false));
    this.on('pointerout', () => this.drawBg(false));
    scene.add.existing(this);
  }

  /** También se usa desde los atajos de teclado. */
  press(): void {
    this.drawBg(true);
    this.scene.time.delayedCall(100, () => this.active && this.drawBg(false));
    this.opts.onPress();
  }

  private drawBg(down: boolean): void {
    const { w, h, color } = this.opts;
    const shade = Phaser.Display.Color.ValueToColor(color).darken(22).color;
    const light = Phaser.Display.Color.ValueToColor(color).lighten(18).color;
    const px = 3;
    const depth = down ? 1 : 5;
    const x = -Math.round(w / 2);
    const y = -Math.round(h / 2) + (5 - depth);
    const fh = h - 5;
    const g = this.bg.clear();
    // Contorno con esquinas recortadas
    g.fillStyle(COLORS.ink);
    g.fillRect(x + px, y, w - px * 2, fh + depth);
    g.fillRect(x, y + px, w, fh + depth - px * 2);
    // Canto inferior (relieve)
    g.fillStyle(shade).fillRect(x + px, y + px, w - px * 2, fh + depth - px * 2);
    // Cara
    g.fillStyle(color).fillRect(x + px, y + px, w - px * 2, fh - px * 2);
    g.fillStyle(light).fillRect(x + px * 2, y + px, w - px * 4, px);
    this.label.y = y + fh / 2 - 1;
  }
}
