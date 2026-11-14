import Phaser from 'phaser';
import { getRecipe } from '@hora-punta/shared';
import { isTouchDevice } from '../layout';
import { audio } from '../audio';
import { net, savedLook } from '../net';
import { menuPresence } from '../presence';
import { addSoundToggle } from '../ui/SoundToggle';
import { fillStack } from '../pixel/items';
import { chefKey, generateTextures } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, txt } from '../theme';
import { Button } from '../ui/Button';

export class MenuScene extends Phaser.Scene {
  /** En el Desafío, después de elegirlo, se pregunta cuántos vais a cocinar. */
  private pickPlayers = false;

  constructor() {
    super('menu');
  }

  init(data: { desafio?: boolean }): void {
    this.pickPlayers = !!data?.desafio;
  }

  create(): void {
    generateTextures(this);
    audio.music('menu');
    // Al volver al menú se sale de la partida anterior: el modo se elige de nuevo.
    if (net.connected) void net.leave();
    menuPresence();
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.5);

    // Cocinero y hamburguesa gigantes en pixel art.
    const px = Math.max(3, Math.round(6 * s));
    const heroY = Math.round(H * 0.26);
    // Tu cocinero (tócalo para cambiarle el delantal o el accesorio).
    const hero = this.add.image(W / 2 - 14 * px, heroY, chefKey(savedLook(), 'down', 0)).setScale(px).setOrigin(0.5, 1);
    hero.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('look'));
    const burger = this.add.container(W / 2 + 10 * px, heroY).setScale(px);
    fillStack(burger, getRecipe('chispa').layers);
    this.tweens.add({ targets: burger, y: heroY - px * 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const title = txt(this, W / 2, heroY + 14 * s, '¡OÍDO, COCINA!', 64 * s, {
      color: '#ff8a3d',
      stroke: '#2b1d14',
      strokeThickness: 10 * s,
    }).setOrigin(0.5, 0);
    if (title.width > W - 24) title.setScale((W - 24) / title.width);
    txt(this, W / 2, heroY + 92 * s, 'en Mordiscos Mandarina', 22 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);

    const boxW = Math.min(W - 32, 480);
    const touch = isTouchDevice();
    const help = (
      this.pickPlayers
        ? [
            'Desafío: 20 niveles cada vez más rápidos.',
            'Cada 2 niveles, una habilidad; entre rondas, la tienda.',
            'Si perdéis una ronda, vuelta al nivel 1.',
          ]
        : [
            'Campaña: llevad entre amigos vuestro propio restaurante. Comprad ingredientes, poned precios y cocinad cada día.',
            'Desafío: 20 niveles de cocina sin parar.',
            touch ? 'Joystick para moverte, botón naranja para la acción.' : 'WASD o flechas para moverte, Espacio para la acción.',
          ]
    ).join('\n');
    const helpText = txt(this, W / 2, heroY + 140 * s, help, clamp(17 * s, 13, 20), {
      wordWrap: { width: boxW - 32 },
      lineSpacing: 6,
    }).setOrigin(0.5, 0);
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, helpText.y - 14, boxW, helpText.height + 28);
    helpText.setDepth(1);

    let y = helpText.y + helpText.height + 30;
    const gap = 10;
    const cols = W >= 640 ? 4 : 2;
    const bh = 60 * s;
    const play = (modo: number) => this.scene.start('lobby', { modo });
    let rows: number;
    if (this.pickPlayers) {
      // Desafío: ¿cuántos jugadores? 4 botones en fila si cabe; si no, en 2x2.
      txt(this, W / 2, y, '¿Cuántos vais a cocinar?', 20 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);
      y += 34 * s;
      const bw = Math.min((Math.min(W - 32, 560) - gap * (cols - 1)) / cols, 200);
      const colors = [COLORS.orange, COLORS.green, COLORS.blue, 0xc77de0];
      [1, 2, 3, 4].forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = W / 2 + (col - (cols - 1) / 2) * (bw + gap);
        new Button(this, x, y + bh / 2 + row * (bh + gap), {
          w: bw,
          h: bh,
          color: colors[i],
          label: n === 1 ? '1 jugador' : `${n} jugadores`,
          fontSize: 20 * s,
          onPress: () => play(n),
        });
      });
      rows = Math.ceil(4 / cols);
    } else {
      // Campaña (lo principal) y Desafío.
      const bw = Math.min(W - 32, 420);
      new Button(this, W / 2, y + bh / 2, {
        w: bw,
        h: bh * 1.1,
        color: COLORS.green,
        label: 'Campaña',
        fontSize: 24 * s,
        onPress: () => this.scene.start('campaign'),
      });
      new Button(this, W / 2, y + bh * 1.6 + gap, {
        w: bw,
        h: bh,
        color: COLORS.orange,
        label: 'Desafío',
        fontSize: 22 * s,
        onPress: () => this.scene.restart({ desafio: true }),
      });
      rows = 2;
    }

    // Tu cocinero y ranking del grupo (en el Desafío, «Volver» en vez de «Tu cocinero»).
    const sw = Math.min(200, (Math.min(W - 32, 560) - gap) / 2);
    const sy = y + rows * (bh + gap) + 26 * s;
    new Button(this, W / 2 - sw / 2 - gap / 2, sy, {
      w: sw,
      h: 46 * s,
      color: this.pickPlayers ? COLORS.blue : 0x8d6e63,
      label: this.pickPlayers ? 'Volver' : 'Tu cocinero',
      fontSize: 18 * s,
      onPress: () => (this.pickPlayers ? this.scene.restart({ desafio: false }) : this.scene.start('look')),
    });
    new Button(this, W / 2 + sw / 2 + gap / 2, sy, {
      w: sw,
      h: 46 * s,
      color: 0xd4a017,
      label: 'Ranking',
      fontSize: 18 * s,
      onPress: () => this.scene.start('ranking'),
    });
    addSoundToggle(this, W - 24, 24, 3);
    // Versión, abajo a la izquierda (para saber qué hay desplegado).
    txt(this, 8, H - 6, __VERSION__, 11, { color: '#fff4dc66' }).setOrigin(0, 1);

    // En PC, también con las teclas 1-4.
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) play(n);
    });
    const restart = () => this.scene.restart({ desafio: this.pickPlayers });
    this.scale.once('resize', restart);
    this.events.once('shutdown', () => this.scale.off('resize', restart));
  }
}
