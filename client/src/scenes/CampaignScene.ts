import Phaser from 'phaser';
import {
  CAMPAIGN,
  chefPoints,
  contestAvailable,
  contestLevel,
  contestParams,
  CONTEST_PRIZE,
  currentChapter,
  getPerk,
  perkCount,
  TRAINABLE,
  XP_PER_POINT,
  decorAppeal,
  hasStaff,
  LOCAL_UPGRADES,
  STAFF,
  wagesPerDay,
  type LocalKind,
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

type Tab = 'hoy' | 'misiones' | 'despensa' | 'carta' | 'personal' | 'local' | 'banco';
const TABS: [Tab, string][] = [
  ['hoy', 'Hoy'],
  ['misiones', 'Misiones'],
  ['despensa', 'Despensa'],
  ['carta', 'Carta'],
  ['personal', 'Personal'],
  ['local', 'Local'],
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
  /** Pestaña «Local»: mejoras de cocina o decoración. */
  private localKind: LocalKind = 'cocina';
  /** Pestaña «Personal»: empleados o formación de vuestros cocineros. */
  private staffKind: 'empleados' | 'cocineros' = 'empleados';
  /** Formación: habilidad seleccionada para ver su descripción. */
  private selectedPerk = TRAINABLE[0].id;
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
    // Capítulo completado en plena gestión (por ejemplo, al devolver la deuda).
    const onChapter = (d: { n: number; title: string; reward: number }) => this.toast(`¡Capítulo ${d.n} completado! +${d.reward}`, d.title);
    net.on('c:chapter', onChapter);
    this.events.once('shutdown', () => net.off('c:chapter', onChapter));
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

    // Pestañas: en una fila si caben; si no, en dos de tres.
    const perRow = boxW >= 560 ? TABS.length : 4;
    const tabW = (boxW - 6 * (perRow - 1)) / perRow;
    const tabH = 34 * s;
    TABS.forEach(([id, label], i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      new Button(this, x0 + tabW / 2 + col * (tabW + 6), y + tabH / 2 + row * (tabH + 6), {
        w: tabW,
        h: tabH,
        color: this.tab === id ? COLORS.orange : 0x6b5a4a,
        label,
        fontSize: 15 * s,
        onPress: () => {
          this.tab = id;
          this.build();
        },
      });
    });
    y += Math.ceil(TABS.length / perRow) * (tabH + 6) + 4;

    const bottom = H - 70 * s;
    const g = this.add.graphics();
    pixelPanel(g, x0, y, boxW, bottom - y - 8);
    const area = { x: x0 + 12, y: y + 10, w: boxW - 24, h: bottom - y - 28 };
    if (this.tab === 'hoy') this.tabToday(info, c, area, s);
    else if (this.tab === 'despensa') this.tabPantry(c, area, s);
    else if (this.tab === 'carta') this.tabMenu(c, area, s);
    else if (this.tab === 'misiones') this.tabMissions(c, area, s);
    else if (this.tab === 'personal') (this.staffKind === 'empleados' ? this.tabStaff(c, area, s) : this.tabChefs(info, c, area, s));
    else if (this.tab === 'local') this.tabLocal(c, area, s);
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
      ['Capítulo', currentChapter(c) ? `${c.chapter}: ${currentChapter(c)!.title}` : 'todos completados'],
      ...(c.contestToday
        ? ([['Hoy', 'concurso de cocina']] as [string, string][])
        : c.activeMission
          ? ([['Encargo de hoy', c.activeMission.title]] as [string, string][])
          : []),
      ['En la carta', menuOn(c).map((m) => getRecipe(m.recipeId).name).join(', ')],
      ...(c.staff.length ? ([['Personal', STAFF.filter((x) => c.staff.includes(x.id)).map((x) => x.name).join(', ')]] as [string, string][]) : []),
      ...(decorAppeal(c) ? ([['Decoración', `${Math.round(decorAppeal(c) * 100)} % más clientes`]] as [string, string][]) : []),
      ['Gastos del día', `alquiler ${CAMPAIGN.rent} + intereses ${Math.ceil(c.debt * CAMPAIGN.interest)}${wagesPerDay(c) ? ` + sueldos ${wagesPerDay(c)}` : ''}`],
    ];
    const prev = c.lastReport;
    if (prev && !prev.bankrupt) {
      const result = dayResult(prev);
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

  // ---------------------------------------------------------------- pestaña: personal

  /** Empleados / Cocineros, arriba de la pestaña «Personal». Devuelve dónde empieza el contenido. */
  private staffToggle(a: Area, s: number): number {
    const sw = (a.w - 8) / 2;
    (['empleados', 'cocineros'] as const).forEach((k, i) => {
      new Button(this, a.x + sw / 2 + i * (sw + 8), a.y + 16 * s, {
        w: sw,
        h: 32 * s,
        color: this.staffKind === k ? COLORS.blue : 0x8a7a6a,
        label: k === 'empleados' ? 'Empleados' : 'Vuestros cocineros',
        fontSize: 14 * s,
        onPress: () => {
          this.staffKind = k;
          this.build();
        },
      });
    });
    return a.y + 40 * s;
  }

  private tabStaff(c: Campaign, a: Area, s: number): void {
    const fs = 15 * s;
    const y0 = this.staffToggle(a, s);
    txt(this, a.x, y0, `Sueldos: ${wagesPerDay(c)} al día. Se pagan al cerrar.`, fs * 0.85).setAlpha(0.7);
    const top = y0 + fs * 1.8;
    const rowH = Math.min(80 * s, (a.h - (top - a.y)) / STAFF.length);
    STAFF.forEach((st, i) => {
      const y = top + i * rowH;
      const hired = hasStaff(c, st.id);
      if (hired) this.add.rectangle(a.x - 4, y, a.w + 8, rowH - 4, 0xd9f2d0).setOrigin(0);
      txt(this, a.x + 4, y + 6, `${st.name} · ${st.wage} al día`, fs);
      txt(this, a.x + 4, y + 6 + fs * 1.25, st.description, fs * 0.78, { wordWrap: { width: a.w - 130 * s } }).setAlpha(0.8);
      new Button(this, a.x + a.w - 58 * s, y + rowH / 2 - 2, {
        w: 112 * s,
        h: 36 * s,
        color: hired ? COLORS.red : COLORS.green,
        label: hired ? 'Despedir' : 'Contratar',
        fontSize: fs * 0.9,
        onPress: () => net.campaign(hired ? 'c:fire' : 'c:hire', st.id),
      });
      this.add.rectangle(a.x, y + rowH - 2, a.w, 1, 0x2b1d14, 0.12).setOrigin(0);
    });
  }

  // ---------------------------------------------------------------- pestaña: personal → cocineros

  private tabChefs(info: RoomInfo, c: Campaign, a: Area, s: number): void {
    const fs = 15 * s;
    let y = this.staffToggle(a, s);
    const intro = txt(this, a.x, y, `Cada servicio da experiencia según lo que aporta cada uno. Cada ${XP_PER_POINT} de experiencia, un punto para aprender una habilidad para siempre.`, fs * 0.78, {
      wordWrap: { width: a.w },
    }).setAlpha(0.75);
    y += intro.height + 8;
    const me = net.me;
    const myKey = me ? chefKeyOf(me, info) : '';
    // Los demás: resumen
    for (const m of info.members) {
      const t = c.chefs[chefKeyOf(m, info)] ?? { name: m.name, xp: 0, perks: [] };
      const mine = m.id === net.id;
      const perks = t.perks.length ? countPerks(t.perks) : 'sin habilidades todavía';
      txt(this, a.x, y, `${m.name}${mine ? ' (tú)' : ''} · ${t.xp} exp · ${chefPoints(t)} ${chefPoints(t) === 1 ? 'punto' : 'puntos'}`, fs * 0.9, {
        color: CHEF_COLORS[m.color][1],
      });
      const pt = txt(this, a.x, y + fs * 1.15, perks, fs * 0.72);
      if (pt.width > a.w) pt.setScale(a.w / pt.width);
      y += fs * 2.5;
    }
    // Tu cocinero: cuadrícula de habilidades; la elegida se explica abajo con su botón.
    const mine = c.chefs[myKey] ?? { name: me?.name ?? '', xp: 0, perks: [] };
    const points = chefPoints(mine);
    y += 4;
    txt(this, a.x, y, points > 0 ? `Tienes ${points} ${points === 1 ? 'punto' : 'puntos'}: elige qué aprender` : 'Aún no tienes puntos de formación', fs * 0.85, {
      color: points > 0 ? '#2e8a34' : '#6b5a4a',
    });
    y += fs * 1.5;
    const cols = 2;
    const gap = 6;
    const cw = (a.w - gap) / cols;
    const ch = 30 * s;
    TRAINABLE.forEach((perk, i) => {
      const have = perkCount(mine.perks, perk.id);
      const x = a.x + (i % cols) * (cw + gap) + cw / 2;
      const cy = y + Math.floor(i / cols) * (ch + gap) + ch / 2;
      new Button(this, x, cy, {
        w: cw,
        h: ch,
        color: this.selectedPerk === perk.id ? COLORS.orange : have >= perk.max ? 0x5e8f52 : 0x8a7a6a,
        label: `${perk.short}${have ? ` ${have}/${perk.max}` : ''}`,
        fontSize: fs * 0.8,
        onPress: () => {
          this.selectedPerk = perk.id;
          this.build();
        },
      });
    });
    y += Math.ceil(TRAINABLE.length / cols) * (ch + gap) + 6;
    const sel = TRAINABLE.find((p) => p.id === this.selectedPerk) ?? TRAINABLE[0];
    const have = perkCount(mine.perks, sel.id);
    const can = points > 0 && have < sel.max;
    txt(this, a.x, y, `${sel.name}${have ? ` (tienes ${have} de ${sel.max})` : ''}`, fs);
    const d = txt(this, a.x, y + fs * 1.3, sel.description, fs * 0.82, { wordWrap: { width: a.w - 130 * s } }).setAlpha(0.8);
    new Button(this, a.x + a.w - 60 * s, y + Math.max(d.height, fs * 2) / 2 + fs * 0.6, {
      w: 118 * s,
      h: 38 * s,
      color: can ? 0xd4a017 : 0x9a8a7a,
      label: have >= sel.max ? 'Al máximo' : 'Aprender',
      fontSize: fs * 0.9,
      onPress: () => {
        if (!can) return;
        audio.sfx('perk');
        net.campaign('c:train', sel.id);
      },
    });
  }

  // ---------------------------------------------------------------- pestaña: misiones

  private tabMissions(c: Campaign, a: Area, s: number): void {
    const fs = 15 * s;
    let y = a.y;
    const ch = currentChapter(c);
    if (ch) {
      txt(this, a.x, y, `Capítulo ${ch.n}: ${ch.title}`, fs * 1.15, { color: '#ff8a3d' });
      y += fs * 1.6;
      const story = txt(this, a.x, y, ch.story, fs * 0.8, { wordWrap: { width: a.w } }).setAlpha(0.8);
      y += story.height + 6;
      for (const o of ch.objectives(c)) {
        txt(this, a.x + 4, y, `${o.done ? '✓' : '·'} ${o.text}`, fs * 0.88, { color: o.done ? '#2e8a34' : '#2b1d14' });
        if (o.progress && !o.done) txt(this, a.x + a.w, y, o.progress, fs * 0.8).setOrigin(1, 0).setAlpha(0.7);
        y += fs * 1.45;
      }
      txt(this, a.x, y, `Recompensa: ${ch.reward} monedas`, fs * 0.8, { color: '#d4a017' });
      y += fs * 1.8;
    } else {
      const t = txt(this, a.x, y, '¡Habéis completado todos los capítulos de momento! Muy pronto: el segundo local y la cadena rival.', fs * 0.9, {
        wordWrap: { width: a.w },
        color: '#2e8a34',
      });
      y += t.height + 12;
    }
    this.add.rectangle(a.x, y - 6, a.w, 1, 0x2b1d14, 0.15).setOrigin(0);

    // Concurso de los domingos
    if (contestAvailable(c)) {
      const p = contestParams(c, Math.max(1, net.info?.members.length ?? 1), net.info?.estilo ?? 'rol');
      txt(this, a.x, y, '¡Hoy es domingo de concurso!', fs, { color: '#c0392b' });
      y += fs * 1.4;
      const t = txt(this, a.x, y, `Nivel ${contestLevel(c)} del Desafío: servid ${p.goal} pedidos. Premio ${CONTEST_PRIZE} y fama. Ese día no hay ventas normales (el patrocinador pone los ingredientes).`, fs * 0.78, {
        wordWrap: { width: a.w - 130 * s },
      }).setAlpha(0.8);
      new Button(this, a.x + a.w - 60 * s, y + t.height / 2, {
        w: 118 * s,
        h: 36 * s,
        color: c.contestToday ? COLORS.red : c.activeMission ? 0x9a8a7a : COLORS.green,
        label: c.contestToday ? 'No ir' : 'Apuntarse',
        fontSize: fs * 0.85,
        onPress: () => !(c.activeMission && !c.contestToday) && net.campaign('c:contest', !c.contestToday),
      });
      y += Math.max(t.height, 40 * s) + 10;
    } else {
      const next = c.day + (7 - (c.day % 7));
      txt(this, a.x, y, `Próximo concurso de cocina: domingo (día ${next}).`, fs * 0.8).setAlpha(0.7);
      y += fs * 1.7;
    }

    // Tablón de encargos
    txt(this, a.x, y, 'Tablón de encargos', fs);
    y += fs * 1.4;
    if (c.chapter < 2) {
      txt(this, a.x, y, 'Se abre en el capítulo 2.', fs * 0.8).setAlpha(0.7);
      return;
    }
    if (!c.board.length) {
      txt(this, a.x, y, 'Hoy no hay encargos.', fs * 0.8).setAlpha(0.7);
      return;
    }
    const help = txt(this, a.x, y, 'Aceptad uno para hoy. Si sale bien: dinero y reputación; si no, -2 de reputación.', fs * 0.72, { wordWrap: { width: a.w } }).setAlpha(0.7);
    y += help.height + 8;
    for (const m of c.board) {
      const active = c.activeMission?.id === m.id;
      const blocked = !!c.activeMission || c.contestToday;
      if (active) this.add.rectangle(a.x - 4, y - 2, a.w + 8, 50 * s, 0xd9f2d0).setOrigin(0);
      txt(this, a.x, y, `${m.title} · +${m.reward}`, fs * 0.92);
      txt(this, a.x, y + fs * 1.2, m.text, fs * 0.78, { wordWrap: { width: a.w - 130 * s } }).setAlpha(0.8);
      if (active) txt(this, a.x + a.w - 8, y + 18 * s, 'Aceptado', fs * 0.9, { color: '#2e8a34' }).setOrigin(1, 0.5);
      else {
        new Button(this, a.x + a.w - 60 * s, y + 18 * s, {
          w: 118 * s,
          h: 34 * s,
          color: blocked ? 0x9a8a7a : COLORS.green,
          label: 'Aceptar',
          fontSize: fs * 0.85,
          onPress: () => !blocked && net.campaign('c:mission', m.id),
        });
      }
      y += 56 * s;
    }
  }

  /** Aviso grande y breve (capítulo completado). */
  private toast(title: string, sub: string): void {
    audio.sfx('levelUp');
    const { width: W, height: H } = this.scale;
    const t1 = txt(this, W / 2, H * 0.4, title, 26, { color: '#7ee081', stroke: '#2b1d14', strokeThickness: 6, align: 'center', wordWrap: { width: W - 30 } })
      .setOrigin(0.5)
      .setDepth(200);
    const t2 = txt(this, W / 2, H * 0.4 + 34, sub, 18, { color: '#fff4dc', stroke: '#2b1d14', strokeThickness: 5 }).setOrigin(0.5).setDepth(200);
    this.tweens.add({ targets: [t1, t2], alpha: 0, delay: 2600, duration: 500, onComplete: () => this.build() });
  }

  // ---------------------------------------------------------------- pestaña: local

  private tabLocal(c: Campaign, a: Area, s: number): void {
    const fs = 15 * s;
    // Cocina o decoración
    const sw = (a.w - 8) / 2;
    (['cocina', 'deco'] as LocalKind[]).forEach((k, i) => {
      new Button(this, a.x + sw / 2 + i * (sw + 8), a.y + 16 * s, {
        w: sw,
        h: 32 * s,
        color: this.localKind === k ? COLORS.blue : 0x8a7a6a,
        label: k === 'cocina' ? 'Cocina' : 'Decoración',
        fontSize: fs * 0.9,
        onPress: () => {
          this.localKind = k;
          this.build();
        },
      });
    });
    let top = a.y + 40 * s;
    if (this.localKind === 'deco') {
      txt(this, a.x, top, `La decoración atrae un ${Math.round(decorAppeal(c) * 100)} % más de clientes.`, fs * 0.85).setAlpha(0.7);
      top += fs * 1.7;
    }
    const list = LOCAL_UPGRADES.filter((u) => u.kind === this.localKind);
    const rowH = Math.min(66 * s, (a.h - (top - a.y)) / list.length);
    list.forEach((u, i) => {
      const y = top + i * rowH;
      const owned = c.upgrades.includes(u.id);
      if (owned) this.add.rectangle(a.x - 4, y, a.w + 8, rowH - 4, 0xd9f2d0).setOrigin(0);
      txt(this, a.x + 4, y + 4, u.name, fs * 0.95);
      txt(this, a.x + 4, y + 4 + fs * 1.2, u.description, fs * 0.75, { wordWrap: { width: a.w - 130 * s } }).setAlpha(0.8);
      if (owned) {
        txt(this, a.x + a.w - 8, y + rowH / 2 - 2, 'Comprado', fs * 0.9, { color: '#2e8a34' }).setOrigin(1, 0.5);
      } else {
        new Button(this, a.x + a.w - 58 * s, y + rowH / 2 - 2, {
          w: 112 * s,
          h: Math.min(36 * s, rowH * 0.6),
          color: c.money >= u.price ? 0xd4a017 : 0x9a8a7a,
          label: `Comprar · ${u.price}`,
          fontSize: fs * 0.85,
          onPress: () => {
            if (c.money < u.price) return;
            audio.sfx('coin');
            net.campaign('c:upgrade', u.id);
          },
        });
      }
      this.add.rectangle(a.x, y + rowH - 2, a.w, 1, 0x2b1d14, 0.12).setOrigin(0);
    });
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
    const result = dayResult(r);
    const lines: [string, number | string, string?][] = [
      ['Clientes servidos', `${r.served} (${r.perfect} perfectos)`],
      ['Clientes perdidos', r.lost],
      ['Ventas', r.sales, 'plus'],
      ['Propinas', r.tips, 'plus'],
      ['Multas y desperdicio', r.penalties, 'minus'],
      ['Compras de la mañana', -r.purchases, 'minus'],
      ...(r.deliveries ? ([['Repartos a domicilio', `+${r.deliveryIncome} (${r.deliveries})`, 'plus']] as [string, string, string][]) : []),
      ['Alquiler', -r.rent, 'minus'],
      ...(r.wages ? ([['Sueldos', -r.wages, 'minus']] as [string, number, string][]) : []),
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
    y += panelH + 10 * s;

    // Progreso: encargo, concurso, capítulo y experiencia
    const prog: [string, string][] = [];
    if (r.contest) prog.push([r.contest.won ? `¡Concurso ganado! ${r.contest.served} de ${r.contest.goal}` : `Concurso: ${r.contest.served} de ${r.contest.goal}`, `+${r.contest.prize}`]);
    if (r.mission) prog.push([`${r.mission.ok ? 'Encargo cumplido' : 'Encargo fallido'}: ${r.mission.title} (${r.mission.progress})`, r.mission.ok ? `+${r.mission.reward}` : `${r.mission.rep} rep.`]);
    if (r.chapterDone) prog.push([`¡Capítulo ${r.chapterDone.n} completado! ${r.chapterDone.title}`, `+${r.chapterDone.reward}`]);
    for (const x of r.xp ?? []) prog.push([`${x.name}: +${x.gained} de experiencia${x.newPoints ? ` · ¡${x.newPoints} punto${x.newPoints > 1 ? 's' : ''} nuevo${x.newPoints > 1 ? 's' : ''}!` : ''}`, '']);
    if (prog.length) {
      const ph = prog.length * lineH + 18;
      pixelPanel(g, x0, y, boxW, ph, 0xfff0c8);
      prog.forEach(([label, value], i) => {
        const good = !label.startsWith('Encargo fallido');
        const lt = txt(this, x0 + 14, y + 9 + i * lineH, label, fs * 0.85, { color: good ? '#2b1d14' : '#c0392b' });
        if (lt.width > boxW - 90) lt.setScale((boxW - 90) / lt.width);
        if (value) txt(this, x0 + boxW - 14, y + 9 + i * lineH, value, fs * 0.9, { color: good ? '#2e8a34' : '#c0392b' }).setOrigin(1, 0);
      });
      y += ph + 10 * s;
    }

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

/** Clave de la formación de un cocinero (la misma que usa el servidor). */
function chefKeyOf(m: { name: string; chefKey?: string }, _info: RoomInfo): string {
  return m.chefKey ?? `web:${m.name}`;
}

/** «Zapatillas ×2 · Termómetro». */
function countPerks(perks: string[]): string {
  const counts = new Map<string, number>();
  for (const id of perks) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => `${getPerk(id)?.short ?? id}${n > 1 ? ` ×${n}` : ''}`).join(' · ');
}

/** Resultado neto del día (lo que ganó o perdió el restaurante). */
function dayResult(r: DayReport): number {
  return r.sales + r.tips + r.penalties + (r.deliveryIncome ?? 0) - r.purchases - r.rent - r.interest - (r.wages ?? 0);
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
