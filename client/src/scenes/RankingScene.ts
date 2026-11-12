import Phaser from 'phaser';
import type { RankingEntry } from '@hora-punta/shared';
import { audio } from '../audio';
import { getIdentity, isInDiscord } from '../discord';
import { savedName, savedRecord } from '../net';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { Button } from '../ui/Button';

/** Mejores partidas del grupo (en Discord, del servidor). */
export class RankingScene extends Phaser.Scene {
  private entries: RankingEntry[] | null = null;
  private error = '';

  constructor() {
    super('ranking');
  }

  create(): void {
    audio.music('menu');
    this.entries = null;
    this.error = '';
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.build, this));
    this.build();
    void this.fetchRanking();
  }

  private async fetchRanking(): Promise<void> {
    try {
      const { join } = await getIdentity(savedName);
      const res = await fetch(`/api/ranking?grupo=${encodeURIComponent(join.grupo ?? '')}`);
      if (!res.ok) throw new Error(String(res.status));
      this.entries = (await res.json()) as RankingEntry[];
    } catch (err) {
      console.error(err);
      this.error = 'No se pudo cargar el ranking.';
    }
    this.build();
  }

  private build(): void {
    if (!sceneAlive(this)) return;
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const boxW = Math.min(W - 24, 560);

    let y = 16 * s;
    txt(this, W / 2, y, 'Ranking', 34 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 44 * s;
    const sub = isInDiscord() ? 'Las mejores partidas de este servidor' : 'Las mejores partidas en este servidor de juego';
    txt(this, W / 2, y, sub, 14 * s, { color: '#fff4dccc' }).setOrigin(0.5, 0);
    y += 20 * s;
    const record = savedRecord();
    if (record) {
      txt(this, W / 2, y, `Tu récord: nivel ${record} superado`, 14 * s, { color: '#7ee081' }).setOrigin(0.5, 0);
      y += 20 * s;
    }
    y += 8 * s;

    const fs = clamp(15 * s, 12, 19);
    const rh = fs * 1.6;
    const list = this.entries ?? [];
    const maxRows = Math.max(3, Math.floor((H - y - 110 * s) / rh));
    const shown = list.slice(0, maxRows);
    const h = Math.max(shown.length, 1) * rh + 36;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, h);
    txt(this, W / 2 - boxW / 2 + 12, y + 8, 'Cocineros', fs * 0.75).setAlpha(0.6);
    txt(this, W / 2 + boxW / 2 - 12, y + 8, 'nivel · hamburguesas', fs * 0.75).setOrigin(1, 0).setAlpha(0.6);
    if (!this.entries) {
      txt(this, W / 2, y + 28, this.error || 'Cargando…', fs).setOrigin(0.5, 0);
    } else if (!shown.length) {
      txt(this, W / 2, y + 28, 'Todavía no hay partidas. ¡Estrenadlo!', fs).setOrigin(0.5, 0);
    }
    shown.forEach((e, i) => {
      const ry = y + 28 + i * rh;
      const medal = i === 0 ? '#d4a017' : i === 1 ? '#8a8a8a' : i === 2 ? '#b0703a' : '#2b1d14';
      txt(this, W / 2 - boxW / 2 + 12, ry, `${i + 1}.`, fs, { color: medal });
      const names = txt(this, W / 2 - boxW / 2 + 42, ry, `${e.names.join(', ')}${e.estilo === 'libre' ? ' (libre)' : ''}`, fs * 0.92);
      const maxW = boxW - 42 - 110;
      if (names.width > maxW) names.setScale(maxW / names.width);
      txt(this, W / 2 + boxW / 2 - 12, ry, `${e.level} · ${e.served}`, fs).setOrigin(1, 0);
    });
    y += h + 20;

    new Button(this, W / 2, Math.min(H - 40 * s, y + 30 * s), {
      w: Math.min(240, boxW),
      h: 54 * s,
      color: COLORS.orange,
      label: 'Volver',
      fontSize: 19 * s,
      onPress: () => this.scene.start('menu'),
    });
  }
}
