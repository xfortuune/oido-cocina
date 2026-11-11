import Phaser from 'phaser';
import { getPerk, perkCount, ROLE_NAMES, type PerkId, type RoomInfo } from '@hora-punta/shared';
import { audio } from '../audio';
import { net } from '../net';
import { CHEF_COLORS } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { Button } from '../ui/Button';

/**
 * Cada dos niveles: cada cocinero elige una de tres mini-habilidades.
 * Cuando todos han elegido, el servidor pasa a la sala (y en solitario, a la cocina).
 */
export class PerkScene extends Phaser.Scene {
  constructor() {
    super('perks');
  }

  create(): void {
    audio.music('menu');
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'lobby') this.scene.start('lobby');
      else if (info.phase === 'shop') this.scene.start('shop');
      else if (info.phase === 'playing') this.scene.start('kitchen');
      else this.build();
    };
    const onLeft = () => this.scene.start('lobby');
    net.on('room', onRoom);
    net.on('left', onLeft);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      net.off('room', onRoom);
      net.off('left', onLeft);
      this.scale.off('resize', this.build, this);
    });
    this.build();
  }

  private build(): void {
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const info = net.info;
    const me = net.me;
    if (!info || !me) return;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);

    let y = 18 * s;
    const title = me.offer ? '¡Elige una habilidad!' : 'Habilidad elegida';
    txt(this, W / 2, y, title, 32 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 46 * s;
    txt(this, W / 2, y, `Antes del nivel ${info.nivel}. Te acompañará hasta que perdáis una ronda.`, 14 * s, {
      color: '#fff4dccc',
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += 40 * s;

    const boxW = Math.min(W - 24, 560);
    if (me.offer) {
      // Tres tarjetas: en fila si hay sitio, si no una debajo de otra.
      const wide = W >= 760;
      const gap = 12;
      const cardW = wide ? Math.min((W - 24 - gap * 2) / 3, 260) : boxW;
      const cardH = wide ? 150 * s : 112 * s;
      me.offer.forEach((id, i) => {
        const perk = getPerk(id);
        if (!perk) return;
        const cx = wide ? W / 2 + (i - 1) * (cardW + gap) - cardW / 2 : W / 2 - boxW / 2;
        const cy = wide ? y : y + i * (cardH + gap);
        const g = this.add.graphics();
        pixelPanel(g, cx, cy, cardW, cardH);
        g.fillStyle(perk.color).fillRect(cx + 6, cy + 6, cardW - 12, 30 * s);
        txt(this, cx + cardW / 2, cy + 6 + 15 * s, perk.name, 18 * s, { color: '#ffffff', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5);
        txt(this, cx + 14, cy + 44 * s, perk.description, 14 * s, { wordWrap: { width: cardW - 28 }, lineSpacing: 2 });
        const have = perkCount(me.perks, perk.id as PerkId);
        const roles = perk.roles.length ? `Para: ${perk.roles.map((r) => ROLE_NAMES[r]).join(', ')}` : 'Para todos';
        const foot = `${roles}${have ? ` · ya la tienes (×${have + 1})` : ''}`;
        txt(this, cx + 14, cy + cardH - 10, foot, 12 * s, { color: '#6b5a4a' }).setOrigin(0, 1);
        const zone = this.add.zone(cx + cardW / 2, cy + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          g.clear();
          pixelPanel(g, cx, cy, cardW, cardH, 0xffe2b8);
          audio.sfx('perk');
          net.pickPerk(id);
        });
      });
      y += wide ? cardH + 20 : 3 * (cardH + gap) + 8;
    } else {
      const waiting = info.members.filter((m) => m.offer);
      const msg = waiting.length ? `Esperando a: ${waiting.map((m) => m.name).join(', ')}` : 'Preparando la cocina…';
      txt(this, W / 2, y, msg, 16 * s, { color: '#fff4dc', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
      y += 40 * s;
    }

    // Habilidades de todo el equipo
    const rowH = 40 * s;
    const listH = info.members.length * rowH + 34;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, listH);
    txt(this, W / 2 - boxW / 2 + 14, y + 8, 'Habilidades del equipo', 13 * s).setAlpha(0.7);
    info.members.forEach((m, i) => {
      const ry = y + 30 + i * rowH;
      txt(this, W / 2 - boxW / 2 + 14, ry, `${m.name}${m.offer ? ' (eligiendo…)' : ''}`, 15 * s, { color: CHEF_COLORS[m.color][1] });
      const names = m.perks.map((id) => getPerk(id)?.name ?? id).join(' · ') || 'Ninguna todavía';
      const t = txt(this, W / 2 - boxW / 2 + 14, ry + 18 * s, names, 12 * s);
      if (t.width > boxW - 28) t.setScale((boxW - 28) / t.width);
    });
    y += listH + 16;

    new Button(this, W / 2, Math.min(H - 36 * s, y + 30 * s), {
      w: Math.min(200, boxW),
      h: 50 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 18 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
  }
}
