import Phaser from 'phaser';
import { audio } from '../audio';
import { pad, padEvents, pollPad, type PadButton } from '../gamepad';
import { net } from '../net';
import { COLORS, pixelPanel, txt } from '../theme';
import { Button } from '../ui/Button';

type Toast = { title: string; text: string; color: number };

/**
 * Siempre encima de todo: avisos de logros y del mando, y la navegación de los menús con el mando
 * (un recuadro marca el botón elegido; A lo pulsa).
 */
export class OverlayScene extends Phaser.Scene {
  private queue: Toast[] = [];
  private showing = false;
  private focus: Button | null = null;
  private lastPos = { x: 0, y: 0 };
  private ring!: Phaser.GameObjects.Graphics;
  /** El recuadro solo se ve si se ha usado el mando hace poco. */
  private padActive = false;

  constructor() {
    super({ key: 'overlay', active: true });
  }

  create(): void {
    this.ring = this.add.graphics().setDepth(10);
    net.on('logro', (list: { name: string; description: string }[]) => {
      for (const a of list) this.toast({ title: `¡Logro! ${a.name}`, text: a.description, color: 0xffd23f });
    });
    padEvents.on('connected', () =>
      this.toast({ title: 'Mando conectado', text: 'Stick o cruceta: moverse · A: coger · X/Y: gestos · Start: pausa', color: 0x4fa3e0 }),
    );
    padEvents.on('down', (b: PadButton) => this.onPad(b));
    this.input.on('pointerdown', () => (this.padActive = false));
  }

  update(): void {
    pollPad();
    this.drawRing();
  }

  toast(t: Toast): void {
    this.queue.push(t);
    if (!this.showing) this.next();
  }

  private next(): void {
    const t = this.queue.shift();
    if (!t) {
      this.showing = false;
      return;
    }
    this.showing = true;
    this.scene.bringToTop();
    if (t.title.startsWith('¡Logro')) audio.sfx('levelUp');
    const W = this.scale.width;
    const w = Math.min(W - 20, 420);
    const c = this.add.container(W / 2, -70).setDepth(20);
    const title = txt(this, 0, 10, t.title, 18, { color: '#2b1d14' }).setOrigin(0.5, 0);
    const text = txt(this, 0, 10 + title.height, t.text, 13, { color: '#6b5a4a', align: 'center', wordWrap: { width: w - 24 } }).setOrigin(0.5, 0);
    const h = 20 + title.height + text.height;
    const g = this.add.graphics();
    pixelPanel(g, -w / 2, 0, w, h, COLORS.panel);
    g.fillStyle(t.color).fillRect(-w / 2 + 4, 4, 6, h - 8);
    c.add([g, title, text]);
    this.tweens.add({
      targets: c,
      y: 8,
      duration: 260,
      ease: 'Back.Out',
      hold: 3200,
      yoyo: true,
      onComplete: () => {
        c.destroy();
        this.next();
      },
    });
  }

  // ---------------------------------------------------------------- menús con el mando

  /** La escena de más arriba con botones (no la cocina mientras se juega: ahí el mando mueve al cocinero). */
  private targetScene(): Phaser.Scene | null {
    const scenes = this.scene.manager.getScenes(true, true) as Phaser.Scene[];
    const playing = scenes.some((s) => s.scene.key === 'kitchen');
    if (playing && !net.paused) return null;
    for (const s of scenes) {
      if (s === this) continue;
      if (this.buttons(s).length) return s;
    }
    return null;
  }

  private buttons(s: Phaser.Scene): Button[] {
    return s.children.list.filter((o): o is Button => o instanceof Button && o.active && o.visible && !!o.input?.enabled);
  }

  private onPad(b: PadButton): void {
    const scene = this.targetScene();
    if (!scene) return;
    this.padActive = true;
    const list = this.buttons(scene);
    if (!this.focus || !this.focus.active || !list.includes(this.focus)) {
      // El más cercano a donde estaba el recuadro (o el primero).
      this.focus = [...list].sort((p, q) => dist(p, this.lastPos) - dist(q, this.lastPos))[0] ?? null;
      if (b !== 'a') return;
    }
    if (!this.focus) return;
    if (b === 'a') {
      this.focus.press();
      return;
    }
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[b as 'up'];
    if (!d) return;
    const from = this.focus;
    let best: Button | null = null;
    let bestScore = Infinity;
    for (const o of list) {
      if (o === from) continue;
      const vx = o.x - from.x;
      const vy = o.y - from.y;
      const along = vx * d[0] + vy * d[1];
      if (along <= 4) continue;
      const across = Math.abs(vx * d[1] - vy * d[0]);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    if (best) {
      this.focus = best;
      audio.sfx('click');
    }
  }

  private drawRing(): void {
    const g = this.ring.clear();
    const f = this.focus;
    if (!this.padActive || !pad.connected || !f || !f.active || !this.targetScene()) return;
    this.lastPos = { x: f.x, y: f.y };
    const m = f.getWorldTransformMatrix();
    const w = f.width * m.scaleX;
    const h = f.height * m.scaleY;
    g.lineStyle(3, 0xffd23f, 1).strokeRect(m.tx - w / 2 - 4, m.ty - h / 2 - 4, w + 8, h + 8);
  }
}

function dist(b: Button, p: { x: number; y: number }): number {
  return Math.hypot(b.x - p.x, b.y - p.y);
}
