import Phaser from 'phaser';
import {
  CAMPAIGN,
  ESTILO_NAMES,
  ESTILOS,
  expectedCustomers,
  expiringToday,
  getRecipe,
  getStock,
  menuOn,
  packPriceToday,
  priceAppeal,
  priceFactor,
  RECIPE_COST,
  recipeLearned,
  RECIPES,
  ROLE_NAMES,
  ROLES,
  serviceParams,
  SIDE_BASE,
  STOCK,
  stockCount,
  weekday,
  type Campaign,
  type DayReport,
  type RoomInfo,
  type StockId,
} from '@hora-punta/shared';
import { audio } from '../audio';
import { getIdentity, isInDiscord } from '../discord';
import { net, savedName } from '../net';
import { fillStack } from '../pixel/items';
import { CHEF_COLORS, chefKey } from '../pixel/sprites';
import { clamp, COLORS, drawBackground, pixelPanel, sceneAlive, txt } from '../theme';
import { addAvatar, loadAvatars } from '../ui/avatars';
import { Button } from '../ui/Button';
import { addSoundToggle } from '../ui/SoundToggle';

type Tab = 'hoy' | 'despensa' | 'carta' | 'banco';
const TABS: [Tab, string][] = [
  ['hoy', 'Hoy'],
  ['despensa', 'Despensa'],
  ['carta', 'Carta'],
  ['banco', 'Banco'],
];

/** Icono de cada ingrediente de la despensa. */
const STOCK_ICON: Record<StockId, string> = {
  pan: 'ing_pan_top',
  carne: 'ing_carne_cruda',
  queso: 'ing_queso',
  lechuga: 'ing_lechuga',
  tomate: 'ing_tomate',
  bacon: 'ing_bacon',
  patatas: 'side_patatas',
  refresco: 'side_vaso_cola',
};

/**
 * Campaña: el restaurante del grupo. Por la mañana, gestión (despensa, carta, banco y equipo);
 * cuando todos están listos, el servicio en la cocina; al acabar, el cierre con las cuentas del día.
 */
export class CampaignScene extends Phaser.Scene {
  private tab: Tab = 'hoy';
  private status = '';

  constructor() {
    super('campaign');
  }

  create(): void {
    audio.music('menu');
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'playing') this.scene.start('kitchen');
      else this.build();
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
    if (net.connected && net.info?.juego === 'campana') {
      onRoom(net.info);
      return;
    }
    this.status = 'Abriendo el restaurante…';
    this.build();
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      if (net.connected) await net.leave();
      const { join, inDiscord } = await getIdentity(savedName);
      // Un restaurante por servidor de Discord; en el navegador, uno por sala (?sala=…).
      const key = inDiscord ? (join.grupo ?? 'discord') : `web-${join.sala}`;
      await net.connect({ ...join, sala: `campana-${key}`, grupo: key, juego: 'campana' });
      this.status = '';
    } catch (err) {
      console.error(err);
      const e = err as { code?: number; message?: string };
      this.status =
        e?.code === 404
          ? 'No se pudo conectar: en esta dirección no está el servidor del juego.'
          : `No se pudo conectar. ${e?.message || ''}${e?.code ? ` (código ${e.code})` : ''}`;
      this.build();
    }
  }

  // ---------------------------------------------------------------- dibujo

  private build(): void {
    if (!sceneAlive(this)) return;
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    drawBackground(this);
    const s = clamp(Math.min(W / 480, H / 760), 0.7, 1.25);
    const info = net.info;
    const c = info?.campana;
    if (!info || !c) {
      txt(this, W / 2, H / 2 - 30, this.status || 'Conectando…', 17 * s, { color: '#fff4dc', align: 'center', wordWrap: { width: W - 40 } }).setOrigin(0.5);
      if (!net.connected && this.status && !this.status.startsWith('Abriendo')) {
        new Button(this, W / 2, H / 2 + 40 * s, { w: 220 * s, h: 52 * s, color: COLORS.orange, label: 'Reintentar', onPress: () => this.retry() });
        new Button(this, W / 2, H / 2 + 104 * s, { w: 220 * s, h: 48 * s, color: COLORS.blue, label: 'Volver al menú', fontSize: 17 * s, onPress: () => this.scene.start('menu') });
      }
      return;
    }
    loadAvatars(this, info.members, () => this.build());
    addSoundToggle(this, W - 22, 22, 2);
    if (info.phase === 'cierre' && c.lastReport) this.buildReport(c, c.lastReport, W, H, s);
    else this.buildMorning(info, c, W, H, s);
  }

  private retry(): void {
    this.status = 'Abriendo el restaurante…';
    this.build();
    void this.connect();
  }

  /** Cabecera: día, dinero, reputación y deuda. */
  private header(c: Campaign, W: number, s: number, title: string): number {
    let y = 10 * s;
    txt(this, W / 2, y, title, 28 * s, { color: '#ff8a3d', stroke: '#2b1d14', strokeThickness: 6 }).setOrigin(0.5, 0);
    y += 40 * s;
    const fs = 18 * s;
    const items: [string, string, string][] = [
      ['icon_coin', String(c.money), '#ffd23f'],
      ['icon_star', String(c.reputation), '#fff4dc'],
    ];
    const cell = Math.min(130 * s, (W - 20) / 3);
    items.forEach(([icon, value, color], i) => {
      const x = W / 2 + (i - 1) * cell;
      this.add.image(x - 6, y + fs * 0.6, icon).setScale(Math.max(2, Math.round(2.5 * s))).setOrigin(1, 0.5);
      txt(this, x, y, value, fs, { color, stroke: '#2b1d14', strokeThickness: 4 }).setOrigin(0, 0);
    });
    txt(this, W / 2 + cell, y, `Deuda ${c.debt}`, fs * 0.85, {
      color: c.debt > CAMPAIGN.debtLimit * 0.7 ? '#ff6b5b' : '#fff4dcbb',
      stroke: '#2b1d14',
      strokeThickness: 4,
    }).setOrigin(0.5, 0);
    return y + fs * 1.6;
  }

  private buildMorning(info: RoomInfo, c: Campaign, W: number, H: number, s: number): void {
    let y = this.header(c, W, s, `Día ${c.day} · ${weekday(c.day)}`);
    const boxW = Math.min(W - 16, 620);
    const x0 = W / 2 - boxW / 2;

    // Pestañas
    const tabW = (boxW - 18) / 4;
    TABS.forEach(([id, label], i) => {
      new Button(this, x0 + tabW / 2 + i * (tabW + 6), y + 18 * s, {
        w: tabW,
        h: 36 * s,
        color: this.tab === id ? COLORS.orange : 0x6b5a4a,
        label,
        fontSize: 15 * s,
        onPress: () => {
          this.tab = id;
          this.build();
        },
      });
    });
    y += 44 * s;

    const bottom = H - 70 * s;
    const g = this.add.graphics();
    pixelPanel(g, x0, y, boxW, bottom - y - 8);
    const area = { x: x0 + 12, y: y + 10, w: boxW - 24, h: bottom - y - 28 };
    if (this.tab === 'hoy') this.tabToday(info, c, area, s);
    else if (this.tab === 'despensa') this.tabPantry(c, area, s);
    else if (this.tab === 'carta') this.tabMenu(c, area, s);
    else this.tabBank(c, area, s);

    // Abajo: salir y abrir el restaurante (cuando todos están listos)
    const me = net.me;
    const readyN = info.members.filter((m) => m.ready).length;
    const bw = Math.min((boxW - 10) / 2, 260);
    const by = H - 38 * s;
    new Button(this, W / 2 - bw / 2 - 5, by, {
      w: bw,
      h: 52 * s,
      color: COLORS.orange,
      label: 'Salir',
      fontSize: 18 * s,
      onPress: () => {
        void net.leave();
        this.scene.start('menu');
      },
    });
    const solo = info.members.length === 1;
    new Button(this, W / 2 + bw / 2 + 5, by, {
      w: bw,
      h: 52 * s,
      color: me?.ready ? 0x8a8a8a : COLORS.green,
      label: solo ? '¡Abrir el restaurante!' : me?.ready ? `Listos ${readyN}/${info.members.length}` : '¡Abrir! (listo)',
      fontSize: 17 * s,
      onPress: () => net.toggleReady(),
    });
  }

  // ---------------------------------------------------------------- pestaña: hoy

  private tabToday(info: RoomInfo, c: Campaign, a: Area, s: number): void {
    const fs = 14 * s;
    let y = a.y;
    const players = Math.max(1, info.members.length);
    const params = serviceParams(c, players, info.estilo);
    const expected = expectedCustomers(params);
    const burgers = burgersPossible(c);
    const lines: [string, string][] = [
      ['Clientes previstos', `unos ${expected}`],
      ['Hamburguesas que da la despensa', `${burgers}`],
      ['En la carta', menuOn(c).map((m) => getRecipe(m.recipeId).name).join(', ')],
      ['Gastos del día', `alquiler ${CAMPAIGN.rent} + intereses ${Math.ceil(c.debt * CAMPAIGN.interest)}`],
    ];
    const prev = c.lastReport;
    if (prev && !prev.bankrupt) {
      const result = prev.sales + prev.tips + prev.penalties - prev.purchases - prev.rent - prev.interest;
      lines.push(['Ayer', `${prev.served} servidos · ${result >= 0 ? '+' : ''}${result}`]);
    }
    for (const [label, value] of lines) {
      txt(this, a.x, y, label, fs * 0.85).setAlpha(0.65);
      const v = txt(this, a.x + a.w, y, value, fs).setOrigin(1, 0);
      if (v.width > a.w * 0.55) v.setScale((a.w * 0.55) / v.width);
      y += fs * 1.6;
    }

    // Avisos
    const warnings: string[] = [];
    if (burgers < expected) warnings.push(`La despensa no llega para unos ${expected} clientes: compra más en «Despensa».`);
    for (const st of STOCK) {
      const exp = expiringToday(c, st.id);
      if (exp > 0) warnings.push(`Caduca hoy: ${st.name.toLowerCase()} ×${exp}`);
    }
    for (const m of menuOn(c)) {
      const missing = needsOf(m.recipeId).find((id) => stockCount(c, id) === 0);
      if (missing) warnings.push(`Sin ${getStock(missing)!.name.toLowerCase()}: no se podrá hacer ${getRecipe(m.recipeId).name}.`);
    }
    for (const w of warnings.slice(0, 4)) {
      const t = txt(this, a.x, y, `• ${w}`, fs * 0.85, { color: '#c0392b', wordWrap: { width: a.w } });
      y += t.height + 4;
    }
    if (!warnings.length) {
      txt(this, a.x, y, 'Todo listo para abrir.', fs * 0.9, { color: '#2e8a34' });
      y += fs * 1.5;
    }
    y += 8 * s;

    // Equipo: quién está, puestos y modo
    txt(this, a.x, y, 'Equipo de hoy', fs).setAlpha(0.7);
    y += fs * 1.5;
    const rowH = 30 * s;
    for (const m of info.members) {
      const cy = y + rowH / 2;
      this.add.image(a.x + 10, cy + 9 * s, chefKey(m.look ?? m.color, 'down', 0)).setScale(Math.max(1, Math.round(1.4 * s))).setOrigin(0.5, 1);
      const av = addAvatar(this, m, a.x + 34, cy, Math.round(18 * s));
      const nx = a.x + 30 + (av ? 22 * s : 0);
      txt(this, nx, cy, `${m.name}${m.id === net.id ? ' (tú)' : ''}${m.ready ? ' ✓' : ''}`, fs, { color: CHEF_COLORS[m.color][1] }).setOrigin(0, 0.5);
      const roles = m.roles.length === 4 ? 'Toda la cocina' : m.roles.map((r) => ROLE_NAMES[r]).join(', ');
      const rt = txt(this, a.x + a.w, cy, roles, fs * 0.8).setOrigin(1, 0.5);
      if (rt.width > a.w * 0.5) rt.setScale((a.w * 0.5) / rt.width);
      y += rowH;
    }
    if (info.members.length > 1) {
      y += 6 * s;
      const ew = Math.min(150 * s, (a.w - 8) / 2);
      ESTILOS.forEach((e, i) => {
        new Button(this, a.x + a.w / 2 + (i - 0.5) * (ew + 8), y + 16 * s, {
          w: ew,
          h: 32 * s,
          color: info.estilo === e ? (e === 'libre' ? COLORS.blue : COLORS.green) : 0x8a7a6a,
          label: ESTILO_NAMES[e],
          fontSize: 14 * s,
          onPress: () => net.setEstilo(e),
        });
      });
      y += 40 * s;
      if (info.estilo === 'rol') {
        // Toca un puesto para quedártelo
        const pw = (a.w - 18) / 4;
        ROLES.forEach((role, i) => {
          const owner = info.members.find((m) => m.roles.includes(role));
          new Button(this, a.x + pw / 2 + i * (pw + 6), y + 16 * s, {
            w: pw,
            h: 32 * s,
            color: owner?.id === net.id ? COLORS.orange : 0x8a7a6a,
            label: ROLE_NAMES[role].split(' ')[0],
            fontSize: 13 * s,
            onPress: () => net.claim(role),
          });
        });
        y += 38 * s;
        txt(this, a.x + a.w / 2, y, 'Toca un puesto para quedártelo', fs * 0.75).setOrigin(0.5, 0).setAlpha(0.6);
      }
    } else {
      txt(this, a.x, y + 4, isInDiscord() ? 'Tus amigos del canal de voz pueden unirse a este restaurante.' : 'Para jugar con amigos, que abran la misma dirección (misma sala).', fs * 0.8, {
        wordWrap: { width: a.w },
      }).setAlpha(0.7);
    }
  }

  // ---------------------------------------------------------------- pestaña: despensa

  private tabPantry(c: Campaign, a: Area, s: number): void {
    const rowH = Math.min(54 * s, a.h / STOCK.length);
    const fs = Math.min(15 * s, rowH * 0.32);
    STOCK.forEach((st, i) => {
      const y = a.y + i * rowH;
      const cy = y + rowH / 2;
      this.add.image(a.x + 14, cy, STOCK_ICON[st.id]).setScale(Math.max(1, Math.round(rowH / 22)));
      txt(this, a.x + 34, cy - fs * 0.65, st.name, fs).setOrigin(0, 0.5);
      const have = stockCount(c, st.id);
      const exp = expiringToday(c, st.id);
      txt(this, a.x + 34, cy + fs * 0.6, `Tienes ${have}${exp ? ` · caducan hoy ${exp}` : ''} · dura ${st.life} ${st.life === 1 ? 'día' : 'días'}`, fs * 0.72, {
        color: exp ? '#c0392b' : '#6b5a4a',
      }).setOrigin(0, 0.5);
      const price = packPriceToday(c, st.id);
      const f = priceFactor(c.day, st.id);
      const trend = f > 1.08 ? 'caro hoy' : f < 0.92 ? 'barato hoy' : '';
      if (trend) txt(this, a.x + a.w - 118 * s, cy, trend, fs * 0.7, { color: f > 1 ? '#c0392b' : '#2e8a34' }).setOrigin(1, 0.5);
      new Button(this, a.x + a.w - 54 * s, cy, {
        w: 106 * s,
        h: rowH * 0.72,
        color: c.money >= price ? COLORS.green : 0x9a8a7a,
        label: `+${st.pack} · ${price}`,
        fontSize: fs * 0.95,
        onPress: () => {
          if (c.money < price) return;
          audio.sfx('coin');
          net.campaign('c:buy', st.id);
        },
      });
      if (i < STOCK.length - 1) this.add.rectangle(a.x, y + rowH, a.w, 1, 0x2b1d14, 0.12).setOrigin(0);
    });
  }

  // ---------------------------------------------------------------- pestaña: carta

  private tabMenu(c: Campaign, a: Area, s: number): void {
    const rows = RECIPES.length + 2;
    const rowH = Math.min(56 * s, a.h / rows);
    const fs = Math.min(15 * s, rowH * 0.3);
    const priceRow = (y: number, what: string, label: string, base: number, price: number, art: (cx: number, cy: number) => void, on: boolean | null) => {
      const cy = y + rowH / 2;
      art(a.x + 16, cy);
      txt(this, a.x + 38, cy - fs * 0.62, label, fs).setOrigin(0, 0.5);
      const appeal = priceAppeal(base, price);
      const hint = appeal > 1.25 ? 'muy barato' : appeal > 1.05 ? 'barato' : appeal < 0.5 ? 'carísimo' : appeal < 0.85 ? 'caro' : 'precio justo';
      txt(this, a.x + 38, cy + fs * 0.6, `normal ${base} · ${hint}`, fs * 0.72, { color: appeal < 0.85 ? '#c0392b' : '#6b5a4a' }).setOrigin(0, 0.5);
      // − precio +
      const bx = a.x + a.w - (on === null ? 60 : 130) * s;
      const step = (d: number) => net.campaign('c:price', { id: what, price: price + d });
      new Button(this, bx - 34 * s, cy, { w: 30 * s, h: rowH * 0.62, color: COLORS.blue, label: '−', fontSize: fs * 1.2, onPress: () => step(-1) });
      txt(this, bx, cy, String(price), fs * 1.1).setOrigin(0.5);
      this.add.image(bx + 13 * s, cy, 'icon_coin').setScale(Math.max(1, Math.round(1.5 * s)));
      new Button(this, bx + 40 * s, cy, { w: 30 * s, h: rowH * 0.62, color: COLORS.blue, label: '+', fontSize: fs * 1.2, onPress: () => step(1) });
      if (on !== null) {
        new Button(this, a.x + a.w - 34 * s, cy, {
          w: 64 * s,
          h: rowH * 0.62,
          color: on ? COLORS.green : 0x8a7a6a,
          label: on ? 'En carta' : 'Fuera',
          fontSize: fs * 0.75,
          onPress: () => net.campaign('c:menu', { id: what, on: !on }),
        });
      }
    };
    RECIPES.forEach((r, i) => {
      const y = a.y + i * rowH;
      const cy = y + rowH / 2;
      const burger = (cx: number, by: number) => {
        const cont = this.add.container(cx, by + rowH * 0.32).setScale(Math.max(1, Math.round(rowH / 30)));
        fillStack(cont, r.layers);
      };
      if (recipeLearned(c, r.id)) {
        const item = c.menu.find((m) => m.recipeId === r.id)!;
        priceRow(y, r.id, r.name, r.price, item.price, burger, item.on);
      } else {
        burger(a.x + 16, cy);
        txt(this, a.x + 38, cy - fs * 0.62, r.name, fs).setOrigin(0, 0.5).setAlpha(0.6);
        const needs = needsOf(r.id).map((id) => getStock(id)!.name.toLowerCase());
        txt(this, a.x + 38, cy + fs * 0.6, `lleva ${needs.join(', ')}`, fs * 0.7, { color: '#6b5a4a' }).setOrigin(0, 0.5);
        const cost = RECIPE_COST[r.id];
        new Button(this, a.x + a.w - 70 * s, cy, {
          w: 136 * s,
          h: rowH * 0.66,
          color: c.money >= cost ? 0xd4a017 : 0x9a8a7a,
          label: `Aprender · ${cost}`,
          fontSize: fs * 0.85,
          onPress: () => {
            if (c.money < cost) return;
            audio.sfx('perk');
            net.campaign('c:learn', r.id);
          },
        });
      }
      this.add.rectangle(a.x, y + rowH, a.w, 1, 0x2b1d14, 0.12).setOrigin(0);
    });
    const yS = a.y + RECIPES.length * rowH;
    priceRow(yS, 'fries', 'Patatas fritas', SIDE_BASE.fries, c.sides.fries, (cx, cy) => this.add.image(cx, cy, 'side_fritas').setScale(Math.max(1, Math.round(rowH / 26))), null);
    priceRow(yS + rowH, 'drink', 'Refresco', SIDE_BASE.drink, c.sides.drink, (cx, cy) => this.add.image(cx, cy, 'side_vaso_naranja').setScale(Math.max(1, Math.round(rowH / 28))), null);
  }

  // ---------------------------------------------------------------- pestaña: banco

  private tabBank(c: Campaign, a: Area, s: number): void {
    const fs = 15 * s;
    let y = a.y;
    const lines: [string, string][] = [
      ['Deuda', String(c.debt)],
      ['Interés', `${Math.round(CAMPAIGN.interest * 100)} % al día (hoy ${Math.ceil(c.debt * CAMPAIGN.interest)})`],
      ['Límite', `con más de ${CAMPAIGN.debtLimit} de deuda al cerrar, bancarrota`],
      ['Alquiler del local', `${CAMPAIGN.rent} al día`],
    ];
    for (const [label, value] of lines) {
      txt(this, a.x, y, label, fs * 0.85).setAlpha(0.65);
      const v = txt(this, a.x + a.w, y, value, fs * 0.9).setOrigin(1, 0);
      if (v.width > a.w * 0.65) v.setScale((a.w * 0.65) / v.width);
      y += fs * 1.7;
    }
    y += 10 * s;
    const bw = (a.w - 10) / 2;
    const canLoan = (n: number) => c.debt + n <= CAMPAIGN.debtLimit - 50;
    const row = (label1: string, ok1: boolean, f1: () => void, label2: string, ok2: boolean, f2: () => void, color: number) => {
      new Button(this, a.x + bw / 2, y + 22 * s, { w: bw, h: 44 * s, color: ok1 ? color : 0x9a8a7a, label: label1, fontSize: 15 * s, onPress: () => ok1 && f1() });
      new Button(this, a.x + bw * 1.5 + 10, y + 22 * s, { w: bw, h: 44 * s, color: ok2 ? color : 0x9a8a7a, label: label2, fontSize: 15 * s, onPress: () => ok2 && f2() });
      y += 54 * s;
    };
    row('Pedir 50', canLoan(50), () => net.campaign('c:loan', 50), 'Pedir 100', canLoan(100), () => net.campaign('c:loan', 100), COLORS.blue);
    row('Devolver 50', c.debt > 0 && c.money > 0, () => net.campaign('c:repay', 50), 'Devolverlo todo', c.debt > 0 && c.money > 0, () => net.campaign('c:repay', c.debt), COLORS.green);
    y += 10 * s;
    const notes = [
      'Si un día acaba en negativo, el banco os presta lo que falte con un 10 % de comisión.',
      `Salón de la fama: mejor día alcanzado ${c.fame.mejorDia} · bancarrotas ${c.fame.quiebras}.`,
    ];
    for (const n of notes) {
      const t = txt(this, a.x, y, n, fs * 0.8, { wordWrap: { width: a.w } }).setAlpha(0.75);
      y += t.height + 8;
    }
  }

  // ---------------------------------------------------------------- cierre

  private buildReport(c: Campaign, r: DayReport, W: number, H: number, s: number): void {
    let y = this.header(c, W, s, r.bankrupt ? '¡Bancarrota!' : `Cierre del día ${r.day}`);
    const boxW = Math.min(W - 16, 520);
    const x0 = W / 2 - boxW / 2;
    const fs = clamp(15 * s, 12, 18);
    const lineH = fs * 1.55;
    const result = r.sales + r.tips + r.penalties - r.purchases - r.rent - r.interest;
    const lines: [string, number | string, string?][] = [
      ['Clientes servidos', `${r.served} (${r.perfect} perfectos)`],
      ['Clientes perdidos', r.lost],
      ['Ventas', r.sales, 'plus'],
      ['Propinas', r.tips, 'plus'],
      ['Multas y desperdicio', r.penalties, 'minus'],
      ['Compras de la mañana', -r.purchases, 'minus'],
      ['Alquiler', -r.rent, 'minus'],
      ['Intereses', -r.interest, 'minus'],
      ['Resultado del día', result, result >= 0 ? 'plus' : 'minus'],
    ];
    const extraLines = (r.expired.length ? 1 : 0) + (r.emergencyLoan ? 1 : 0) + 1;
    const panelH = (lines.length + extraLines) * lineH + 24 + (r.bankrupt ? 60 * s : 0);
    const g = this.add.graphics();
    pixelPanel(g, x0, y, boxW, panelH);
    let ly = y + 12;
    lines.forEach(([label, value, kind], i) => {
      const bold = i === lines.length - 1;
      if (bold) {
        this.add.rectangle(x0 + 12, ly - 4, boxW - 24, 1, 0x2b1d14, 0.3).setOrigin(0);
      }
      txt(this, x0 + 14, ly, label, fs * (bold ? 1 : 0.9));
      const v = typeof value === 'number' ? `${value > 0 && kind === 'plus' ? '+' : ''}${value}` : value;
      txt(this, x0 + boxW - 14, ly, v, fs * (bold ? 1.05 : 0.9), {
        color: kind === 'plus' ? '#2e8a34' : kind === 'minus' && Number(value) < 0 ? '#c0392b' : '#2b1d14',
      }).setOrigin(1, 0);
      ly += lineH;
    });
    const repDiff = r.repAfter - r.repBefore;
    txt(this, x0 + 14, ly, `Reputación ${r.repBefore} → ${r.repAfter}${r.repFromPrices ? ` (precios ${r.repFromPrices > 0 ? '+' : ''}${r.repFromPrices})` : ''}`, fs * 0.9, {
      color: repDiff >= 0 ? '#2e8a34' : '#c0392b',
    });
    ly += lineH;
    if (r.expired.length) {
      const t = `Caducado: ${r.expired.map((e) => `${getStock(e.id)!.name.toLowerCase()} ×${e.qty}`).join(', ')}`;
      const et = txt(this, x0 + 14, ly, t, fs * 0.85, { color: '#c0392b' });
      if (et.width > boxW - 28) et.setScale((boxW - 28) / et.width);
      ly += lineH;
    }
    if (r.emergencyLoan) {
      txt(this, x0 + 14, ly, `El día acabó en negativo: préstamo de ${r.emergencyLoan} (con comisión)`, fs * 0.85, { color: '#c0392b', wordWrap: { width: boxW - 28 } });
      ly += lineH;
    }
    if (r.bankrupt) {
      txt(this, x0 + 14, ly + 4, `La deuda (${r.debtAfter}) pasó del límite de ${CAMPAIGN.debtLimit}. El restaurante cierra y empezáis de nuevo. Mejor día: ${c.fame.mejorDia}.`, fs * 0.9, {
        color: '#c0392b',
        wordWrap: { width: boxW - 28 },
      });
    }
    y += panelH + 16 * s;

    if (r.bankrupt) audio.sfx('runOver');
    const by = Math.min(H - 40 * s, y + 30 * s);
    new Button(this, W / 2, by, {
      w: Math.min(boxW, 320),
      h: 54 * s,
      color: COLORS.green,
      label: r.bankrupt ? 'Empezar de nuevo' : `Empezar el día ${c.day}`,
      fontSize: 19 * s,
      onPress: () => net.campaign('c:next'),
    });
  }
}

interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ingredientes de la despensa que lleva una receta. */
function needsOf(recipeId: string): StockId[] {
  const out = new Set<StockId>();
  for (const l of getRecipe(recipeId).layers) out.add(l === 'carne' ? 'carne' : (l as StockId));
  return [...out];
}

/** Cuántas hamburguesas de la carta (mezcladas a partes iguales) da la despensa. */
function burgersPossible(c: Campaign): number {
  const items = menuOn(c);
  if (!items.length) return 0;
  const need: Partial<Record<StockId, number>> = {};
  for (const m of items) {
    for (const l of getRecipe(m.recipeId).layers) {
      const id = l as StockId;
      need[id] = (need[id] ?? 0) + 1 / items.length;
    }
  }
  let best = Infinity;
  for (const [id, n] of Object.entries(need)) best = Math.min(best, Math.floor(stockCount(c, id as StockId) / (n as number)));
  return Number.isFinite(best) ? best : 0;
}
