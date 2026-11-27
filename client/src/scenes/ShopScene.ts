import Phaser from 'phaser';
import {
  getUpgrade,
  levelParams,
  UPGRADES,
  upgradePrice,
  wagesPerRound,
  type RoomInfo,
  type ShopKind,
  type Upgrade,
} from '@hora-punta/shared';
import { audio } from '../audio';
import { net, ownedHats } from '../net';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { Button } from '../ui/Button';
import { addSoundToggle } from '../ui/SoundToggle';

/** Secciones de la tienda (la sorpresa y la ropa van juntas). */
type Section = 'mejora' | 'reforma' | 'empleado' | 'consumible' | 'extra';
const SECTIONS: [Section, string][] = [
  ['mejora', 'Mejoras'],
  ['reforma', 'Reformas'],
  ['empleado', 'Empleados'],
  ['consumible', 'Próxima ronda'],
  ['extra', 'Sorpresa y ropa'],
];
const SECTION_KINDS: Record<Section, ShopKind[]> = {
  mejora: ['mejora'],
  reforma: ['reforma'],
  empleado: ['empleado'],
  consumible: ['consumible'],
  extra: ['sorpresa', 'ropa'],
};

/**
 * Tienda del Desafío entre rondas: mejoras, reformas que agrandan la cocina, empleados, consumibles para la
 * ronda siguiente, la caja sorpresa y ropa especial para siempre. Cualquiera puede comprar con el dinero
 * del equipo; se sigue cuando todos pulsan «Listo».
 */
export class ShopScene extends Phaser.Scene {
  /** Compra recién hecha, para resaltarla un momento. */
  private flash: string | null = null;
  private section: Section = 'mejora';
  /** Lo último que ha salido de la caja sorpresa. */
  private surprise = '';

  constructor() {
    super('shop');
  }

  create(): void {
    audio.music('menu');
    this.surprise = '';
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
    const onSurprise = (text: string) => {
      this.surprise = text;
      audio.sfx(/podrid|Nada|nota|pepinillo|catálogo/i.test(text) ? 'denied' : 'perk');
      this.build();
    };
    const onUnlock = (hat: string) => {
      audio.sfx('levelUp');
      this.surprise = `¡Nuevo gorro en tu armario! Póntelo en «Tu cocinero» (${hat}).`;
      this.build();
    };
    const onLeft = () => this.scene.start('lobby');
    net.on('room', onRoom);
    net.on('bought', onBought);
    net.on('sorpresa', onSurprise);
    net.on('unlock', onUnlock);
    net.on('left', onLeft);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      net.off('room', onRoom);
      net.off('bought', onBought);
      net.off('sorpresa', onSurprise);
      net.off('unlock', onUnlock);
      net.off('left', onLeft);
      this.scale.off('resize', this.build, this);
    });
    this.build();
  }

  /** Estado de un artículo: si se puede comprar, y si no, por qué. */
  private status(u: Upgrade, info: RoomInfo): { can: boolean; label: string; done: boolean } {
    const price = upgradePrice(u, info.modo, info.sorpresas);
    if ((u.kind === 'mejora' || u.kind === 'reforma' || u.kind === 'empleado') && info.mejoras.includes(u.id)) {
      return { can: false, label: u.kind === 'empleado' ? 'Contratado' : 'Comprado', done: true };
    }
    if (u.kind === 'consumible' && info.consumibles.includes(u.id)) return { can: false, label: 'Para la próxima', done: true };
    if (u.kind === 'ropa' && u.hat && ownedHats().includes(u.hat)) return { can: false, label: 'Ya es tuyo', done: true };
    if (u.minLevel && info.nivel < u.minLevel) return { can: false, label: `Desde el nivel ${u.minLevel}`, done: false };
    if (u.requires && !info.mejoras.includes(u.requires)) return { can: false, label: `Antes: ${getUpgrade(u.requires)?.name ?? u.requires}`, done: false };
    return { can: info.dinero >= price, label: String(price), done: false };
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

    let y = 12 * s;
    txt(this, W / 2, y, 'Tienda', 30 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    addSoundToggle(this, W - 24, 24, 2);
    y += 38 * s;
    const coinScale = Math.max(2, Math.round(3 * s));
    const money = txt(this, W / 2 + 8, y, `${info.dinero}`, 24 * s, { color: '#ffd23f', stroke: '#2b1d14', strokeThickness: 5 }).setOrigin(0, 0);
    this.add.image(W / 2 - 2, y + money.height / 2, 'icon_coin').setScale(coinScale).setOrigin(1, 0.5);
    y += money.height;
    const lp = levelParams(info.nivel, info.modo);
    const wages = wagesPerRound(info.mejoras);
    txt(this, W / 2, y, `Siguiente: nivel ${info.nivel} (objetivo ${lp.goal})${wages ? ` · sueldos ${wages} por ronda` : ''}`, 13 * s, {
      color: '#fff4dcbb',
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += 22 * s;

    // Secciones
    const boxW = Math.min(W - 16, 760);
    const x0 = W / 2 - boxW / 2;
    const perRow = boxW >= 600 ? SECTIONS.length : 3;
    const tw = (boxW - 6 * (perRow - 1)) / perRow;
    const th = 32 * s;
    SECTIONS.forEach(([id, label], i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      new Button(this, x0 + tw / 2 + col * (tw + 6), y + th / 2 + row * (th + 6), {
        w: tw,
        h: th,
        color: this.section === id ? COLORS.orange : 0x6b5a4a,
        label,
        fontSize: 14 * s,
        onPress: () => {
          this.section = id;
          this.build();
        },
      });
    });
    y += Math.ceil(SECTIONS.length / perRow) * (th + 6) + 4;

    // Artículos de la sección
    const items = UPGRADES.filter((u) => SECTION_KINDS[this.section].includes(u.kind));
    const bottom = H - 86 * s;
    let top = y;
    if (this.section === 'extra' && this.surprise) {
      const t = txt(this, W / 2, top, this.surprise, 15 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 4, align: 'center', wordWrap: { width: boxW } }).setOrigin(0.5, 0);
      top += t.height + 6;
    }
    if (this.section === 'empleado' || this.section === 'consumible') {
      const note =
        this.section === 'empleado'
          ? 'Trabajan solos en su zona el resto de la partida. Su sueldo sale del dinero de cada ronda.'
          : 'Valen solo para la ronda siguiente. Se pueden volver a comprar después.';
      const t = txt(this, W / 2, top, note, 12 * s, { color: '#fff4dcaa', align: 'center', wordWrap: { width: boxW } }).setOrigin(0.5, 0);
      top += t.height + 6;
    }
    const gap = 6;
    const cardH = clamp((bottom - top) / items.length - gap, 46, 74 * s);
    items.forEach((u, i) => {
      const cy = top + i * (cardH + gap);
      const st = this.status(u, info);
      const g = this.add.graphics();
      pixelPanel(g, x0, cy, boxW, cardH, this.flash === u.id ? 0xfff0a0 : st.done ? 0xd9f2d0 : COLORS.panel, 2);
      g.fillStyle(u.color).fillRect(x0 + 4, cy + 4, 6, cardH - 8);
      const fs = clamp(cardH / 4.2, 11, 16);
      const title = u.kind === 'empleado' ? `${u.name} · sueldo ${u.wage}` : u.name;
      txt(this, x0 + 16, cy + 5, title, fs);
      const desc = txt(this, x0 + 16, cy + 6 + fs * 1.25, u.description, fs * 0.78, { wordWrap: { width: boxW - 140 * s } }).setAlpha(0.8);
      if (desc.height > cardH - fs * 1.4 - 8) desc.setScale((cardH - fs * 1.4 - 8) / desc.height);
      const numeric = /^\d+$/.test(st.label);
      const pt = txt(this, x0 + boxW - 10, cy + cardH / 2, st.label, fs * (numeric ? 1.05 : 0.8), {
        color: st.done ? '#2e8a34' : numeric ? (st.can ? '#2b1d14' : '#c0392b') : '#6b5a4a',
      }).setOrigin(1, 0.5);
      if (numeric) this.add.image(pt.x - pt.width - 4, cy + cardH / 2, 'icon_coin').setScale(2).setOrigin(1, 0.5);
      if (st.can) {
        const zone = this.add.zone(x0 + boxW / 2, cy + cardH / 2, boxW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => net.buy(u.id));
      } else if (!st.done) g.fillStyle(0x000000, 0.12).fillRect(x0 + 2, cy + 2, boxW - 4, cardH - 4);
    });

    // Listo: cuando lo están todos, a la sala.
    const solo = info.modo === 1;
    const readyN = info.members.filter((m) => m.ready).length;
    const waiting = info.members.filter((m) => !m.ready).map((m) => m.name);
    const by = H - 52 * s;
    const bw = Math.min(boxW / 2 - 6, 220);
    new Button(this, W / 2 - bw / 2 - 6, by, {
      w: bw,
      h: 50 * s,
      color: me.ready ? 0x8a8a8a : COLORS.green,
      label: solo ? 'Seguir' : me.ready ? `Listo (${readyN}/${info.members.length})` : '¡Listo!',
      fontSize: 18 * s,
      onPress: () => net.toggleReady(),
    });
    new Button(this, W / 2 + bw / 2 + 6, by, {
      w: bw,
      h: 50 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 18 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
    if (!solo) {
      const note = me.ready && waiting.length ? `Esperando a: ${waiting.join(', ')}` : 'Cualquiera puede comprar con el dinero del equipo';
      txt(this, W / 2, by + 28 * s, note, 11 * s, { color: '#fff4dc99', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
    }
  }
}
