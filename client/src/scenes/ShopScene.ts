import Phaser from 'phaser';
import { levelParams, UPGRADES, upgradePrice, type RoomInfo } from '@hora-punta/shared';
import { audio } from '../audio';
import { net } from '../net';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { Button } from '../ui/Button';
import { addSoundToggle } from '../ui/SoundToggle';

/**
 * Tienda entre rondas: mejoras del local pagadas con el dinero de la partida (de todo el equipo).
 * Cualquiera puede comprar; se sigue cuando todos pulsan «Listo».
 */
export class ShopScene extends Phaser.Scene {
  /** Mejora recién comprada, para resaltarla un momento. */
  private flash: string | null = null;

  constructor() {
    super('shop');
  }

  create(): void {
    audio.music('menu');
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'lobby') this.scene.start('lobby');
      else if (info.phase === 'playing') this.scene.start('kitchen');
      else this.build();
    };
    const onBought = (id: string) => {
      audio.sfx('coin');
      this.flash = id;
      this.build();
      this.time.delayedCall(600, () => {
        this.flash = null;
        this.build();
      });
    };
    const onLeft = () => this.scene.start('lobby');
    net.on('room', onRoom);
    net.on('bought', onBought);
    net.on('left', onLeft);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      net.off('room', onRoom);
      net.off('bought', onBought);
      net.off('left', onLeft);
      this.scale.off('resize', this.build, this);
    });
    this.build();
  }

  private build(): void {
    if (!sceneAlive(this)) return;
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const info = net.info;
    const me = net.me;
    if (!info || !me) return;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);

    let y = 14 * s;
    txt(this, W / 2, y, 'Tienda', 32 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    addSoundToggle(this, W - 24, 24, 2);
    y += 42 * s;
    const coinScale = Math.max(2, Math.round(3 * s));
    const money = txt(this, W / 2 + 8, y, `${info.dinero}`, 26 * s, { color: '#ffd23f', stroke: '#2b1d14', strokeThickness: 5 }).setOrigin(0, 0);
    this.add.image(W / 2 - 2, y + money.height / 2, 'icon_coin').setScale(coinScale).setOrigin(1, 0.5);
    y += money.height + 2;
    const lp = levelParams(info.nivel, info.modo);
    txt(this, W / 2, y, `Dinero del equipo · siguiente: nivel ${info.nivel} (objetivo ${lp.goal})`, 13 * s, {
      color: '#fff4dcbb',
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += 22 * s;

    // Mejoras: una columna en el móvil, dos si hay sitio.
    const cols = W >= 720 ? 2 : 1;
    const gap = 8;
    const boxW = Math.min(W - 20, cols === 2 ? 900 : 560);
    const cardW = (boxW - gap * (cols - 1)) / cols;
    const rows = Math.ceil(UPGRADES.length / cols);
    const bottomSpace = 110 * s;
    const cardH = clamp((H - y - bottomSpace) / rows - gap, 46, 80 * s);
    UPGRADES.forEach((u, i) => {
      const cx = W / 2 - boxW / 2 + (i % cols) * (cardW + gap);
      const cy = y + Math.floor(i / cols) * (cardH + gap);
      const owned = info.mejoras.includes(u.id);
      const price = upgradePrice(u, info.modo);
      const afford = info.dinero >= price;
      const g = this.add.graphics();
      pixelPanel(g, cx, cy, cardW, cardH, this.flash === u.id ? 0xfff0a0 : owned ? 0xd9f2d0 : COLORS.panel, 2);
      g.fillStyle(u.color).fillRect(cx + 4, cy + 4, 6, cardH - 8);
      const fs = clamp(cardH / 4.2, 11, 17);
      txt(this, cx + 16, cy + 5, u.name, fs).setOrigin(0, 0);
      const desc = txt(this, cx + 16, cy + 6 + fs * 1.25, u.description, fs * 0.78, { wordWrap: { width: cardW - 100 } });
      desc.setAlpha(0.8);
      if (desc.height > cardH - fs * 1.4 - 8) desc.setScale((cardH - fs * 1.4 - 8) / desc.height);
      const priceLabel = owned ? 'Comprada' : `${price}`;
      const pt = txt(this, cx + cardW - 10, cy + cardH / 2, priceLabel, fs * 1.05, {
        color: owned ? '#2e8a34' : afford ? '#2b1d14' : '#c0392b',
      }).setOrigin(1, 0.5);
      if (!owned) this.add.image(pt.x - pt.width - 4, cy + cardH / 2, 'icon_coin').setScale(2).setOrigin(1, 0.5);
      if (!owned && afford) {
        const zone = this.add.zone(cx + cardW / 2, cy + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => net.buy(u.id));
      } else if (!owned) {
        g.fillStyle(0x000000, 0.12).fillRect(cx + 2, cy + 2, cardW - 4, cardH - 4);
      }
    });
    y += rows * (cardH + gap) + 6;

    // Listo: cuando lo están todos, a la sala.
    const solo = info.modo === 1;
    const readyN = info.members.filter((m) => m.ready).length;
    const waiting = info.members.filter((m) => !m.ready).map((m) => m.name);
    const by = Math.min(H - 44 * s, y + 30 * s);
    const bw = Math.min(boxW / 2 - 6, 220);
    new Button(this, W / 2 - bw / 2 - 6, by, {
      w: bw,
      h: 54 * s,
      color: me.ready ? 0x8a8a8a : COLORS.green,
      label: solo ? 'Seguir' : me.ready ? `Listo (${readyN}/${info.members.length})` : '¡Listo!',
      fontSize: 19 * s,
      onPress: () => net.toggleReady(),
    });
    new Button(this, W / 2 + bw / 2 + 6, by, {
      w: bw,
      h: 54 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 19 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
    if (!solo) {
      const note = me.ready && waiting.length ? `Esperando a: ${waiting.join(', ')}` : 'Cualquiera puede comprar con el dinero del equipo';
      txt(this, W / 2, by + 32 * s, note, 12 * s, { color: '#fff4dc99', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
    }
  }
}
