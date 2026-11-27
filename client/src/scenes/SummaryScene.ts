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
  type VersusSummary,
  TEAMS,
  insights,
  TIMELINE_STEP,
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
  /** Viendo el análisis de la ronda en vez del resumen. */
  private analysis = false;

  constructor() {
    super('summary');
  }

  create(): void {
    this.analysis = false;
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
    if (summary?.versus) {
      const won = summary.versus.winner === (net.me?.team === 1 ? 1 : 0);
      audio.sfx(won ? 'levelUp' : 'runOver');
      if (won) this.time.delayedCall(150, () => this.confetti(60));
    } else if (summary) {
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
    if (this.analysis) this.buildAnalysis(summary);
    else if (summary.versus) this.buildVersus(summary, summary.versus);
    else if (summary.run) this.buildRun(summary, summary.run);
    else this.buildRound(summary);
  }

  // ---------------------------------------------------------------- análisis

  /** Ritmo de la ronda (servidos y perdidos cada 10 s), puestos parados, consejos y lo que hizo cada uno. */
  private buildAnalysis(summary: SummaryInfo): void {
    const { width: W, height: H } = this.scale;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const st = summary.stats;
    const boxW = Math.min(W - 20, 560);
    const x0 = W / 2 - boxW / 2;
    const fs = clamp(14 * s, 12, 17);
    let y = 18 * s;
    txt(this, x0, y, 'Análisis de la ronda', 26 * s, { color: '#4fa3e0', stroke: '#2b1d14', strokeThickness: 6 }).setOrigin(0, 0);
    y += 44 * s;

    // Ritmo: barras verdes (servidos) y rojas (perdidos) por tramo de 10 s.
    const tl = st.timeline ?? { served: [], lost: [] };
    const n = Math.max(tl.served.length, tl.lost.length, 1);
    const chartH = 90 * s;
    const g = this.add.graphics();
    pixelPanel(g, x0, y, boxW, chartH + 44 * s);
    txt(this, x0 + 12, y + 8, 'Ritmo: servidos (verde) y perdidos (rojo) cada 10 s', fs * 0.8).setAlpha(0.75);
    const max = Math.max(1, ...tl.served, ...tl.lost);
    const cx = x0 + 14;
    const cw = boxW - 28;
    const base = y + 22 * s + chartH;
    const bw = cw / n;
    for (let i = 0; i < n; i++) {
      const sv = tl.served[i] ?? 0;
      const ls = tl.lost[i] ?? 0;
      const hs = Math.round(((chartH - 8) * sv) / max);
      const hl = Math.round(((chartH - 8) * ls) / max);
      g.fillStyle(0x43b049).fillRect(cx + i * bw + 1, base - hs, Math.max(2, bw / 2 - 1), hs);
      g.fillStyle(0xe5483a).fillRect(cx + i * bw + bw / 2, base - hl, Math.max(2, bw / 2 - 1), hl);
    }
    g.fillStyle(0x2b1d14, 0.4).fillRect(cx, base, cw, 1);
    txt(this, cx, base + 3, '0:00', fs * 0.7).setAlpha(0.6);
    const end = n * TIMELINE_STEP;
    txt(this, cx + cw, base + 3, `${Math.floor(end / 60)}:${String(end % 60).padStart(2, '0')}`, fs * 0.7).setOrigin(1, 0).setAlpha(0.6);
    y += chartH + 52 * s;

    // Puestos parados
    const idle = st.idle ?? { grill: 0, fryer: 0, caja: 0 };
    const rows: [string, number][] = [
      ['Plancha parada', idle.grill],
      ['Freidora parada', idle.fryer],
      ...(idle.caja > 0 ? ([['Clientes sin atender', idle.caja]] as [string, number][]) : []),
    ];
    const total = Math.max(30, (n * TIMELINE_STEP) / 2);
    const rh = fs * 1.7;
    pixelPanel(g, x0, y, boxW, rows.length * rh + 16);
    rows.forEach(([label, sec], i) => {
      const ry = y + 8 + i * rh;
      txt(this, x0 + 12, ry + 2, label, fs * 0.85);
      const bx = x0 + boxW * 0.45;
      const bwid = boxW * 0.42;
      g.fillStyle(0x2b1d14, 0.15).fillRect(bx, ry + 5, bwid, fs * 0.7);
      g.fillStyle(sec >= 12 ? 0xe5483a : 0x43b049).fillRect(bx, ry + 5, Math.min(bwid, (bwid * sec) / total), fs * 0.7);
      txt(this, x0 + boxW - 12, ry + 2, `${Math.round(sec)} s`, fs * 0.85).setOrigin(1, 0);
    });
    y += rows.length * rh + 26;

    // Consejos
    for (const line of insights(st).slice(0, 4)) {
      const t = txt(this, x0 + 4, y, `• ${line}`, fs * 0.9, { color: '#fff4dc', wordWrap: { width: boxW - 8 } });
      y += t.height + 6;
    }
    y += 6;

    // Lo que hizo cada uno
    const players = [...summary.players].sort((a, b) => b.score - a.score);
    const keys: [keyof SummaryInfo['players'][number]['stats'], string, number][] = [
      ['taken', 'notas', 0x9b59b6],
      ['delivered', 'entregas', 0x43b049],
      ['cooked', 'fogones', 0xff8a3d],
      ['assembled', 'capas', 0x4fa3e0],
    ];
    const most = Math.max(1, ...players.map((p) => keys.reduce((t, [k]) => t + (p.stats[k] as number), 0)));
    const prh = 26 * s;
    if (y + players.length * prh + 30 < H - 90 * s) {
      pixelPanel(g, x0, y, boxW, players.length * prh + 30);
      txt(this, x0 + 12, y + 6, keys.map(([, l]) => l).join(' · '), fs * 0.75).setAlpha(0.7);
      players.forEach((p, i) => {
        const ry = y + 24 + i * prh;
        txt(this, x0 + 12, ry + prh / 2, p.name, fs * 0.9, { color: CHEF_COLORS[p.color][1] }).setOrigin(0, 0.5);
        let bx = x0 + boxW * 0.35;
        const full = boxW * 0.6;
        for (const [k, , color] of keys) {
          const w = (full * (p.stats[k] as number)) / most;
          g.fillStyle(color).fillRect(bx, ry + 6, w, prh - 12);
          bx += w;
        }
      });
      y += players.length * prh + 40;
    }
    const by = Math.min(H - 44 * s, y + 30 * s);
    new Button(this, W / 2, by, {
      w: Math.min(boxW, 260),
      h: 50 * s,
      color: COLORS.orange,
      label: 'Volver al resumen',
      fontSize: 18 * s,
      onPress: () => {
        this.analysis = false;
        this.build();
      },
    });
  }

  // ---------------------------------------------------------------- versus

  private buildVersus(summary: SummaryInfo, vs: VersusSummary): void {
    const { width: W, height: H } = this.scale;
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const mine = net.me?.team === 1 ? 1 : 0;
    let y = 18 * s;
    const title = vs.winner === -1 ? '¡Empate!' : vs.winner === mine ? '¡Habéis ganado!' : '¡Habéis perdido!';
    txt(this, W / 2, y, title, 34 * s, { color: vs.winner === mine ? '#ffc93c' : '#ff8a73', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 50 * s;
    if (vs.winner >= 0) {
      txt(this, W / 2, y, `Gana el equipo ${TEAMS[vs.winner].name}`, 17 * s, { color: TEAMS[vs.winner].css, stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5, 0);
      y += 30 * s;
    }
    const boxW = Math.min(W - 20, 620);
    const colW = (boxW - 12) / 2;
    const x0 = W / 2 - boxW / 2;
    const fs = clamp(15 * s, 12, 18);
    const rows: [string, (t: VersusSummary['teams'][number]) => string][] = [
      ['Dinero', (t) => String(t.money)],
      ['Servidos', (t) => String(t.served)],
      ['Clientes robados', (t) => String(t.stolen)],
    ];
    const panelH = 46 * s + rows.length * fs * 1.7 + 12 + 4 * fs * 1.4;
    vs.teams.forEach((team, t) => {
      const x = x0 + t * (colW + 12);
      const g = this.add.graphics();
      pixelPanel(g, x, y, colW, panelH, vs.winner === t ? 0xfff0b0 : COLORS.panel);
      g.fillStyle(TEAMS[t].color).fillRect(x + 4, y + 4, colW - 8, 32 * s);
      txt(this, x + colW / 2, y + 4 + 16 * s, `${TEAMS[t].name}${vs.winner === t ? ' · ganador' : ''}`, 18 * s, { color: '#ffffff', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5);
      let ry = y + 46 * s;
      for (const [label, value] of rows) {
        txt(this, x + 12, ry, label, fs * 0.85).setAlpha(0.7);
        txt(this, x + colW - 12, ry, value(team), fs * 1.1).setOrigin(1, 0);
        ry += fs * 1.7;
      }
      ry += 6;
      for (const name of team.players) {
        const nt = txt(this, x + 12, ry, name, fs * 0.9, { color: '#4a3a2c' });
        if (nt.width > colW - 24) nt.setScale((colW - 24) / nt.width);
        ry += fs * 1.4;
      }
    });
    y += panelH + 14 * s;
    const mvp = summary.players.find((p) => p.id === summary.mvpId);
    if (mvp && mvp.score > 0) {
      txt(this, W / 2, y, `MVP del duelo: ${mvp.name}`, 16 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5, 0);
      y += 28 * s;
    }
    this.buttons(y, s, boxW, 'Revancha', 'Cualquiera puede pulsar «Revancha» para volver a la sala');
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
    const by = Math.min(H - 92 * s, y + 34 * s);
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
    // Debajo: el análisis de la ronda (ritmo, puestos parados y consejos).
    const ay = Math.min(H - 14 * s - 18 * s, by + 52 * s);
    new Button(this, W / 2, ay, {
      w: Math.min(boxW, 240),
      h: 36 * s,
      color: COLORS.blue,
      label: 'Análisis de la ronda',
      fontSize: 15 * s,
      onPress: () => {
        this.analysis = true;
        this.build();
      },
    });
    if (net.info?.modo !== 1 && ay + 40 * s < H) txt(this, W / 2, ay + 22 * s, note, 12 * s, { color: '#fff4dc99' }).setOrigin(0.5, 0);
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
