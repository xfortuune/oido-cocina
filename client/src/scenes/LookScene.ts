import Phaser from 'phaser';
import { HATS, type ChefLook } from '@hora-punta/shared';
import { audio } from '../audio';
import { saveLook, savedLook, savedRecord } from '../net';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { Button } from '../ui/Button';

/** Tu cocinero: color del delantal y accesorio (los accesorios se ganan con el récord). */
export class LookScene extends Phaser.Scene {
  private look!: ChefLook;

  constructor() {
    super('look');
  }

  create(): void {
    audio.music('menu');
    this.look = savedLook();
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
    this.build();
  }

  private set(look: ChefLook): void {
    this.look = look;
    saveLook(look);
    this.build();
  }

  private build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const boxW = Math.min(W - 24, 520);
    const record = savedRecord();

    let y = 14 * s;
    txt(this, W / 2, y, 'Tu cocinero', 32 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 46 * s;

    // Vista previa grande, girando
    const px = Math.max(4, Math.round(7 * s));
    const previewY = y + 18 * px;
    const chef = this.add.image(W / 2, previewY, chefKey(this.look, 'down', 0)).setScale(px).setOrigin(0.5, 1);
    const views: ['down' | 'side' | 'up', boolean][] = [['down', false], ['side', false], ['up', false], ['side', true]];
    let i = 0;
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        i = (i + 1) % views.length;
        const [dir, flip] = views[i];
        chef.setTexture(chefKey(this.look, dir, 0)).setFlipX(flip);
      },
    });
    y = previewY + 14 * s;

    // Delantal
    txt(this, W / 2, y, 'Delantal', 17 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);
    y += 26 * s;
    const sw = Math.min(46 * s, (boxW - 7 * 8) / 8);
    CHEF_COLORS.forEach(([light, dark], apron) => {
      const x = W / 2 + (apron - 3.5) * (sw + 8);
      const g = this.add.graphics();
      const selected = apron === this.look.apron;
      g.fillStyle(selected ? 0xffffff : 0x2b1d14).fillRect(x - sw / 2 - 3, y - 3, sw + 6, sw + 6);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(light).color).fillRect(x - sw / 2, y, sw, sw);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(dark).color).fillRect(x - sw / 2, y + sw * 0.7, sw, sw * 0.3);
      const zone = this.add.zone(x, y + sw / 2, sw + 6, sw + 6).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        audio.sfx('click');
        this.set({ ...this.look, apron });
      });
    });
    y += sw + 20 * s;

    // Accesorios
    txt(this, W / 2, y, 'Accesorio', 17 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);
    y += 26 * s;
    const cols = 3;
    const gap = 8;
    const cardW = (boxW - gap * (cols - 1)) / cols;
    const cardH = 74 * s;
    HATS.forEach((hat, n) => {
      const cx = W / 2 - boxW / 2 + (n % cols) * (cardW + gap);
      const cy = y + Math.floor(n / cols) * (cardH + gap);
      const unlocked = record >= hat.unlock;
      const selected = this.look.hat === hat.id;
      const g = this.add.graphics();
      pixelPanel(g, cx, cy, cardW, cardH, selected ? 0xffe2b8 : unlocked ? COLORS.panel : 0x9a8a7a, 2);
      const icon = this.add
        .image(cx + cardW / 2, cy + cardH * 0.62, chefKey({ apron: this.look.apron, hat: hat.id }, 'down', 0))
        .setScale(Math.max(2, Math.round(2.4 * s)))
        .setOrigin(0.5, 1);
      if (!unlocked) icon.setTint(0x333333);
      txt(this, cx + cardW / 2, cy + cardH - 5, unlocked ? hat.name : `Nivel ${hat.unlock}`, 12 * s, {
        color: unlocked ? '#2b1d14' : '#fff4dc',
      }).setOrigin(0.5, 1);
      if (unlocked) {
        const zone = this.add.zone(cx + cardW / 2, cy + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          audio.sfx('perk');
          this.set({ ...this.look, hat: hat.id });
        });
      }
    });
    y += Math.ceil(HATS.length / cols) * (cardH + gap) + 4;
    txt(this, W / 2, y, `Los accesorios se ganan con tu récord (ahora: nivel ${record} superado)`, 12 * s, {
      color: '#fff4dcaa',
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += 26 * s;

    new Button(this, W / 2, Math.min(H - 36 * s, y + 28 * s), {
      w: Math.min(220, boxW),
      h: 52 * s,
      color: COLORS.green,
      label: 'Listo',
      fontSize: 19 * s,
      onPress: () => this.scene.start('menu'),
    });
  }
}
