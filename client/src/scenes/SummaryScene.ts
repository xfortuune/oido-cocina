import Phaser from 'phaser';
import {
  getPerk,
  getRecipe,
  getUpgrade,
  MAX_LEVEL,
  newRecipesAt,
  type ChefLook,
  type RoomInfo,
  type RunSummary,
  type SummaryInfo,
} from '@hora-punta/shared';
import { audio } from '../audio';
import { net, savedRecord } from '../net';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { addAvatar } from '../ui/avatars';
import { Button } from '../ui/Button';

/**
 * Resumen al acabar una ronda (si se ha pasado el nivel, totales, aportación de cada cocinero y MVP)
 * o, si se ha acabado la partida, el resumen de la partida entera con el ranking del grupo.
 */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('summary');
  }

  create(): void {
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'lobby') this.scene.start('lobby');
      else if (info.phase === 'perks') this.scene.start('perks');
      else if (info.phase === 'shop') this.scene.start('shop');
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

    audio.music(null);
    const summary = net.summary;
    if (summary) {
      audio.sfx(summary.passed ? 'levelUp' : 'runOver');
      if (summary.passed) this.time.delayedCall(150, () => this.confetti(summary.won ? 90 : 40));
    }
    this.build();
  }

  private build(): void {
    this.children.removeAll(true);
    drawBackground(this);
    const summary = net.summary;
    if (!summary) return;
    if (summary.run) this.buildRun(summary, summary.run);
    else this.buildRound(summary);
  }

  // ---------------------------------------------------------------- ronda superada

  private buildRound(summary: SummaryInfo): void {
    const { width: W, height: H } = this.scale;
    const { stats, money, reputation, players, mvpId, level, goal, stars, perkNext, earnedRound } = summary;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);

    let y = H * 0.03;
    const titleText = txt(this, W / 2, y, `¡Nivel ${level} superado!`, 36 * s, {
      color: '#7ee081',
      stroke: '#2b1d14',
      strokeThickness: 8 * s,
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    this.tweens.add({ targets: titleText, scale: { from: 0.6, to: 1 }, duration: 400, ease: 'Back.Out' });
    y += titleText.height + 4;
    txt(this, W / 2, y, `Servidos ${stats.served} de ${goal} · +${earnedRound} para la tienda`, 16 * s, { color: '#fff4dc', align: 'center' }).setOrigin(0.5, 0);
    y += 26 * s;
    y = this.stars(W / 2, y, stars, s);

    const boxW = Math.min(W - 24, 520);
    const fs = clamp(16 * s, 13, 20);
    y = this.teamTable(
      [
        ['Pedidos servidos', String(stats.served)],
        ['Perfectos', String(stats.perfect)],
        ['Propinas', String(stats.tips)],
        ['Caja de la ronda', String(money)],
        ['Reputación', String(reputation)],
        ['Equivocados', String(stats.wrong)],
        ['Clientes perdidos', String(stats.lost)],
        ['Quemados', String(stats.burnt)],
      ],
      y,
      boxW,
      fs,
    );

    // Cocineros, del que más aportó al que menos
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const rowH = 38 * s;
    const listH = sorted.length * rowH + 30;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, listH);
    txt(this, W / 2 - boxW / 2 + 14, y + 8, 'Cocinero', fs * 0.8).setAlpha(0.7);
    txt(this, W / 2 + boxW / 2 - 14, y + 8, 'notas · entregas · fogones · capas · fallos', fs * 0.7).setOrigin(1, 0).setAlpha(0.7);
    sorted.forEach((p, i) => {
      const ry = y + 28 + i * rowH;
      const mvp = p.id === mvpId && sorted.length > 1;
      const nameX = this.chefRow(p, W / 2 - boxW / 2, ry, rowH, s);
      txt(this, nameX, ry + rowH / 2, `${mvp ? '🏆 ' : ''}${p.name}`, fs, { color: CHEF_COLORS[p.color][1] }).setOrigin(0, 0.5);
      const st = p.stats;
      txt(this, W / 2 + boxW / 2 - 14, ry + rowH / 2, `${st.taken} · ${st.delivered} · ${st.cooked} · ${st.assembled} · ${st.mistakes}`, fs * 0.85).setOrigin(1, 0.5);
    });
    y += listH + 8;
    const mvp = players.find((p) => p.id === mvpId);
    if (mvp && players.length > 1) {
      txt(this, W / 2, y, `MVP de la ronda: ${mvp.name}`, fs * 1.1, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5, 0);
      y += fs * 1.8;
    }

    const next = level + 1;
    const fresh = newRecipesAt(next).map((id) => getRecipe(id).name);
    if (fresh.length) {
      txt(this, W / 2, y, `En el nivel ${next} llega: ${fresh.join(', ')}`, fs, { color: '#7ee081' }).setOrigin(0.5, 0);
      y += fs * 1.8;
    }

    const label = perkNext ? 'Elegir habilidad' : 'A la tienda';
    const note = perkNext ? 'Cada uno elige la suya; luego, la tienda' : 'Gastad el dinero del equipo en mejoras';
    this.buttons(y, s, boxW, label, note);
  }

  // ---------------------------------------------------------------- fin de la partida

  private buildRun(summary: SummaryInfo, run: RunSummary): void {
    const { width: W, height: H } = this.scale;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const fs = clamp(15 * s, 12, 19);
    const boxW = Math.min(W - 24, 520);

    let y = H * 0.025;
    const title = summary.won ? `¡Los ${MAX_LEVEL} niveles superados!` : 'Fin de la partida';
    const t = txt(this, W / 2, y, title, 34 * s, {
      color: summary.won ? '#7ee081' : '#ff8a3d',
      stroke: '#2b1d14',
      strokeThickness: 8 * s,
      align: 'center',
      wordWrap: { width: W - 30 },
    }).setOrigin(0.5, 0);
    y += t.height + 2;
    const why = summary.won
      ? '¡Sois leyenda de Mordiscos Mandarina!'
      : summary.endReason === 'reputation'
        ? `Reputación por los suelos en el nivel ${summary.level}`
        : `Nivel ${summary.level}: ${summary.stats.served} de ${summary.goal} servidos`;
    txt(this, W / 2, y, why, 15 * s, { color: '#fff4dc', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
    y += 22 * s;

    // El número grande: niveles superados
    const big = txt(this, W / 2, y, `${run.levelsPassed}`, 56 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 8 * s }).setOrigin(0.5, 0);
    this.tweens.add({ targets: big, scale: { from: 0.3, to: 1 }, duration: 500, ease: 'Back.Out' });
    y += big.height - 6 * s;
    const pos = run.position;
    const posLabel = pos === 1 ? '¡Nuevo récord del grupo!' : pos ? `Puesto ${pos} del ranking` : 'niveles superados';
    txt(this, W / 2, y, `${run.levelsPassed === 1 ? 'nivel superado' : 'niveles superados'}${pos ? ` · ${posLabel}` : ''}`, 14 * s, {
      color: pos === 1 ? '#7ee081' : '#fff4dccc',
    }).setOrigin(0.5, 0);
    y += 24 * s;

    const mins = Math.floor(run.seconds / 60);
    y = this.teamTable(
      [
        ['Hamburguesas', String(run.served)],
        ['Perfectas', String(run.perfect)],
        ['Dinero ganado', String(run.earned)],
        ['Tiempo', `${mins} min ${run.seconds % 60} s`],
      ],
      y,
      boxW,
      fs,
    );

    // Cocineros: habilidades que tenían y puntuación de toda la partida
    const players = [...run.players].sort((a, b) => b.score - a.score);
    const rowH = 44 * s;
    const listH = players.length * rowH + 14;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, listH);
    players.forEach((p, i) => {
      const ry = y + 7 + i * rowH;
      const nameX = this.chefRow(p, W / 2 - boxW / 2, ry, rowH, s);
      const mvp = p.id === run.mvpId;
      txt(this, nameX, ry + 6 * s, `${mvp ? '🏆 ' : ''}${p.name}`, fs, { color: CHEF_COLORS[p.color][1] });
      txt(this, W / 2 + boxW / 2 - 12, ry + 6 * s, `${p.score} pts`, fs * 0.9).setOrigin(1, 0);
      const perks = p.perks.map((id) => getPerk(id)?.short ?? id).join(' · ') || 'sin habilidades';
      const pt = txt(this, nameX, ry + 6 * s + fs * 1.3, perks, fs * 0.72, { color: '#6b5a4a' });
      const maxW = W / 2 + boxW / 2 - 12 - nameX;
      if (pt.width > maxW) pt.setScale(maxW / pt.width);
    });
    y += listH + 6;
    if (run.mejoras.length) {
      const m = txt(this, W / 2, y, `Mejoras: ${run.mejoras.map((id) => getUpgrade(id)?.name ?? id).join(', ')}`, fs * 0.75, {
        color: '#fff4dcaa',
        align: 'center',
        wordWrap: { width: boxW },
      }).setOrigin(0.5, 0);
      y += m.height + 6;
    }

    // Ranking del grupo
    if (run.ranking.length) {
      const rh = fs * 1.45;
      const rkH = run.ranking.length * rh + 30;
      pixelPanel(g, W / 2 - boxW / 2, y, boxW, rkH, 0xfff0c8);
      txt(this, W / 2 - boxW / 2 + 12, y + 7, isDiscordGroup() ? 'Ranking del servidor' : 'Ranking', fs * 0.8).setAlpha(0.7);
      run.ranking.forEach((e, i) => {
        const ry = y + 26 + i * rh;
        const mine = run.position === i + 1;
        const color = mine ? '#c0392b' : '#2b1d14';
        txt(this, W / 2 - boxW / 2 + 12, ry, `${i + 1}.`, fs * 0.9, { color });
        const names = txt(this, W / 2 - boxW / 2 + 38, ry, `${e.names.join(', ')}${e.estilo === 'libre' ? ' (libre)' : ''}`, fs * 0.9, { color });
        const maxW = boxW - 38 - 90;
        if (names.width > maxW) names.setScale(maxW / names.width);
        txt(this, W / 2 + boxW / 2 - 12, ry, `nivel ${e.level}`, fs * 0.9, { color }).setOrigin(1, 0);
      });
      y += rkH + 6;
    } else {
      txt(this, W / 2, y, `Tu récord: nivel ${savedRecord()} superado`, fs * 0.85, { color: '#fff4dcaa' }).setOrigin(0.5, 0);
      y += fs * 1.6;
    }

    this.buttons(y, s, boxW, 'Nueva partida', 'Volveréis al nivel 1 sin habilidades ni mejoras');
  }

  // ---------------------------------------------------------------- piezas

  private stars(x: number, y: number, stars: number, s: number): number {
    const starPx = Math.round(4 * s);
    for (let i = 0; i < 3; i++) {
      const star = this.add
        .image(x + (i - 1) * 11 * starPx, y, 'icon_star')
        .setScale(starPx)
        .setOrigin(0.5, 0)
        .setTint(i < stars ? 0xffffff : 0x555555);
      if (i < stars) this.tweens.add({ targets: star, scale: { from: starPx * 1.8, to: starPx }, delay: 200 + i * 180, duration: 300, ease: 'Back.Out' });
    }
    return y + 9 * starPx + 6;
  }

  private teamTable(rows: [string, string][], y: number, boxW: number, fs: number): number {
    const { width: W } = this.scale;
    const lineH = fs * 1.5;
    const half = Math.ceil(rows.length / 2);
    const h = half * lineH + 20;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, h);
    rows.forEach(([label, value], i) => {
      const col = i < half ? 0 : 1;
      const row = i % half;
      const x0 = W / 2 - boxW / 2 + 14 + col * (boxW / 2);
      const ry = y + 10 + row * lineH;
      txt(this, x0, ry, label, fs * 0.9);
      txt(this, x0 + boxW / 2 - 28, ry, value, fs * 0.9).setOrigin(1, 0);
    });
    return y + h + 12;
  }

  /** Cocinero y avatar al principio de una fila; devuelve dónde empieza el nombre. */
  private chefRow(p: { color: number; look?: ChefLook; avatar: string | null; id: string; name: string }, x: number, ry: number, rowH: number, s: number): number {
    const scale = Math.max(1, Math.round(1.8 * s));
    this.add.image(x + 24, ry + rowH - 6, chefKey(p.look ?? p.color, 'down', 0)).setScale(scale).setOrigin(0.5, 1);
    const avatarSize = Math.round(20 * s);
    const avatar = addAvatar(this, p, x + 46 + avatarSize / 2, ry + rowH / 2, avatarSize);
    return x + 46 + (avatar ? avatarSize + 8 : 0);
  }

  private buttons(y: number, s: number, boxW: number, label: string, note: string): void {
    const { width: W, height: H } = this.scale;
    const by = Math.min(H - 44 * s, y + 34 * s);
    const bw = Math.min((boxW - 12) / 2, 220);
    new Button(this, W / 2 - bw / 2 - 6, by, {
      w: bw,
      h: 56 * s,
      color: COLORS.green,
      label,
      fontSize: 19 * s,
      onPress: () => net.backToLobby(),
    });
    new Button(this, W / 2 + bw / 2 + 6, by, {
      w: bw,
      h: 56 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 19 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
    if (net.info?.modo !== 1) txt(this, W / 2, by + 34 * s, note, 12 * s, { color: '#fff4dc99' }).setOrigin(0.5, 0);
  }

  /** Confeti de colores cayendo desde arriba. */
  private confetti(n: number): void {
    const { width: W, height: H } = this.scale;
    const colors = [0xff8a3d, 0xffd23f, 0x5cc46a, 0x4fa3e0, 0xc77de0, 0xe5483a];
    for (let i = 0; i < n; i++) {
      const c = this.add
        .image(Math.random() * W, -10 - Math.random() * 80, 'icon_confetti')
        .setTint(colors[i % colors.length])
        .setScale(2 + Math.random() * 2)
        .setDepth(100);
      this.tweens.add({
        targets: c,
        y: H + 20,
        x: c.x + (Math.random() - 0.5) * 120,
        angle: Math.random() * 720,
        duration: 1800 + Math.random() * 1600,
        delay: Math.random() * 600,
        ease: 'Quad.In',
        onComplete: () => c.destroy(),
      });
    }
  }
}

function isDiscordGroup(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('frame_id');
}
