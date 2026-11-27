import Phaser from 'phaser';
import { ACHIEVEMENTS, BEARDS, HAIR_COLORS, HATS, PATTERNS, SKIN_TONES, type ChefLook, type Hat } from '@hora-punta/shared';
import { audio } from '../audio';
import { net, ownedHats, saveLook, savedLook, savedRecord } from '../net';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { Button } from '../ui/Button';

type Tab = 'delantal' | 'cara' | 'accesorio';
const TABS: [Tab, string][] = [
  ['delantal', 'Delantal'],
  ['cara', 'Cara y pelo'],
  ['accesorio', 'Accesorio'],
];

/** Lo que pide una opción para usarla: un logro («ach:cien») o algo del pase de temporada («hat:flores»). */
function owns(need?: string): boolean {
  if (!need) return true;
  const p = net.profile;
  if (need.startsWith('ach:')) return !!p?.achievements[need.slice(4)];
  return !!p?.unlocked?.includes(need);
}

function needLabel(need: string): string {
  if (need.startsWith('ach:')) return `Logro «${ACHIEVEMENTS.find((a) => a.id === need.slice(4))?.name ?? need}»`;
  return 'Pase de temporada';
}

/** Tu cocinero: delantal (color y estampado), cara (piel, pelo y barba) y accesorio. */
export class LookScene extends Phaser.Scene {
  private look!: ChefLook;
  private tab: Tab = 'delantal';
  /** Aviso de por qué no se puede elegir algo. */
  private note = '';

  constructor() {
    super('look');
  }

  create(): void {
    audio.music('menu');
    this.look = savedLook();
    this.note = '';
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
    this.build();
  }

  private set(look: ChefLook): void {
    this.look = look;
    this.note = '';
    saveLook(look);
    this.build();
  }

  private locked(text: string): void {
    audio.sfx('denied');
    this.note = text;
    this.build();
  }

  private hatUnlocked(hat: Hat): boolean {
    if (hat.unlock >= 0) return savedRecord() >= hat.unlock;
    if (hat.unlock === -1) return ownedHats().includes(hat.id);
    return owns(hat.needs);
  }

  private build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    this.time.removeAllEvents();
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const boxW = Math.min(W - 24, 520);
    const x0 = W / 2 - boxW / 2;

    let y = 12 * s;
    txt(this, W / 2, y, 'Tu cocinero', 30 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 40 * s;

    // Vista previa grande, girando
    const px = Math.max(4, Math.round(6 * s));
    const previewY = y + 17 * px;
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
    y = previewY + 10 * s;

    // Pestañas
    const tw = (boxW - 12) / 3;
    TABS.forEach(([id, label], n) => {
      new Button(this, x0 + tw / 2 + n * (tw + 6), y + 17 * s, {
        w: tw,
        h: 34 * s,
        color: this.tab === id ? COLORS.orange : 0x6b5a4a,
        label,
        fontSize: 15 * s,
        onPress: () => {
          this.tab = id;
          this.note = '';
          this.build();
        },
      });
    });
    y += 46 * s;

    if (this.tab === 'delantal') y = this.tabApron(x0, y, boxW, s);
    else if (this.tab === 'cara') y = this.tabFace(x0, y, boxW, s);
    else y = this.tabHats(x0, y, boxW, s);

    if (this.note) {
      txt(this, W / 2, y, this.note, 13 * s, { color: '#ffc93c', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
      y += 22 * s;
    }
    new Button(this, W / 2, Math.min(H - 34 * s, y + 30 * s), {
      w: Math.min(220, boxW),
      h: 50 * s,
      color: COLORS.green,
      label: 'Listo',
      fontSize: 19 * s,
      onPress: () => this.scene.start('menu'),
    });
  }

  /** Fila de muestras de color (delantal, piel, pelo). */
  private swatches(colors: [string, string, boolean][], selected: number, y: number, boxW: number, s: number, onPick: (i: number) => void): number {
    const { width: W } = this.scale;
    const n = colors.length;
    const sw = Math.min(44 * s, (boxW - 8 * (n - 1)) / n);
    colors.forEach(([light, dark, open], i) => {
      const x = W / 2 + (i - (n - 1) / 2) * (sw + 8);
      const g = this.add.graphics();
      g.fillStyle(i === selected ? 0xffffff : 0x2b1d14).fillRect(x - sw / 2 - 3, y - 3, sw + 6, sw + 6);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(light).color).fillRect(x - sw / 2, y, sw, sw);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(dark).color).fillRect(x - sw / 2, y + sw * 0.7, sw, sw * 0.3);
      if (!open) {
        g.fillStyle(0x000000, 0.55).fillRect(x - sw / 2, y, sw, sw);
        txt(this, x, y + sw / 2, '?', sw * 0.5, { color: '#fff4dc' }).setOrigin(0.5);
      }
      const zone = this.add.zone(x, y + sw / 2, sw + 6, sw + 6).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => onPick(i));
    });
    return y + sw + 14 * s;
  }

  /** Fila de botones de texto (estampado, barba). */
  private options(list: { id: string; name: string; needs?: string }[], current: string, y: number, x0: number, boxW: number, s: number, onPick: (id: string) => void): number {
    const per = Math.min(list.length, 3);
    const bw = (boxW - 8 * (per - 1)) / per;
    const bh = 36 * s;
    list.forEach((o, i) => {
      const open = owns(o.needs);
      const col = i % per;
      const row = Math.floor(i / per);
      new Button(this, x0 + bw / 2 + col * (bw + 8), y + bh / 2 + row * (bh + 8), {
        w: bw,
        h: bh,
        color: o.id === current ? COLORS.orange : open ? 0x8d6e63 : 0x4a3e34,
        textColor: open ? '#ffffff' : '#9a8a7a',
        label: open ? o.name : `${o.name} (bloq.)`,
        fontSize: 14 * s,
        onPress: () => (open ? onPick(o.id) : this.locked(`${o.name}: ${needLabel(o.needs!)}`)),
      });
    });
    return y + Math.ceil(list.length / per) * (bh + 8) + 6 * s;
  }

  private label(text: string, y: number, s: number): number {
    txt(this, this.scale.width / 2, y, text, 16 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);
    return y + 24 * s;
  }

  private tabApron(x0: number, y: number, boxW: number, s: number): number {
    y = this.label('Color', y, s);
    y = this.swatches(
      CHEF_COLORS.map(([l, d]) => [l, d, true]),
      this.look.apron,
      y,
      boxW,
      s,
      (apron) => {
        audio.sfx('click');
        this.set({ ...this.look, apron });
      },
    );
    y = this.label('Estampado', y, s);
    return this.options(PATTERNS, this.look.pattern ?? 'liso', y, x0, boxW, s, (pattern) => {
      audio.sfx('click');
      this.set({ ...this.look, pattern });
    });
  }

  private tabFace(x0: number, y: number, boxW: number, s: number): number {
    const SKINS: [string, string][] = [
      ['#f2c09a', '#d99a74'],
      ['#e0a878', '#c0845a'],
      ['#c98e62', '#a86e46'],
      ['#8d5a3b', '#6b4029'],
    ];
    y = this.label('Piel', y, s);
    y = this.swatches(
      SKINS.slice(0, SKIN_TONES).map(([l, d]) => [l, d, true]),
      this.look.skin ?? 0,
      y,
      boxW,
      s,
      (skin) => {
        audio.sfx('click');
        this.set({ ...this.look, skin });
      },
    );
    const HEX: Record<string, string> = {
      castano: '#5a3a22',
      negro: '#3a2a22',
      rubio: '#e0b04a',
      pelirrojo: '#b5482c',
      gris: '#8a8a96',
      rosa: '#f28ac0',
      azul: '#4fa3e0',
      naranja: '#ff8a3d',
      blanco: '#e8e8ee',
    };
    y = this.label('Pelo', y, s);
    y = this.swatches(
      HAIR_COLORS.map((h) => [HEX[h.id], HEX[h.id], owns(h.needs)]),
      this.look.hair ?? 0,
      y,
      boxW,
      s,
      (hair) => {
        const h = HAIR_COLORS[hair];
        if (!owns(h.needs)) return this.locked(`Pelo ${h.name.toLowerCase()}: ${needLabel(h.needs!)}`);
        audio.sfx('click');
        this.set({ ...this.look, hair });
      },
    );
    y = this.label('Barba', y, s);
    return this.options(BEARDS, this.look.beard ?? 'nada', y, x0, boxW, s, (beard) => {
      audio.sfx('click');
      this.set({ ...this.look, beard });
    });
  }

  private tabHats(x0: number, y: number, boxW: number, s: number): number {
    const { height: H } = this.scale;
    const cols = boxW >= 460 ? 5 : 4;
    const gap = 6;
    const cardW = (boxW - gap * (cols - 1)) / cols;
    const rows = Math.ceil(HATS.length / cols);
    const cardH = clamp((H - y - 110 * s) / rows - gap, 44, 68 * s);
    HATS.forEach((hat, n) => {
      const cx = x0 + (n % cols) * (cardW + gap);
      const cy = y + Math.floor(n / cols) * (cardH + gap);
      const unlocked = this.hatUnlocked(hat);
      const selected = this.look.hat === hat.id;
      const g = this.add.graphics();
      pixelPanel(g, cx, cy, cardW, cardH, selected ? 0xffe2b8 : unlocked ? COLORS.panel : 0x9a8a7a, 2);
      const icon = this.add
        .image(cx + cardW / 2, cy + cardH * 0.66, chefKey({ ...this.look, hat: hat.id }, 'down', 0))
        .setScale(Math.max(1, Math.floor((cardH * 0.6) / 16)))
        .setOrigin(0.5, 1);
      if (!unlocked) icon.setTint(0x333333);
      const name = txt(this, cx + cardW / 2, cy + cardH - 3, hat.name, 10 * s, { color: unlocked ? '#2b1d14' : '#fff4dc' }).setOrigin(0.5, 1);
      if (name.width > cardW - 6) name.setScale((cardW - 6) / name.width);
      const zone = this.add.zone(cx + cardW / 2, cy + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (!unlocked) {
          const why = hat.unlock >= 0 ? `supera el nivel ${hat.unlock} del Desafío` : hat.unlock === -1 ? 'se compra en la tienda del Desafío' : needLabel(hat.needs!);
          this.locked(`${hat.name}: ${why}`);
          return;
        }
        audio.sfx('perk');
        this.set({ ...this.look, hat: hat.id });
      });
    });
    return y + rows * (cardH + gap) + 6 * s;
  }
}
