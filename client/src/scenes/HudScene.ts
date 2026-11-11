import Phaser from 'phaser';
import { CONFIG, CUSTOMER_SLOTS_X, getRecipe, ROLE_NAMES, type Order, type OrderPart, type SimEvent } from '@hora-punta/shared';
import { computeLayout, isTouchDevice, type Rect, type ScreenLayout } from '../layout';
import { fillStack, stackPixelHeight } from '../pixel/items';
import { net } from '../net';
import { CHEF_COLORS, drinkKey } from '../pixel/sprites';
import { addAvatar } from '../ui/avatars';
import { clamp, COLORS, pixelPanel, txt } from '../theme';
import type { KitchenScene } from './KitchenScene';

interface TicketView {
  container: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Graphics;
  /** Dibujo de cada parte, con una marca que aparece cuando se entrega. */
  parts: Partial<Record<OrderPart, { art: Phaser.GameObjects.Container | Phaser.GameObjects.Image; check: Phaser.GameObjects.Text }>>;
  w: number;
  h: number;
}

/** Interfaz por encima de la cocina: marcador, comandas, controles táctiles y avisos. */
export class HudScene extends Phaser.Scene {
  private kitchen!: KitchenScene;
  private L!: ScreenLayout;
  private hud!: { time: Phaser.GameObjects.Text; money: Phaser.GameObjects.Text; rep: Phaser.GameObjects.Text; served: Phaser.GameObjects.Text };
  private tickets = new Map<number, TicketView>();
  private actionLabel?: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private rolesText?: Phaser.GameObjects.Text;
  /** Aviso a la caja cuando hay clientes esperando a que les tomen nota. */
  private cajaHint?: Phaser.GameObjects.Text;
  private rolesKey = '';
  /** Nombre sobre cada cocinero. */
  private nameTags = new Map<string, Phaser.GameObjects.Text>();
  /** Avatar de Discord junto a cada nombre (si lo hay). */
  private tagAvatars = new Map<string, Phaser.GameObjects.Container>();

  private stick?: { base: Phaser.GameObjects.Graphics; knob: Phaser.GameObjects.Graphics; cx: number; cy: number; r: number };
  private stickPointer: number | null = null;

  constructor() {
    super('hud');
  }

  create(): void {
    this.kitchen = this.scene.get('kitchen') as KitchenScene;
    this.build();

    const onSim = (ev: SimEvent) => this.onSimEvent(ev);
    this.kitchen.events.on('sim', onSim);
    this.scale.on('resize', this.build, this);
    this.events.once('shutdown', () => {
      this.kitchen.events.off('sim', onSim);
      this.scale.off('resize', this.build, this);
    });

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
  }

  update(): void {
    const sim = this.kitchen.sim;
    const t = Math.ceil(sim.timeLeft);
    this.hud.time.setText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`).setColor(t <= 15 ? '#ff6b5b' : '#fff4dc');
    this.hud.money.setText(String(sim.money)).setColor(sim.money < 0 ? '#ff6b5b' : '#fff4dc');
    this.hud.rep.setText(String(Math.max(0, sim.reputation))).setColor(sim.reputation <= 15 ? '#ff6b5b' : '#fff4dc');
    this.hud.served.setText(String(sim.stats.served));
    // La cocina solo ve las comandas de los pedidos a los que la caja ya ha tomado nota.
    this.syncTickets(sim.orders.filter((o) => o.taken));
    this.syncNameTags();

    const waiting = sim.orders.some((o) => !o.taken);
    const isCaja = this.kitchen.localPlayer?.roles.includes('caja') ?? false;
    this.cajaHint?.setVisible(waiting && isCaja);
    this.rolesText?.setVisible(!(waiting && isCaja));

    const me = this.kitchen.localPlayer;
    const rolesKey = me?.roles.join(',') ?? '';
    if (this.rolesText && rolesKey !== this.rolesKey) {
      this.rolesKey = rolesKey;
      const names = me?.roles.map((r) => ROLE_NAMES[r]).join(' · ');
      this.rolesText.setText(names ? `Tus puestos: ${names}` : 'Sin puesto: ayuda llevando cosas');
    }

    const hint = this.kitchen.actionHint();
    this.actionLabel?.setText(hint);
    this.hintText?.setText(`WASD / flechas: moverse   ·   Espacio / E: ${hint === '—' ? 'acción' : hint.toLowerCase()}`);
  }

  // ---------------------------------------------------------------- construcción

  private build(): void {
    this.children.removeAll(true);
    this.tickets.clear();
    this.stick = undefined;
    this.stickPointer = null;
    this.kitchen.touch.x = this.kitchen.touch.y = 0;
    this.actionLabel = undefined;
    this.hintText = undefined;
    this.nameTags.clear();
    this.tagAvatars.clear();
    this.rolesKey = '';

    const L = (this.L = computeLayout(this.scale.width, this.scale.height, isTouchDevice()));
    this.buildTopBar(L.topBar);
    const g = this.add.graphics();
    pixelPanel(g, L.tickets.x, L.tickets.y, L.tickets.w, L.tickets.h, 0x4a3628);
    this.rolesText = txt(this, L.kitchen.x + 6, L.kitchen.y + 4, '', 13, {
      color: '#fff4dc',
      backgroundColor: '#2b1d14aa',
      padding: { x: 4, y: 2 },
    }).setDepth(5);
    this.cajaHint = txt(this, L.W / 2, L.kitchen.y + 4, '¡Clientes esperando! Ve al pase rojo y pulsa acción para tomar nota', 14, {
      color: '#2b1d14',
      backgroundColor: '#ffc93c',
      padding: { x: 6, y: 3 },
      align: 'center',
      wordWrap: { width: Math.min(L.W - 20, 420) },
    })
      .setOrigin(0.5, 0)
      .setDepth(6)
      .setVisible(false);

    if (L.controls) this.buildControls(L.controls, L.portrait);
    else {
      this.hintText = txt(this, L.W / 2, L.H - 4, '', 14, { color: '#fff4dcaa' }).setOrigin(0.5, 1);
    }
  }

  private buildTopBar(r: Rect): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink).fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle(COLORS.orange).fillRect(r.x, r.y + r.h - 3, r.w, 3);
    const fs = clamp(r.h * 0.55, 16, 26);
    const iconScale = Math.max(2, Math.round(r.h / 14));
    const cell = r.w / 4;
    const mk = (i: number, icon: string) => {
      const cx = cell * i + cell / 2;
      this.add.image(cx - 8, r.h / 2 - 1, icon).setScale(iconScale).setOrigin(1, 0.5);
      return txt(this, cx - 2, r.h / 2 - 2, '', fs, { color: '#fff4dc' }).setOrigin(0, 0.5);
    };
    this.hud = { time: mk(0, 'icon_clock'), money: mk(1, 'icon_coin'), rep: mk(2, 'icon_star'), served: mk(3, 'icon_burger') };
  }

  /** Joystick a la izquierda y botón de acción a la derecha. */
  private buildControls(c: Rect, portrait: boolean): void {
    if (portrait) {
      const g = this.add.graphics();
      g.fillStyle(0x2b1d14, 0.6).fillRect(c.x, c.y, c.w, c.h);
    }
    const r = Math.round(clamp(Math.min(c.h * 0.36, c.w * 0.2), 44, 80));
    const cx = c.x + r + 28;
    const cy = c.y + c.h / 2;
    const base = this.add.graphics();
    base.fillStyle(0x000000, 0.35).fillCircle(cx, cy + 4, r);
    base.fillStyle(0xfff4dc, 0.25).fillCircle(cx, cy, r);
    base.lineStyle(4, 0x2b1d14, 0.8).strokeCircle(cx, cy, r);
    const knob = this.add.graphics();
    this.drawKnob(knob, r);
    knob.setPosition(cx, cy);
    this.stick = { base, knob, cx, cy, r };

    const br = Math.round(r * 0.95);
    const bx = c.x + c.w - br - 28;
    const btn = this.add.graphics();
    btn.fillStyle(0x000000, 0.35).fillCircle(bx, cy + 5, br);
    btn.fillStyle(COLORS.orange).fillCircle(bx, cy, br);
    btn.fillStyle(0xffffff, 0.3).fillCircle(bx - br * 0.25, cy - br * 0.3, br * 0.35);
    btn.lineStyle(4, 0x2b1d14).strokeCircle(bx, cy, br);
    this.actionLabel = txt(this, bx, cy, '', clamp(br * 0.36, 14, 26), {
      color: '#ffffff',
      stroke: '#2b1d14',
      strokeThickness: 4,
    }).setOrigin(0.5);
    const zone = this.add.zone(bx, cy, br * 2.4, br * 2.4).setInteractive();
    zone.on('pointerdown', () => {
      this.kitchen.interact();
      this.tweens.add({ targets: [btn, this.actionLabel], scale: { from: 0.92, to: 1 }, duration: 120 });
    });
  }

  private drawKnob(g: Phaser.GameObjects.Graphics, r: number): void {
    const kr = r * 0.45;
    g.clear();
    g.fillStyle(0x000000, 0.3).fillCircle(0, 4, kr);
    g.fillStyle(0xfff4dc).fillCircle(0, 0, kr);
    g.lineStyle(4, 0x2b1d14).strokeCircle(0, 0, kr);
  }

  // ---------------------------------------------------------------- joystick

  private onPointerDown(p: Phaser.Input.Pointer): void {
    const s = this.stick;
    if (!s || this.stickPointer !== null) return;
    // Cualquier toque en la mitad izquierda de la zona de controles mueve el joystick.
    const c = this.L.controls!;
    if (p.y < c.y || p.x > c.x + c.w / 2) return;
    this.stickPointer = p.id;
    this.onPointerMove(p);
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const s = this.stick;
    if (!s || p.id !== this.stickPointer) return;
    let dx = p.x - s.cx;
    let dy = p.y - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > s.r) {
      dx = (dx / len) * s.r;
      dy = (dy / len) * s.r;
    }
    s.knob.setPosition(s.cx + dx, s.cy + dy);
    // Zona muerta pequeña para no andar sin querer.
    const mag = Math.min(1, len / s.r);
    this.kitchen.touch.x = mag < 0.2 ? 0 : dx / s.r;
    this.kitchen.touch.y = mag < 0.2 ? 0 : dy / s.r;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const s = this.stick;
    if (!s || p.id !== this.stickPointer) return;
    this.stickPointer = null;
    s.knob.setPosition(s.cx, s.cy);
    this.kitchen.touch.x = this.kitchen.touch.y = 0;
  }

  // ---------------------------------------------------------------- nombres

  private syncNameTags(): void {
    const players = this.kitchen.sim.players;
    for (const [id, tag] of this.nameTags) {
      if (players.has(id)) continue;
      tag.destroy();
      this.nameTags.delete(id);
      this.tagAvatars.get(id)?.destroy();
      this.tagAvatars.delete(id);
    }
    // Con una sola persona no hace falta etiqueta.
    const show = players.size > 1;
    for (const p of players.values()) {
      let tag = this.nameTags.get(p.id);
      if (!tag) {
        tag = txt(this, 0, 0, p.name, 12, {
          color: '#ffffff',
          backgroundColor: CHEF_COLORS[p.color % CHEF_COLORS.length][1],
          padding: { x: 3, y: 1 },
        }).setOrigin(0.5, 1);
        this.nameTags.set(p.id, tag);
        const avatar = addAvatar(this, p, 0, 0, 14);
        if (avatar) this.tagAvatars.set(p.id, avatar);
      }
      const avatar = this.tagAvatars.get(p.id);
      if (tag.text !== p.name) tag.setText(p.name);
      const pos = this.kitchen.renderedPosition(p.id);
      if (!pos || !show) {
        tag.setVisible(false);
        avatar?.setVisible(false);
        continue;
      }
      const at = this.kitchen.worldToScreen(pos.x, pos.y - 1.45);
      // Por debajo de las comandas y de los controles, nunca encima.
      const hidden = at.y < this.L.kitchen.y + 4 || (this.L.controls?.y ?? Infinity) < at.y;
      const shift = avatar ? 9 : 0;
      tag.setPosition(Math.round(at.x + shift), Math.round(at.y)).setVisible(!hidden);
      avatar?.setPosition(Math.round(at.x + shift - tag.width / 2 - 9), Math.round(at.y - tag.height / 2)).setVisible(!hidden);
    }
  }

  // ---------------------------------------------------------------- comandas

  private syncTickets(orders: Order[]): void {
    const L = this.L;
    const pad = 6;
    const inner: Rect = { x: L.tickets.x + 8, y: L.tickets.y + 7, w: L.tickets.w - 16, h: L.tickets.h - 16 };
    const n = CUSTOMER_SLOTS_X.length;
    const w = Math.min((inner.w - pad * (n - 1)) / n, 150);

    for (const [id, view] of this.tickets) {
      if (!orders.some((o) => o.id === id)) {
        this.tickets.delete(id);
        this.tweens.add({ targets: view.container, alpha: 0, y: view.container.y - 12, duration: 200, onComplete: () => view.container.destroy() });
      }
    }
    // Ordenadas por hueco, igual que los clientes en la calle.
    const sorted = [...orders].sort((a, b) => a.slot - b.slot);
    sorted.forEach((order, i) => {
      const x = Math.round(inner.x + i * (w + pad));
      let view = this.tickets.get(order.id);
      if (!view) {
        view = this.createTicket(order, w, inner.h);
        view.container.setPosition(x, inner.y - 10).setAlpha(0);
        this.tweens.add({ targets: view.container, alpha: 1, y: inner.y, duration: 220 });
        this.tickets.set(order.id, view);
      } else if (view.container.x !== x && !this.tweens.isTweening(view.container)) {
        this.tweens.add({ targets: view.container, x, duration: 200 });
      }
      for (const [part, v] of Object.entries(view.parts)) {
        const done = order.done[part as OrderPart];
        v.art.setAlpha(done ? 0.3 : 1);
        v.check.setVisible(done);
      }
      const ratio = Math.max(0, order.patience / order.maxPatience);
      const color = ratio > 0.5 ? COLORS.green : ratio > 0.25 ? 0xffa726 : COLORS.red;
      view.bar.clear().fillStyle(COLORS.ink).fillRect(4, view.h - 10, view.w - 8, 7).fillStyle(color).fillRect(6, view.h - 8, Math.max(2, (view.w - 12) * ratio), 3);
    });
  }

  private createTicket(order: Order, w: number, h: number): TicketView {
    const recipe = getRecipe(order.recipeId);
    const container = this.add.container(0, 0);
    const g = this.add.graphics();
    pixelPanel(g, 0, 0, w, h, COLORS.panel, 2);
    g.fillStyle(COLORS.orange).fillRect(4, 2, w - 8, 15);
    container.add(g);
    // Mismo número que el bocadillo del cliente en la calle.
    g.fillStyle(0xffffff).fillRect(4, 2, 12, 15);
    container.add(this.add.image(7, 4, `digit_${order.slot + 1}`).setOrigin(0).setScale(2));
    const name = txt(this, w / 2 + 8, 9, recipe.name, 12, { color: '#ffffff' }).setOrigin(0.5);
    if (name.width > w - 26) name.setScale((w - 26) / name.width);
    container.add(name);

    // Hamburguesa y acompañamientos en pixel art a escala entera (se ven las capas en orden).
    const areaTop = 20;
    const areaH = h - areaTop - 13;
    const burgerH = stackPixelHeight(recipe.layers);
    const sides = (order.fries ? 1 : 0) + (order.drink ? 1 : 0);
    const columns = 1 + (sides > 0 ? 1 : 0);
    const scale = Math.max(1, Math.floor(Math.min(areaH / burgerH, (w - 10) / (12 * columns + 2))));
    const colW = (w - 4) / columns;
    const parts: TicketView['parts'] = {};
    const check = (x: number, y: number) => {
      const t = txt(this, x, y, '✓', 16, { color: '#2e8a34', stroke: '#ffffff', strokeThickness: 3 }).setOrigin(0.5).setVisible(false);
      container.add(t);
      return t;
    };

    const burger = this.add.container(2 + colW / 2, areaTop + (areaH + burgerH * scale) / 2).setScale(scale);
    fillStack(burger, recipe.layers);
    container.add(burger);
    parts.burger = { art: burger, check: check(burger.x, areaTop + areaH / 2) };

    // Patatas y bebida, una encima de otra en la segunda columna.
    const sideKeys: [OrderPart, string][] = [];
    if (order.fries) sideKeys.push(['fries', 'side_fritas']);
    if (order.drink) sideKeys.push(['drink', drinkKey(order.drink)]);
    const sideScale = Math.max(1, Math.floor(Math.min(scale, areaH / (11 * sideKeys.length))));
    sideKeys.forEach(([part, key], i) => {
      const cy = areaTop + (areaH / sideKeys.length) * (i + 0.5);
      const art = this.add.image(2 + colW * 1.5, cy, key).setScale(sideScale);
      container.add(art);
      parts[part] = { art, check: check(art.x, cy) };
    });

    const bar = this.add.graphics();
    container.add(bar);
    return { container, bar, parts, w, h };
  }

  // ---------------------------------------------------------------- avisos

  private onSimEvent(ev: SimEvent): void {
    switch (ev.type) {
      case 'served': {
        const at = this.kitchen.worldToScreen(CUSTOMER_SLOTS_X[ev.slot], 2);
        this.popup(at.x, at.y, `+${ev.earned}`, '#7dff8a');
        if (ev.perfect) this.popup(at.x, at.y + 22, `¡Perfecto! +${ev.tip}`, '#ffc93c', 150);
        break;
      }
      case 'wrong': {
        const at = this.kitchen.worldToScreen(ev.x + 0.5, ev.y);
        this.popup(at.x, at.y, `¡Receta incorrecta! -${ev.penalty}`, '#ff6b5b');
        break;
      }
      case 'lost': {
        const at = this.kitchen.worldToScreen(CUSTOMER_SLOTS_X[ev.slot], 2);
        this.popup(at.x, at.y, `¡Se ha ido! -${ev.penalty}★`, '#ff6b5b');
        break;
      }
      case 'trash': {
        const at = this.kitchen.worldToScreen(ev.x + 0.5, ev.y);
        this.popup(at.x, at.y, `-${ev.cost}`, '#ffb36b');
        break;
      }
      case 'burnt': {
        const at = this.kitchen.worldToScreen(ev.x + 0.5, ev.y);
        this.popup(at.x, at.y, `¡${ev.what === 'carne' ? 'Carne quemada' : 'Patatas quemadas'}! -${CONFIG.burnCost}`, '#ff6b5b');
        break;
      }
      case 'cooked':
      case 'filled': {
        const at = this.kitchen.worldToScreen(ev.x + 0.5, ev.y);
        this.popup(at.x, at.y, '¡Listo!', '#ffffff');
        break;
      }
      case 'taken': {
        const at = this.kitchen.worldToScreen(CUSTOMER_SLOTS_X[ev.slot], 2);
        this.popup(at.x, at.y, '¡Nota tomada!', '#ffffff');
        break;
      }
      case 'denied':
        if (ev.playerId === net.id) {
          const me = this.kitchen.localPlayer;
          const at = me ? this.kitchen.worldToScreen(me.x, me.y - 1.2) : { x: this.L.W / 2, y: this.L.H / 2 };
          this.popup(at.x, at.y, `Eso es de ${ROLE_NAMES[ev.role]}`, '#ffb36b');
        }
        break;
      case 'given':
        if (ev.to === net.id || ev.from === net.id) {
          const me = this.kitchen.localPlayer;
          const at = me ? this.kitchen.worldToScreen(me.x, me.y - 1.2) : { x: this.L.W / 2, y: this.L.H / 2 };
          this.popup(at.x, at.y, ev.to === net.id ? '¡Te lo han pasado!' : '¡Pasado!', '#ffffff');
        }
        break;
      case 'part': {
        const at = this.kitchen.worldToScreen(CUSTOMER_SLOTS_X[ev.slot], 2);
        const label = ev.part === 'burger' ? 'Hamburguesa' : ev.part === 'fries' ? 'Patatas' : 'Bebida';
        this.popup(at.x, at.y + 20, `${label} ✓`, '#ffffff');
        break;
      }
    }
  }

  private popup(x: number, y: number, text: string, color: string, delay = 0): void {
    const t = txt(this, x, y, text, 18, { color, stroke: '#2b1d14', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0);
    t.x = clamp(t.x, t.width / 2 + 4, this.scale.width - t.width / 2 - 4);
    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      y: y - 36,
      delay,
      duration: 1400,
      ease: 'Quad.Out',
      onStart: () => t.setAlpha(1),
      onComplete: () => t.destroy(),
    });
  }
}
