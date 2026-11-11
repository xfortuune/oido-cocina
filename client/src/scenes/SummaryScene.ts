import Phaser from 'phaser';
import type { RoomInfo } from '@hora-punta/shared';
import { net } from '../net';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { addAvatar } from '../ui/avatars';
import { Button } from '../ui/Button';

/** Resumen del turno: totales del equipo, aportación de cada cocinero y MVP. */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('summary');
  }

  create(): void {
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'lobby') this.scene.start('lobby');
      else if (info.phase === 'playing') this.scene.start('kitchen');
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
    const summary = net.summary;
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    if (!summary) return;
    const { stats, money, reputation, endReason, players, mvpId } = summary;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);

    const title = endReason === 'reputation' ? '¡Reputación por los suelos!' : '¡Fin del turno!';
    let y = H * 0.03;
    const titleText = txt(this, W / 2, y, title, 36 * s, {
      color: '#ff8a3d',
      stroke: '#2b1d14',
      strokeThickness: 8 * s,
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += titleText.height + 6;

    const stars = stats.served >= 16 ? 3 : stats.served >= 10 ? 2 : stats.served >= 5 ? 1 : 0;
    const starPx = Math.round(4 * s);
    for (let i = 0; i < 3; i++) {
      this.add
        .image(W / 2 + (i - 1) * 11 * starPx, y, 'icon_star')
        .setScale(starPx)
        .setOrigin(0.5, 0)
        .setTint(i < stars ? 0xffffff : 0x555555);
    }
    y += 9 * starPx + 6;

    // Totales del equipo, en dos columnas
    const boxW = Math.min(W - 24, 520);
    const fs = clamp(16 * s, 13, 20);
    const lineH = fs * 1.5;
    const team: [string, string][] = [
      ['Pedidos servidos', String(stats.served)],
      ['Perfectos', String(stats.perfect)],
      ['Propinas', String(stats.tips)],
      ['Caja final', String(money)],
      ['Reputación', String(reputation)],
      ['Equivocados', String(stats.wrong)],
      ['Clientes perdidos', String(stats.lost)],
      ['Quemados', String(stats.burnt)],
    ];
    const half = Math.ceil(team.length / 2);
    const teamH = half * lineH + 20;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, teamH);
    team.forEach(([label, value], i) => {
      const col = i < half ? 0 : 1;
      const row = i % half;
      const x0 = W / 2 - boxW / 2 + 14 + col * (boxW / 2);
      const ry = y + 10 + row * lineH;
      txt(this, x0, ry, label, fs * 0.9);
      txt(this, x0 + boxW / 2 - 28, ry, value, fs * 0.9).setOrigin(1, 0);
    });
    y += teamH + 12;

    // Cocineros, del que más aportó al que menos
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const rowH = 38 * s;
    const listH = sorted.length * rowH + 30;
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, listH);
    txt(this, W / 2 - boxW / 2 + 14, y + 8, 'Cocinero', fs * 0.8).setAlpha(0.7);
    txt(this, W / 2 + boxW / 2 - 14, y + 8, 'notas · entregas · fogones · capas · fallos', fs * 0.7).setOrigin(1, 0).setAlpha(0.7);
    sorted.forEach((p, i) => {
      const ry = y + 28 + i * rowH;
      const scale = Math.max(1, Math.round(1.8 * s));
      this.add.image(W / 2 - boxW / 2 + 24, ry + rowH - 6, chefKey(p.color, 'down', 0)).setScale(scale).setOrigin(0.5, 1);
      const mvp = p.id === mvpId && sorted.length > 1;
      const avatarSize = Math.round(20 * s);
      const avatar = addAvatar(this, p, W / 2 - boxW / 2 + 46 + avatarSize / 2, ry + rowH / 2, avatarSize);
      txt(this, W / 2 - boxW / 2 + 46 + (avatar ? avatarSize + 8 : 0), ry + rowH / 2, `${mvp ? '🏆 ' : ''}${p.name}`, fs, {
        color: CHEF_COLORS[p.color][1],
      }).setOrigin(0, 0.5);
      const st = p.stats;
      txt(this, W / 2 + boxW / 2 - 14, ry + rowH / 2, `${st.taken} · ${st.delivered} · ${st.cooked} · ${st.assembled} · ${st.mistakes}`, fs * 0.85).setOrigin(1, 0.5);
    });
    y += listH + 8;
    const mvp = players.find((p) => p.id === mvpId);
    if (mvp && players.length > 1) {
      txt(this, W / 2, y, `MVP del turno: ${mvp.name}`, fs * 1.1, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5, 0);
      y += fs * 1.8;
    }

    const by = Math.min(H - 40 * s, y + 34 * s);
    const bw = Math.min((boxW - 12) / 2, 220);
    new Button(this, W / 2 - bw / 2 - 6, by, {
      w: bw,
      h: 56 * s,
      color: COLORS.green,
      // En solitario no hay sala que esperar: se vuelve a la cocina directamente.
      label: net.info?.modo === 1 ? 'Otro turno' : 'Volver a la sala',
      fontSize: 20 * s,
      onPress: () => net.backToLobby(),
    });
    new Button(this, W / 2 + bw / 2 + 6, by, {
      w: bw,
      h: 56 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 20 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
  }
}
