import Phaser from 'phaser';
import { ACHIEVEMENTS, type Profile } from '@hora-punta/shared';
import { audio } from '../audio';
import { net } from '../net';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { Button } from '../ui/Button';
import { addSoundToggle } from '../ui/SoundToggle';

type Tab = 'stats' | 'logros';

/** Tu perfil: estadísticas de siempre y logros (los guarda el servidor por cuenta de Discord o por nombre). */
export class ProfileScene extends Phaser.Scene {
  private tab: Tab = 'logros';
  private page = 0;
  private back = 'menu';

  constructor() {
    super('profile');
  }

  init(data: { back?: string }): void {
    this.back = data?.back ?? 'menu';
    this.page = 0;
  }

  create(): void {
    audio.music('menu');
    const onProfile = () => this.build();
    net.on('perfil', onProfile);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      net.off('perfil', onProfile);
      this.scale.off('resize', this.build, this);
    });
    this.build();
  }

  private build(): void {
    if (!sceneAlive(this)) return;
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    addSoundToggle(this, W - 24, 24, 2);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const boxW = Math.min(W - 20, 620);
    const x0 = W / 2 - boxW / 2;
    const p = net.profile;

    let y = 14 * s;
    txt(this, W / 2, y, 'Tu perfil', 32 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 42 * s;
    if (!p) {
      txt(this, W / 2, y + 30 * s, 'Juega una partida (Campaña o Desafío) y aquí irán tus estadísticas y logros.', 16 * s, {
        color: '#fff4dc',
        align: 'center',
        wordWrap: { width: boxW },
      }).setOrigin(0.5, 0);
      this.backButton(W, H, s);
      return;
    }
    const got = Object.keys(p.achievements).length;
    txt(this, W / 2, y, `${p.name} · ${got} de ${ACHIEVEMENTS.length} logros`, 17 * s, { color: '#fff4dc', stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0.5, 0);
    y += 28 * s;

    const tw = (boxW - 8) / 2;
    (
      [
        ['logros', 'Logros'],
        ['stats', 'Estadísticas'],
      ] as [Tab, string][]
    ).forEach(([id, label], i) => {
      new Button(this, x0 + tw / 2 + i * (tw + 8), y + 17 * s, {
        w: tw,
        h: 34 * s,
        color: this.tab === id ? COLORS.orange : 0x6b5a4a,
        label,
        fontSize: 16 * s,
        onPress: () => {
          this.tab = id;
          this.page = 0;
          this.build();
        },
      });
    });
    y += 44 * s;
    const bottom = H - 70 * s;
    if (this.tab === 'stats') this.stats(p, x0, y, boxW, bottom - y, s);
    else this.achievements(p, x0, y, boxW, bottom - y, s);
    this.backButton(W, H, s);
  }

  private stats(p: Profile, x0: number, y: number, w: number, h: number, s: number): void {
    const st = p.stats;
    const rows: [string, string][] = [
      ['Rondas y servicios jugados', String(st.rounds)],
      ['Pedidos servidos', String(st.served)],
      ['Perfectos', `${st.perfect}${st.served ? ` (${Math.round((st.perfect / st.served) * 100)} %)` : ''}`],
      ['Mejor racha', String(st.bestStreak)],
      ['Mejor nivel del Desafío', st.bestLevel ? `nivel ${st.bestLevel}` : '—'],
      ['Monedas ganadas', String(st.money)],
      ['Veces MVP', String(st.mvp)],
      ['Rondas con amigos', String(st.withFriends)],
      ['Rondas impecables', String(st.cleanRounds)],
      ['Críticos contentos', String(st.critics)],
      ['Días de campaña', String(st.days)],
      ['Concursos ganados', String(st.contestsWon)],
      ['Versus ganados', String(st.versusWins ?? 0)],
      ['Cosas quemadas', String(st.burnt)],
      ['Cocinando desde', new Date(p.since).toLocaleDateString('es-ES')],
    ];
    const rowH = Math.min(34 * s, (h - 16) / rows.length);
    const fs = clamp(rowH * 0.48, 12, 18);
    const g = this.add.graphics();
    pixelPanel(g, x0, y, w, rows.length * rowH + 16);
    rows.forEach(([label, value], i) => {
      const ry = y + 8 + i * rowH + rowH / 2;
      txt(this, x0 + 14, ry, label, fs).setOrigin(0, 0.5).setAlpha(0.75);
      txt(this, x0 + w - 14, ry, value, fs * 1.05).setOrigin(1, 0.5);
    });
  }

  private achievements(p: Profile, x0: number, y: number, w: number, h: number, s: number): void {
    const cardH = clamp(52 * s, 44, 64);
    const gap = 6;
    const navH = 44 * s;
    const per = Math.max(1, Math.floor((h - navH) / (cardH + gap)));
    // Primero los conseguidos (los más recientes arriba), luego los que faltan por lo cerca que están.
    const list = [...ACHIEVEMENTS].sort((a, b) => {
      const da = p.achievements[a.id];
      const db = p.achievements[b.id];
      if (da && db) return db.localeCompare(da);
      if (da || db) return da ? -1 : 1;
      const [ha, na] = a.progress(p.stats);
      const [hb, nb] = b.progress(p.stats);
      return hb / nb - ha / na;
    });
    const pages = Math.ceil(list.length / per);
    this.page = Math.min(this.page, pages - 1);
    const fs = clamp(cardH * 0.3, 12, 17);
    list.slice(this.page * per, (this.page + 1) * per).forEach((a, i) => {
      const cy = y + i * (cardH + gap);
      const done = p.achievements[a.id];
      const [have, need] = a.progress(p.stats);
      const g = this.add.graphics();
      pixelPanel(g, x0, cy, w, cardH, done ? 0xfff0b0 : 0xe8dcc4, 2);
      g.fillStyle(done ? 0xffd23f : 0x9a8a7a).fillRect(x0 + 4, cy + 4, 6, cardH - 8);
      txt(this, x0 + 18, cy + 6, a.name, fs, { color: done ? '#2b1d14' : '#6b5a4a' });
      const d = txt(this, x0 + 18, cy + 8 + fs * 1.2, a.description, fs * 0.78, { color: '#6b5a4a' });
      if (d.width > w - 130 * s) d.setScale((w - 130 * s) / d.width);
      if (done) {
        txt(this, x0 + w - 12, cy + cardH / 2, new Date(done).toLocaleDateString('es-ES'), fs * 0.8, { color: '#2e8a34' }).setOrigin(1, 0.5);
      } else {
        // Barra de progreso
        const bw = 90 * s;
        const bx = x0 + w - 12 - bw;
        const by = cy + cardH / 2 + 4;
        g.fillStyle(0x2b1d14, 0.25).fillRect(bx, by, bw, 6);
        g.fillStyle(COLORS.orange).fillRect(bx, by, Math.round((bw * have) / need), 6);
        txt(this, x0 + w - 12, by - 4, `${have} / ${need}`, fs * 0.75, { color: '#6b5a4a' }).setOrigin(1, 1);
      }
    });
    if (pages > 1) {
      const ny = y + per * (cardH + gap) + navH / 2;
      const bw = Math.min(140 * s, w / 3);
      new Button(this, x0 + bw / 2, ny, { w: bw, h: 36 * s, color: this.page > 0 ? 0x8d6e63 : 0x5a4a3a, label: 'Anterior', fontSize: 15 * s, onPress: () => this.turn(-1, pages) });
      txt(this, x0 + w / 2, ny, `${this.page + 1} / ${pages}`, 15 * s, { color: '#fff4dc' }).setOrigin(0.5);
      new Button(this, x0 + w - bw / 2, ny, { w: bw, h: 36 * s, color: this.page < pages - 1 ? 0x8d6e63 : 0x5a4a3a, label: 'Siguiente', fontSize: 15 * s, onPress: () => this.turn(1, pages) });
    }
  }

  private turn(d: number, pages: number): void {
    const next = Math.max(0, Math.min(pages - 1, this.page + d));
    if (next === this.page) return;
    this.page = next;
    this.build();
  }

  private backButton(W: number, H: number, s: number): void {
    new Button(this, W / 2, H - 36 * s, {
      w: Math.min(W - 40, 260),
      h: 48 * s,
      color: COLORS.orange,
      label: 'Volver',
      fontSize: 19 * s,
      onPress: () => this.scene.start(this.back),
    });
  }
}
