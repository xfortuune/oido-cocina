import Phaser from 'phaser';
import { formatDuration, getPerk, getRecipe, levelParams, newRecipesAt, ROLE_NAMES, ROLES, type Role, type RoomInfo } from '@hora-punta/shared';
import { getIdentity, isInDiscord, openInvite } from '../discord';
import { audio } from '../audio';
import { net, saveName, savedName, savedRecord } from '../net';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { addAvatar, loadAvatars } from '../ui/avatars';
import { Button } from '../ui/Button';

/** Textura del puesto que representa cada rol en su tarjeta. */
const ROLE_TILES: Record<Role, string> = {
  caja: 'tile_pase',
  plancha: 'tile_grill',
  montaje: 'tile_montaje',
  freidora: 'tile_fryer',
};

const ROLE_HELP: Record<Role, string> = {
  caja: 'Toma nota y entrega en el pase',
  plancha: 'Carne a la plancha',
  montaje: 'Monta las hamburguesas',
  freidora: 'Patatas y bebidas',
};

/**
 * Vestíbulo: quién está en la sala, quién lleva cada puesto, y empezar el turno.
 * En el modo de un jugador no se muestra: se empieza directamente.
 */
export class LobbyScene extends Phaser.Scene {
  private status = '';
  /** Modo elegido en el menú (solo cuenta al crear la sala). */
  private modo = 2;

  constructor() {
    super('lobby');
  }

  init(data: { modo?: number }): void {
    if (data?.modo) this.modo = data.modo;
  }

  create(): void {
    audio.music('menu');
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'playing') this.scene.start('kitchen');
      else if (info.phase === 'summary' && net.summary) this.scene.start('summary');
      else if (info.phase === 'perks') this.scene.start('perks');
      else if (info.phase === 'shop') this.scene.start('shop');
      else if (info.modo === 1) {
        // Solo: nada que repartir ni esperar.
        this.status = 'Preparando la cocina…';
        this.build();
        net.start();
      } else this.build();
    };
    const onLeft = () => {
      this.status = 'Se ha perdido la conexión con el servidor.';
      this.build();
    };
    net.on('room', onRoom);
    net.on('left', onLeft);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      net.off('room', onRoom);
      net.off('left', onLeft);
      this.scale.off('resize', this.build, this);
    });

    if (net.connected && net.info) {
      onRoom(net.info);
      return;
    }
    this.status = 'Conectando con la cocina…';
    this.build();
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const { join } = await getIdentity(savedName);
      // Una partida de un jugador es privada: sala propia aunque estés en un canal de voz con más gente.
      const sala = this.modo === 1 ? `${join.sala}-solo-${Math.random().toString(36).slice(2, 8)}` : join.sala;
      await net.connect({ ...join, sala, modo: this.modo });
      this.status = '';
    } catch (err) {
      console.error(err);
      this.status = `No se pudo conectar: ${err instanceof Error ? err.message : err}`;
      this.build();
    }
  }

  private build(): void {
    if (!sceneAlive(this)) return;
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.3);
    const info = net.info;

    let y = 16 * s;
    txt(this, W / 2, y, 'Sala de cocina', 34 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 7 * s }).setOrigin(0.5, 0);
    y += 46 * s;

    if (!info || info.modo === 1) {
      txt(this, W / 2, H / 2, this.status, 18 * s, { color: '#fff4dc', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5);
      if (!net.connected && !this.status.startsWith('Conectando')) {
        new Button(this, W / 2, H / 2 + 70 * s, {
          w: 220 * s,
          h: 56 * s,
          color: COLORS.orange,
          label: 'Reintentar',
          onPress: () => {
            this.status = 'Conectando con la cocina…';
            this.build();
            this.connect();
          },
        });
        new Button(this, W / 2, H / 2 + 140 * s, {
          w: 220 * s,
          h: 50 * s,
          color: COLORS.blue,
          label: 'Volver al menú',
          fontSize: 18 * s,
          onPress: () => this.scene.start('menu'),
        });
      }
      return;
    }

    loadAvatars(this, info.members, () => this.build());
    const salaLabel = isInDiscord() ? 'Canal de voz' : `Sala «${info.sala}»`;
    txt(this, W / 2, y, `${salaLabel} · partida de ${info.modo} jugadores`, 15 * s, { color: '#fff4dcbb' }).setOrigin(0.5, 0);
    y += 26 * s;

    // Cambiar cuántos jugadores se esperan (por si en Discord lo eligió otro)
    const modeW = 64 * s;
    [2, 3, 4].forEach((n, i) => {
      new Button(this, W / 2 + (i - 1) * (modeW + 8), y + 18 * s, {
        w: modeW,
        h: 38 * s,
        color: n === info.modo ? COLORS.orange : 0x6b5a4a,
        label: String(n),
        fontSize: 18 * s,
        onPress: () => net.setModo(n),
      });
    });
    y += 46 * s;

    // Nivel de la partida: se sube ganando rondas y se vuelve al 1 al perder una.
    const lp = levelParams(info.nivel, info.modo);
    const lvY = y + 20 * s;
    txt(this, W / 2, lvY, `Nivel ${info.nivel}`, 26 * s, { color: '#ffc93c', stroke: '#2b1d14', strokeThickness: 5 * s }).setOrigin(0.5);
    y += 44 * s;
    const fresh = newRecipesAt(info.nivel).map((id) => getRecipe(id).name);
    const record = savedRecord();
    const lvInfo =
      `Objetivo: ${lp.goal} pedidos en ${formatDuration(lp.duration)}${fresh.length ? ` · nueva: ${fresh.join(', ')}` : ''}` +
      (info.nivel === 1 && record ? `\nTu récord: nivel ${record} superado` : '') +
      (info.nivel > 1 ? `\nDinero ${info.dinero} · ${info.mejoras.length} ${info.mejoras.length === 1 ? 'mejora' : 'mejoras'}` : '');
    txt(this, W / 2, y, lvInfo, 13 * s, { color: '#fff4dcbb', align: 'center', wordWrap: { width: W - 30 } }).setOrigin(0.5, 0);
    y += (info.nivel > 1 || record ? 40 : 24) * s;

    const missing = info.modo - info.members.length;
    if (missing > 0) {
      txt(this, W / 2, y, `Esperando a ${missing} ${missing === 1 ? 'jugador' : 'jugadores'} más…`, 15 * s, { color: '#ffc93c' }).setOrigin(0.5, 0);
      y += 24 * s;
    }

    // Cocineros en la sala
    const boxW = Math.min(W - 24, W >= 900 ? 860 : 560);
    const anyPerks = info.members.some((m) => m.perks.length);
    const rowH = (anyPerks ? 46 : 30) * s;
    const listH = info.members.length * rowH + 16;
    const g = this.add.graphics();
    pixelPanel(g, W / 2 - boxW / 2, y, boxW, listH);
    info.members.forEach((m, i) => {
      const ry = y + 8 + i * rowH + (anyPerks ? 15 * s : rowH / 2);
      this.add.image(W / 2 - boxW / 2 + 22, ry + 8 * s, chefKey(m.look ?? m.color, 'down', 0)).setScale(Math.max(1, Math.round(1.6 * s))).setOrigin(0.5, 1);
      const roles = m.roles.length ? m.roles.map((r) => ROLE_NAMES[r]).join(', ') : 'sin puesto';
      const label = `${m.name}${m.id === net.id ? ' (tú)' : ''}`;
      const avatarSize = Math.round(22 * s);
      const avatar = addAvatar(this, m, W / 2 - boxW / 2 + 44 + avatarSize / 2, ry, avatarSize);
      const nameX = W / 2 - boxW / 2 + 44 + (avatar ? avatarSize + 8 : 0);
      txt(this, nameX, ry, label, 17 * s, { color: CHEF_COLORS[m.color][1] }).setOrigin(0, 0.5);
      const r = txt(this, W / 2 + boxW / 2 - 12, ry, roles, 13 * s).setOrigin(1, 0.5);
      if (r.width > boxW * 0.5) r.setScale((boxW * 0.5) / r.width);
      if (m.perks.length) {
        const names = m.perks.map((id) => getPerk(id)?.name ?? id);
        const pt = txt(this, nameX, ry + 14 * s, names.join(' · '), 11 * s, { color: '#ffc93c' });
        if (pt.width > boxW - (nameX - (W / 2 - boxW / 2)) - 10) pt.setScale((boxW - (nameX - (W / 2 - boxW / 2)) - 10) / pt.width);
      }
    });
    y += listH + 14 * s;

    // Puestos: toca uno para quedártelo
    txt(this, W / 2, y, 'Toca un puesto para quedártelo', 15 * s, { color: '#fff4dc' }).setOrigin(0.5, 0);
    y += 24 * s;
    const cols = W >= 900 ? 4 : 2;
    const gap = 10;
    const cardW = (boxW - gap * (cols - 1)) / cols;
    const cardH = 92 * s;
    ROLES.forEach((role, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = W / 2 - boxW / 2 + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      const owner = info.members.find((m) => m.roles.includes(role));
      const mine = owner?.id === net.id;
      const cg = this.add.graphics();
      pixelPanel(cg, cx, cy, cardW, cardH, mine ? 0xffe2b8 : COLORS.panel);
      this.add.image(cx + 26 * s, cy + cardH / 2, ROLE_TILES[role]).setScale(Math.max(2, Math.round(2.5 * s)));
      txt(this, cx + 50 * s, cy + 10 * s, ROLE_NAMES[role], 16 * s).setOrigin(0, 0);
      const help = txt(this, cx + 50 * s, cy + 32 * s, ROLE_HELP[role], 12 * s, { wordWrap: { width: cardW - 58 * s } });
      help.setAlpha(0.8);
      txt(this, cx + 50 * s, cy + cardH - 10 * s, owner ? owner.name : 'Libre', 14 * s, {
        color: owner ? CHEF_COLORS[owner.color][1] : '#999999',
      }).setOrigin(0, 1);
      const zone = this.add.zone(cx + cardW / 2, cy + cardH / 2, cardW, cardH).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => net.claim(role));
    });
    y += Math.ceil(ROLES.length / cols) * (cardH + gap) + 10 * s;

    const covered = ROLES.every((r) => info.members.some((m) => m.roles.includes(r)));
    const ready = covered && info.members.length >= info.modo;
    // En Discord el nombre es el de tu cuenta y la sala es el canal de voz: en vez de «Cambiar nombre», «Invitar».
    const discord = isInDiscord();
    const buttons = 3;
    const btnW = Math.min((boxW - 10 * (buttons - 1)) / buttons, 220);
    const btnY = Math.min(H - 40 * s, y + 34 * s);
    const bx = (i: number) => W / 2 + (i - (buttons - 1) / 2) * (btnW + 10);
    new Button(this, bx(0), btnY, {
      w: btnW,
      h: 56 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 18 * s,
      onPress: () => this.scene.start('menu'),
    });
    if (discord) new Button(this, bx(1), btnY, {
      w: btnW,
      h: 56 * s,
      color: 0x5865f2,
      label: 'Invitar',
      fontSize: 18 * s,
      onPress: () => void openInvite(),
    });
    else new Button(this, bx(1), btnY, {
      w: btnW,
      h: 56 * s,
      color: COLORS.blue,
      label: 'Cambiar nombre',
      fontSize: 18 * s,
      onPress: () => {
        const name = window.prompt('¿Cómo te llamas?', net.me?.name ?? '')?.trim();
        if (!name) return;
        saveName(name.slice(0, 20));
        net.rename(name.slice(0, 20));
      },
    });
    new Button(this, bx(buttons - 1), btnY, {
      w: btnW,
      h: 56 * s,
      color: ready ? COLORS.green : 0x8a8a8a,
      label: `¡Empezar nivel ${info.nivel}!`,
      fontSize: 20 * s,
      onPress: () => ready && net.start(),
    });
    if (missing > 0) {
      const hint = discord
        ? 'Pulsa «Invitar» para llamar a tus amigos: entrarán al canal de voz y a esta cocina.'
        : `Para que entren tus amigos, que abran este mismo enlace (sala «${info.sala}»).`;
      txt(this, W / 2, btnY + 40 * s, hint, 13 * s, {
        color: '#fff4dc99',
        align: 'center',
        wordWrap: { width: W - 30 },
      }).setOrigin(0.5, 0);
    }
  }
}
