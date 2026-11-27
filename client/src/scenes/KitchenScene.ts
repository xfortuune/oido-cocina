import Phaser from 'phaser';
import {
  CONFIG,
  CUSTOMER_Y,
  EMOTES,
  serviceUpgrades,
  kitchenFor,
  orderLayers,
  KitchenSim,
  ROLE_NAMES,
  roleFor,
  TICK_MS,
  type HatId,
  type InputMessage,
  type TileKind,
  type Order,
  type OrderPart,
  type Player,
  type RoomInfo,
  type SimEvent,
  type SimSnapshot,
  holidayOf,
  weatherOf,
  weatherDay,
} from '@hora-punta/shared';
import { audio } from '../audio';
import { computeLayout, isTouchDevice } from '../layout';
import { net } from '../net';
import { pad, padEvents, type PadButton } from '../gamepad';
import { fillItem, fillStack, itemSignature, stackPixelHeight } from '../pixel/items';
import { chefKey, customerKey, drinkKey, TILE, tileKey } from '../pixel/sprites';

/** Joystick táctil (lo escribe HudScene). */
export interface TouchInput {
  x: number;
  y: number;
}

interface PlayerView {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  held: Phaser.GameObjects.Container;
  heldSig: string;
  /** Posición dibujada (los demás cocineros se suavizan entre instantáneas). */
  rx: number;
  ry: number;
}

interface StationView {
  container: Phaser.GameObjects.Container;
  sig: string;
  /** Capas que había (para el sonido de apilar). */
  layers: number;
  /** Avisos de «se va a quemar» ya sonados para lo que hay ahora (0, 1 o 2). */
  warned: number;
  /** Próximo vapor (ms del juego). */
  steamAt: number;
}

interface CustomerView {
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  bar: Phaser.GameObjects.Graphics;
  /** Gotita de sudor cuando le queda poca paciencia. */
  sweat: Phaser.GameObjects.Image;
  /** Dibujo de cada parte del pedido, para atenuarla cuando ya se ha entregado. */
  parts: Partial<Record<OrderPart, { setAlpha(a: number): unknown }>>;
  /** Si el bocadillo ya muestra el pedido (la caja ha tomado nota). */
  taken: boolean;
  leaving: boolean;
  /** Altura a la que espera (la calle, o la ventanilla si es para llevar). */
  baseY: number;
}

/**
 * La cocina compartida. El estado viene del servidor; aquí solo se mueve al cocinero propio
 * (predicción local, que el servidor valida) y se dibuja todo lo demás.
 */
export class KitchenScene extends Phaser.Scene {
  sim!: KitchenSim;
  readonly touch: TouchInput = { x: 0, y: 0 };

  private players = new Map<string, PlayerView>();
  private stations = new Map<string, StationView>();
  private customers = new Map<number, CustomerView>();
  private spillViews = new Map<string, Phaser.GameObjects.Image>();
  private nightRt: Phaser.GameObjects.RenderTexture | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private sendTimer = 0;
  private leaving = false;
  /** Campaña: contador de existencias encima de cada caja (y de las máquinas de bebida). */
  private stockLabels = new Map<string, { item: string; x: number; y: number; icon?: Phaser.GameObjects.Image; label: Phaser.GameObjects.Container; shown: number }>();
  /** Si esta cocina es un servicio de la campaña (para volver a ella). */
  private campaign = false;
  /** Momento del último sonido de entrega/tirar/pasar (para no sumarle el de «soltar»). */
  private lastActionSound = 0;

  constructor() {
    super('kitchen');
  }

  create(): void {
    // Con las mejoras de la tienda (la tercera plancha cambia el plano).
    const info = net.info;
    const upgrades = info?.juego === 'campana' && info.campana ? serviceUpgrades(info.campana) : (info?.mejoras ?? []);
    // En la campaña, la cocina del local donde se trabaja hoy.
    const map =
      info?.juego === 'campana' && info.campana ? kitchenFor(info.campana.upgrades, info.campana.localHoy) : kitchenFor(info?.mejoras ?? []);
    this.sim = new KitchenSim(undefined, undefined, upgrades, map);
    this.sim.moveOnTick = false;
    if (net.snapshot) this.sim.applySnapshot(net.snapshot, net.id);

    this.players.clear();
    this.stations.clear();
    this.stockLabels.clear();
    this.campaign = net.info?.juego === 'campana';
    this.customers.clear();
    this.spillViews.clear();
    this.nightRt = null;
    this.touch.x = this.touch.y = 0;
    this.leaving = false;

    this.buildWorld();
    this.addHelpers();
    this.addDecor();
    this.addWeather();
    this.overlay = this.add.graphics().setDepth(500);
    this.syncPlayers(0, 0);
    this.layoutCamera();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D',
    }) as typeof this.keys;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Escape o P: pausa (o vuelve atrás en el menú de pausa, que lo gestiona el HUD).
      // P sirve dentro de Discord, que se queda la tecla Escape.
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.events.emit('escape');
        return;
      }
      if (net.paused) return;
      if (e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') this.interact();
      // Gestos rápidos: 1 ¡Oído!, 2 ¡Ayuda!, 3 ¡Marchando!, 4 ¡Gracias!, 5 ¡Voy!
      const n = Number(e.key);
      if (n >= 1 && n <= EMOTES.length) net.emote(n - 1);
    });

    // Mando: A coger/dejar, X e Y gestos, Start pausa.
    const onPad = (b: PadButton) => {
      if (b === 'start') this.events.emit('escape');
      else if (net.paused) return;
      else if (b === 'a') this.interact();
      else if (b === 'x') net.emote(0);
      else if (b === 'y') net.emote(1);
    };
    padEvents.on('down', onPad);
    this.events.once('shutdown', () => padEvents.off('down', onPad));

    const onSnap = (s: SimSnapshot) => this.sim.applySnapshot(s, net.id);
    const onEvents = (evs: SimEvent[]) => evs.forEach((ev) => this.handleEvent(ev));
    const onRoom = (info: RoomInfo) => {
      if (info.phase === 'lobby') this.exitTo('lobby');
      else if (info.phase === 'perks') this.exitTo('perks');
      else if (info.phase === 'shop') this.exitTo('shop');
      // Campaña: al acabar el servicio, a las cuentas del día.
      else if (info.phase === 'cierre' || info.phase === 'gestion') this.exitTo('campaign', 900);
    };
    const onSummary = () => this.exitTo('summary', 900);
    const onLeft = () => this.exitTo(this.campaign ? 'campaign' : 'lobby');
    net.on('snap', onSnap);
    net.on('events', onEvents);
    net.on('room', onRoom);
    net.on('summary', onSummary);
    net.on('left', onLeft);

    this.scale.on('resize', this.layoutCamera, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layoutCamera, this);
      net.off('snap', onSnap);
      net.off('events', onEvents);
      net.off('room', onRoom);
      net.off('summary', onSummary);
      net.off('left', onLeft);
    });
    this.scene.launch('hud');
    audio.music('kitchen');
    this.events.once('shutdown', () => audio.setAmbience(0, 0));
  }

  interact(): void {
    if (this.localPlayer && !net.paused) net.interact(this.pose());
  }

  /** Salir de la partida al menú principal (desde la pausa). */
  quitToMenu(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.stop('hud');
    this.scene.start('menu');
    void net.leave();
  }

  get localPlayer(): Player | undefined {
    return this.sim.players.get(net.id);
  }

  /** Dónde espera el cliente de un hueco (en casillas); -1 es la ventanilla de para llevar. */
  slotPos(slot: number): [number, number] {
    const w = this.sim.windowTile;
    if (slot < 0 && w) return [w.x + 0.5, w.y];
    return [this.sim.slots[slot] ?? 0, 2];
  }

  /** Coordenadas de pantalla (para el HUD) de un punto del mundo en casillas. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return {
      x: cam.x + (x * TILE - cam.worldView.x) * cam.zoom,
      y: cam.y + (y * TILE - cam.worldView.y) * cam.zoom,
    };
  }

  /** Posición dibujada de un cocinero, en casillas (para las etiquetas con el nombre). */
  renderedPosition(id: string): { x: number; y: number } | undefined {
    const v = this.players.get(id);
    return v && { x: v.rx, y: v.ry };
  }

  /** Texto del botón de acción según lo que tenga delante el cocinero. */
  actionHint(): string {
    const p = this.localPlayer;
    if (!p) return '—';
    const t = this.sim.targetTile(p);
    const held = p.holding;
    if (!t || t.kind === 'outside' || t.kind === 'wall') return held ? 'Llevando' : '—';
    if (t.kind === 'floor') {
      const mate = [...this.sim.players.values()].some(
        (o) => o !== p && !o.holding && Math.floor(o.x) === t.x && Math.floor(o.y) === t.y,
      );
      if (!held && this.sim.spills[`${t.x},${t.y}`]) return 'Fregar';
      return held && mate ? 'Pasar' : held ? 'Llevando' : '—';
    }
    const role = roleFor(t.kind);
    if (role && !p.roles.includes(role)) return ROLE_NAMES[role];
    const st = this.sim.station(t.x, t.y);
    switch (t.kind) {
      case 'crate':
        if (!held) return 'Coger';
        if (held.kind === 'food' && held.layers.length === 1 && held.layers[0] === t.crate) return 'Devolver';
        return held.kind === 'food' && p.perks.includes('bandeja') && t.crate !== 'carne_cruda' && t.crate !== 'patatas'
          ? 'Añadir'
          : '—';
      case 'trash':
        return held ? 'Tirar' : '—';
      case 'ventanilla':
        return held && (held.kind === 'food' || held.kind === 'fries' || (held.kind === 'drink' && held.fill >= 1)) ? 'Para llevar' : '—';
      case 'pase':
        if (!held) return this.sim.orders.some((o) => !o.taken) ? 'Tomar nota' : '—';
        if (held.kind === 'food' || held.kind === 'fries' || (held.kind === 'drink' && held.fill >= 1)) return 'Servir';
        return '—';
      case 'grill':
      case 'fryer':
        if (!held && st?.item) return 'Coger';
        return held?.kind === (t.kind === 'grill' ? 'raw' : 'potatoes') && !st?.item ? (t.kind === 'grill' ? 'Cocinar' : 'Freír') : '—';
      case 'drinks':
        if (held) return '—';
        if (!st?.item) return 'Llenar';
        return st.item.kind === 'drink' && st.item.fill >= 1 ? 'Coger' : '—';
      case 'montaje':
        if (held?.kind === 'food' && st?.item?.kind === 'food') return 'Apilar';
        break;
    }
    if (held && !st?.item) return 'Dejar';
    if (!held && st?.item) return 'Coger';
    return '—';
  }

  /**
   * Empleados (del Desafío o de la campaña): se ven junto a su puesto, moviéndose un poco.
   * Son decorado: no chocan con nadie; lo que hacen lo hace la simulación.
   */
  private addHelpers(): void {
    const info = net.info;
    const hired = info?.juego === 'campana' ? (info.campana?.staff ?? []) : (info?.mejoras ?? []);
    const SPOTS: Record<string, { kind: TileKind; apron: number; hat: HatId }> = {
      emp_camarero: { kind: 'pase', apron: 2, hat: 'gorra' },
      camarero: { kind: 'pase', apron: 2, hat: 'gorra' },
      emp_freidor: { kind: 'fryer', apron: 5, hat: 'panuelo' },
      ayudante: { kind: 'fryer', apron: 5, hat: 'panuelo' },
      emp_barman: { kind: 'drinks', apron: 7, hat: 'gorra' },
      emp_limpiador: { kind: 'trash', apron: 6, hat: 'panuelo' },
      pinche: { kind: 'grill', apron: 4, hat: 'gorro' },
    };
    const used = new Set<string>();
    for (const id of hired) {
      const spot = SPOTS[id];
      if (!spot) continue;
      const tile = this.sim.kitchen.tiles.flat().find((t) => t.kind === spot.kind && !used.has(`${t.x},${t.y}`));
      if (!tile) continue;
      used.add(`${tile.x},${tile.y}`);
      // De pie en el suelo de al lado, medio pegado al puesto.
      const dirs = [[0, 1], [1, 0], [-1, 0], [0, -1]];
      const d = dirs.find(([dx, dy]) => this.sim.tile(tile.x + dx, tile.y + dy)?.kind === 'floor') ?? [0, 1];
      const px = (tile.x + 0.5 + d[0] * 0.55) * TILE;
      const py = (tile.y + 0.5 + d[1] * 0.55) * TILE + 6;
      const dir = d[1] < 0 ? 'down' : d[1] > 0 ? 'up' : 'side';
      const sprite = this.add.image(px, py, chefKey({ apron: spot.apron, hat: spot.hat }, dir, 0)).setOrigin(0.5, 1).setDepth(9 + py).setAlpha(0.95);
      if (d[0] > 0) sprite.setFlipX(true);
      this.tweens.add({ targets: sprite, y: py - 1, duration: 300 + Math.random() * 200, yoyo: true, repeat: -1 });
    }
  }

  /** Decoración comprada (campaña) y la terraza o el tarro de propinas (Desafío): se ven en el restaurante. */
  private addDecor(): void {
    const info = net.info;
    const owned = info?.juego === 'campana' ? (info.campana?.upgrades ?? []) : (info?.mejoras ?? []);
    const has = (id: string) => owned.includes(id);
    const k = this.sim.kitchen;
    const slots = this.sim.slots;
    const W = k.width * TILE;
    const at = (key: string, x: number, y: number, depth?: number) =>
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth ?? 10 + y);
    // En la acera (fila 1), entre los huecos de los clientes.
    const gaps = slots.slice(0, -1).map((x, i) => ((x + slots[i + 1]) / 2) * TILE);
    if (has('terraza')) [gaps[0], gaps[gaps.length - 1]].forEach((x) => at('deco_sombrilla', x, 1.9 * TILE));
    if (has('mesas')) gaps.slice(1, -1).forEach((x) => at('deco_mesa', x, 1.9 * TILE));
    if (has('plantas')) {
      at('deco_planta', 0.5 * TILE, 3.05 * TILE);
      at('deco_planta', W - 0.5 * TILE, 3.05 * TILE);
    }
    if (has('musica')) {
      const jb = at('deco_jukebox', 0.55 * TILE, 1.6 * TILE);
      this.time.addEvent({
        delay: 900,
        loop: true,
        callback: () => {
          const n = this.add.image(jb.x + 4, jb.y - 12, 'deco_nota').setDepth(460);
          this.tweens.add({ targets: n, y: n.y - 12, x: n.x + (Math.random() - 0.5) * 8, alpha: 0, duration: 1200, onComplete: () => n.destroy() });
        },
      });
    }
    if (has('neon')) {
      // En la fachada, encima del pase; parpadea de vez en cuando.
      const sign = at('deco_neon', W - 4.3 * TILE, 3 * TILE + 9, 30);
      this.tweens.add({ targets: sign, alpha: { from: 1, to: 0.55 }, duration: 90, yoyo: true, repeat: -1, repeatDelay: 2200 });
    }
    if (has('cuadros')) {
      // En las paredes de la cocina (las de la izquierda, por debajo del pase).
      const walls = k.tiles.flat().filter((t) => t.kind === 'wall' && t.x === 0 && t.y > 4).slice(0, 2);
      for (const t of walls) at('deco_cuadro', t.x * TILE + 8, t.y * TILE + 12, 3);
    }
    if (has('tarro')) {
      const pase = k.tiles.flat().find((t) => t.kind === 'pase');
      if (pase) at('deco_tarro', pase.x * TILE + 3, pase.y * TILE + 6, 12 + pase.y * TILE);
    }
  }

  /** Campaña: el tiempo del día se ve en la calle (lluvia, nieve) y en festivo hay banderines. */
  private addWeather(): void {
    const c = net.info?.juego === 'campana' ? net.info.campana : null;
    if (!c || c.contestToday) return;
    const wd = weatherDay(c);
    const weather = weatherOf(wd);
    const W = this.sim.kitchen.width * TILE;
    const H = 3 * TILE;
    if (holidayOf(wd)) {
      const g = this.add.graphics().setDepth(455);
      const colors = [0xe5483a, 0xffd23f, 0x27ae60, 0x4fa3e0, 0xff6b9d];
      g.lineStyle(1, 0x2b1d14, 0.6).lineBetween(0, 3, W, 3);
      for (let x = 2, i = 0; x < W - 4; x += 8, i++) {
        g.fillStyle(colors[i % colors.length]).fillTriangle(x, 3, x + 6, 3, x + 3, 9);
      }
    }
    if (weather === 'lluvia' || weather === 'nieve') {
      const snow = weather === 'nieve';
      const g = this.add.graphics().setDepth(456);
      g.fillStyle(snow ? 0xffffff : 0x1a2a40, snow ? 0.08 : 0.12).fillRect(0, 0, W, H);
      this.time.addEvent({
        delay: snow ? 90 : 35,
        loop: true,
        callback: () => {
          const x = Math.random() * W;
          const drop = snow
            ? this.add.rectangle(x, -2, 2, 2, 0xffffff, 0.9)
            : this.add.rectangle(x, -4, 1, 4, 0x9cc8f0, 0.75);
          drop.setDepth(457);
          this.tweens.add({
            targets: drop,
            y: H - Math.random() * 6,
            x: snow ? x + (Math.random() - 0.5) * 14 : x - 3,
            duration: snow ? 2200 + Math.random() * 800 : 380,
            onComplete: () => drop.destroy(),
          });
        },
      });
    } else if (weather === 'calor') {
      const g = this.add.graphics().setDepth(456);
      g.fillStyle(0xffa040, 0.1).fillRect(0, 0, W, H);
    }
  }

  /** Manchas del suelo: una imagen por casilla, más clara según se va fregando. */
  private syncSpills(): void {
    const spills = this.sim.spills;
    for (const [k, img] of this.spillViews) {
      if (!spills[k]) {
        this.spillViews.delete(k);
        this.tweens.add({ targets: img, alpha: 0, scale: 0.5, duration: 250, onComplete: () => img.destroy() });
      }
    }
    for (const [k, left] of Object.entries(spills)) {
      let img = this.spillViews.get(k);
      if (!img) {
        const [x, y] = k.split(',').map(Number);
        img = this.add.image((x + 0.5) * TILE, (y + 0.55) * TILE, 'spill').setDepth(2).setScale(0.3);
        this.tweens.add({ targets: img, scale: 1, duration: 200, ease: 'Back.Out' });
        this.spillViews.set(k, img);
      }
      img.setAlpha(0.35 + 0.22 * left);
    }
  }

  /** Turno de noche: todo a oscuras salvo alrededor de los cocineros, los fogones y la calle con farolas. */
  private drawNight(): void {
    if (!this.sim.night) {
      this.nightRt?.setVisible(false);
      return;
    }
    const k = this.sim.kitchen;
    const W = k.width * TILE;
    const H = k.height * TILE;
    if (!this.nightRt) {
      if (!this.textures.exists('light')) {
        const tex = this.textures.createCanvas('light', 64, 64)!;
        const c = tex.getContext();
        const grad = c.createRadialGradient(32, 32, 4, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, 64, 64);
        tex.refresh();
        const small = this.textures.createCanvas('light_s', 32, 32)!;
        const cs = small.getContext();
        const g2 = cs.createRadialGradient(16, 16, 2, 16, 16, 16);
        g2.addColorStop(0, 'rgba(255,255,255,0.85)');
        g2.addColorStop(1, 'rgba(255,255,255,0)');
        cs.fillStyle = g2;
        cs.fillRect(0, 0, 32, 32);
        small.refresh();
      }
      this.nightRt = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(380);
    }
    const rt = this.nightRt.setVisible(true);
    rt.clear();
    rt.fill(0x070a24, 0.74);
    for (const v of this.players.values()) rt.erase('light', v.rx * TILE - 32, v.ry * TILE - 36);
    for (const row of k.tiles) {
      for (const t of row) {
        if (t.kind === 'grill' || t.kind === 'fryer' || t.kind === 'pase' || t.kind === 'ventanilla') rt.erase('light_s', t.x * TILE - 8, t.y * TILE - 8);
      }
    }
    // Farolas de la calle
    for (let x = 2; x < k.width; x += 4) rt.erase('light', x * TILE - 32, 2 * TILE - 40);
  }

  private addStockLabel(key: string, item: string, x: number, y: number, icon?: Phaser.GameObjects.Image): void {
    const label = this.add.container(x * TILE + 1, y * TILE + 1).setDepth(470).setVisible(false);
    this.stockLabels.set(key, { item, x, y, icon, label, shown: -1 });
  }

  /** Campaña: cuántas unidades quedan en cada caja; gris si está vacía. */
  private syncStock(): void {
    const stock = this.sim.stock;
    for (const v of this.stockLabels.values()) {
      if (!stock) {
        v.label.setVisible(false);
        continue;
      }
      const n = Math.max(0, stock[v.item] ?? 0);
      if (n === v.shown) continue;
      v.shown = n;
      v.label.removeAll(true);
      const digits = String(Math.min(n, 99));
      const w = digits.length * 4 + 1;
      v.label.add(this.add.rectangle(0, 0, w, 7, n === 0 ? 0xc0392b : 0x2b1d14, 0.85).setOrigin(0));
      [...digits].forEach((d, i) => v.label.add(this.add.image(1 + i * 4, 1, `digitw_${d}`).setOrigin(0)));
      v.label.setVisible(true);
      v.icon?.setTint(n === 0 ? 0x555555 : 0xffffff);
    }
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    this.moveLocal(dt);
    this.syncStock();

    this.syncStations(time);
    this.syncPlayers(time, dt);
    this.syncCustomers(time);
    this.syncSpills();
    this.drawNight();
    this.drawOverlay(time);
    // La música se acelera en los últimos 30 segundos.
    audio.setIntensity(this.sim.ended || net.paused ? 0 : 1 - this.sim.timeLeft / 30);
  }

  // ---------------------------------------------------------------- red

  private pose(): InputMessage {
    const p = this.localPlayer!;
    return { x: p.x, y: p.y, fx: p.fx, fy: p.fy, moving: p.inputX !== 0 || p.inputY !== 0 };
  }

  /** Predicción: el cocinero propio se mueve al instante y el servidor solo lo valida. */
  private moveLocal(dt: number): void {
    const p = this.localPlayer;
    if (!p || this.sim.ended) return;
    if (net.paused) {
      // En pausa nadie se mueve.
      p.inputX = p.inputY = 0;
      return;
    }
    const k = this.keys;
    let x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (x === 0 && y === 0) {
      x = this.touch.x;
      y = this.touch.y;
    }
    if (x === 0 && y === 0) {
      x = pad.x;
      y = pad.y;
    }
    this.sim.setInput(p.id, x, y);
    this.sim.stepPlayer(p, dt);

    this.sendTimer -= dt * 1000;
    if (this.sendTimer <= 0) {
      this.sendTimer = TICK_MS;
      net.sendInput(this.pose());
    }
  }

  private exitTo(scene: 'lobby' | 'summary' | 'perks' | 'shop' | 'campaign', delay = 0): void {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(delay, () => {
      this.scene.stop('hud');
      this.scene.start(scene);
    });
  }

  // ---------------------------------------------------------------- mundo

  private buildWorld(): void {
    const { tiles } = this.sim.kitchen;
    for (const row of tiles) {
      for (const t of row) {
        this.add.image(t.x * TILE, t.y * TILE, tileKey(t)).setOrigin(0);
        if (t.kind === 'crate') {
          const icon =
            t.crate === 'carne_cruda' ? 'ing_carne_cruda' : t.crate === 'pan' ? 'ing_pan_top' : t.crate === 'patatas' ? 'side_patatas' : `ing_${t.crate}`;
          const img = this.add.image(t.x * TILE + 8, t.y * TILE + 10, icon).setOrigin(0.5, 1).setDepth(1);
          this.addStockLabel(`${t.x},${t.y}`, t.crate!, t.x, t.y, img);
        }
        if (t.kind === 'drinks') this.addStockLabel(`${t.x},${t.y}`, 'refresco', t.x, t.y);
        if (this.sim.station(t.x, t.y)) {
          const container = this.add.container(t.x * TILE + 8, t.y * TILE + 11).setDepth(10 + t.y * TILE);
          this.stations.set(`${t.x},${t.y}`, { container, sig: '', layers: 0, warned: 0, steamAt: 0 });
        }
      }
    }
  }

  private layoutCamera(): void {
    const { width: W, height: H } = this.scale;
    const L = computeLayout(W, H, isTouchDevice());
    const worldW = this.sim.kitchen.width * TILE;
    const worldH = this.sim.kitchen.height * TILE;
    const fit = Math.min(L.kitchen.w / worldW, L.kitchen.h / worldH);
    // En vertical la cocina cabría muy pequeña: acercamos la cámara y seguimos al cocinero.
    let zoom = L.portrait ? Math.min(L.kitchen.h / worldH, fit * 1.5) : fit;
    if (zoom >= 4) zoom = Math.floor(zoom);
    const viewW = Math.min(L.kitchen.w, Math.ceil(worldW * zoom));
    const viewH = Math.min(L.kitchen.h, Math.ceil(worldH * zoom));
    const cam = this.cameras.main;
    cam.setViewport(L.kitchen.x + (L.kitchen.w - viewW) / 2, L.kitchen.y + (L.kitchen.h - viewH) / 2, viewW, viewH);
    cam.setZoom(zoom);
    cam.setBounds(0, 0, worldW, worldH);
    cam.setRoundPixels(true);
    const chef = this.players.get(net.id)?.sprite;
    if (chef && zoom > fit + 0.01) cam.startFollow(chef, true, 0.15, 0.15);
    else {
      cam.stopFollow();
      cam.centerOn(worldW / 2, worldH / 2);
    }
  }

  private syncStations(time: number): void {
    let grills = 0;
    let fryers = 0;
    for (const [k, view] of this.stations) {
      const [x, y] = k.split(',').map(Number);
      const item = this.sim.station(x, y)!.item;
      const kind = this.sim.tile(x, y)?.kind;
      const hot = item && item.kind !== 'burnt' && (kind === 'grill' || kind === 'fryer');
      if (hot) {
        if (kind === 'grill') grills++;
        else fryers++;
        // Vapor que sube de la plancha y la freidora.
        if (time > view.steamAt) {
          view.steamAt = time + 260 + Math.random() * 200;
          this.puff(x * TILE + 4 + Math.random() * 8, y * TILE + 6, 0xffffff, 0.7);
        }
      }
      const sig = itemSignature(item);
      if (sig === view.sig) continue;
      const layers = item?.kind === 'food' ? item.layers.length : 0;
      if (kind === 'montaje' && view.layers > 0 && layers > view.layers) audio.stack(layers - 1);
      view.layers = layers;
      view.sig = sig;
      view.warned = 0;
      fillItem(view.container, item);
      // Saltito al cambiar lo que hay encima.
      if (item) this.tweens.add({ targets: view.container, scaleX: { from: 1.25, to: 1 }, scaleY: { from: 0.8, to: 1 }, duration: 160, ease: 'Back.Out' });
    }
    audio.setAmbience(net.paused ? 0 : grills, net.paused ? 0 : fryers);
  }

  /** Una nubecilla que sube y se desvanece. */
  private puff(px: number, py: number, tint: number, alpha: number): void {
    const s = this.add.image(px, py, 'icon_smoke').setScale(0.6).setTint(tint).setAlpha(alpha).setDepth(450);
    this.tweens.add({
      targets: s,
      y: py - 8 - Math.random() * 4,
      x: px + (Math.random() - 0.5) * 4,
      alpha: 0,
      scale: 1,
      duration: 800,
      onComplete: () => s.destroy(),
    });
  }

  /** Destellos al servir (más y dorados si ha sido perfecto). */
  private sparkle(px: number, py: number, perfect: boolean): void {
    const n = perfect ? 10 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d = 8 + Math.random() * 8;
      const sp = this.add.image(px, py, 'icon_spark').setDepth(460).setScale(perfect ? 1 : 0.7);
      if (!perfect) sp.setTint(0xffffff);
      this.tweens.add({
        targets: sp,
        x: px + Math.cos(a) * d,
        y: py + Math.sin(a) * d - 4,
        alpha: 0,
        angle: 90,
        duration: 500 + Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => sp.destroy(),
      });
    }
  }

  private syncPlayers(time: number, dt: number): void {
    for (const [id, view] of this.players) {
      if (this.sim.players.has(id)) continue;
      view.sprite.destroy();
      view.shadow.destroy();
      view.held.destroy();
      this.players.delete(id);
    }
    for (const p of this.sim.players.values()) {
      let view = this.players.get(p.id);
      if (!view) {
        const shadow = this.add.ellipse(0, 0, 10, 4, 0x000000, 0.25);
        const sprite = this.add.image(0, 0, chefKey(p.look ?? p.color, 'down', 0)).setOrigin(0.5, 1);
        const held = this.add.container(0, 0);
        view = { sprite, shadow, held, heldSig: '', rx: p.x, ry: p.y };
        this.players.set(p.id, view);
        if (p.id === net.id) this.layoutCamera(); // ya hay a quién seguir
      }
      if (p.id === net.id) {
        view.rx = p.x;
        view.ry = p.y;
      } else {
        // Los demás llegan a saltos de ~50 ms: los acercamos poco a poco a su última posición.
        const f = Math.min(1, dt * 14);
        view.rx += (p.x - view.rx) * f;
        view.ry += (p.y - view.ry) * f;
        if (Math.hypot(p.x - view.rx, p.y - view.ry) > 2) {
          view.rx = p.x;
          view.ry = p.y;
        }
      }
      const moving = p.inputX !== 0 || p.inputY !== 0;
      const frame = moving ? Math.floor(time / 140) % 2 : 0;
      const dir = p.fy < 0 ? 'up' : p.fy > 0 ? 'down' : 'side';
      const px = Math.round(view.rx * TILE);
      const py = Math.round(view.ry * TILE + 5);
      view.sprite
        .setTexture(chefKey(p.look ?? p.color, dir, frame))
        .setFlipX(dir === 'side' && p.fx < 0)
        .setPosition(px, py - (moving && frame === 1 ? 1 : 0))
        .setDepth(10 + py);
      view.shadow.setPosition(px, py).setDepth(9 + py);

      const sig = itemSignature(p.holding);
      if (sig !== view.heldSig) {
        const had = view.heldSig !== '' && view.heldSig !== itemSignature(null);
        view.heldSig = sig;
        fillItem(view.held, p.holding);
        if (p.id === net.id && time - this.lastActionSound > 200) {
          if (p.holding && p.holding.kind === 'food' && had && p.holding.layers.length > 1) audio.stack(p.holding.layers.length - 1);
          else audio.sfx(p.holding ? 'pick' : 'drop');
        }
        if (p.holding) this.tweens.add({ targets: view.held, scale: { from: 1.3, to: 1 }, duration: 150, ease: 'Back.Out' });
      }
      view.held.setPosition(px, view.sprite.y - 13).setDepth(11 + py);
    }
  }

  private syncCustomers(time: number): void {
    const orders = this.sim.orders;
    for (const [id, view] of this.customers) {
      if (!orders.some((o) => o.id === id) && !view.leaving) this.sendAway(id, true);
    }
    for (const order of orders) {
      let view = this.customers.get(order.id);
      if (!view) view = this.spawnCustomer(order);
      if (view.taken !== order.taken) this.rebuildBubble(view, order);
      for (const [part, img] of Object.entries(view.parts)) img.setAlpha(order.done[part as OrderPart] ? 0.25 : 1);
      const ratio = Math.max(0, order.patience / order.maxPatience);
      const color = ratio > 0.5 ? 0x43b049 : ratio > 0.25 ? 0xffa726 : 0xe5483a;
      view.bar.clear().fillStyle(0x2b1d14).fillRect(-8, 0, 16, 3).fillStyle(color).fillRect(-7, 1, Math.max(1, Math.round(14 * ratio)), 1);
      // Los clientes impacientes dan saltitos y sudan.
      if (ratio < 0.25 && !this.tweens.isTweening(view.sprite)) {
        view.sprite.y = view.baseY - (Math.floor(time / 180) % 2);
      }
      const nervous = ratio < 0.35 && !view.leaving;
      view.sweat.setVisible(nervous);
      if (nervous) view.sweat.setPosition(view.sprite.x + 5, view.sprite.y - 15 + (Math.floor(time / 300) % 2));
    }
  }

  private spawnCustomer(order: Order): CustomerView {
    if (order.takeaway) return this.spawnRider(order);
    const x = this.sim.slots[order.slot] * TILE;
    const y = CUSTOMER_Y * TILE + 5;
    const fromLeft = order.slot < 2 || (order.slot === 2 && order.id % 2 === 0);
    const sprite = this.add.image(fromLeft ? -12 : this.sim.kitchen.width * TILE + 12, y, customerKey(order.look)).setOrigin(0.5, 1).setDepth(10 + y);
    const sweat = this.add.image(x + 5, y - 15, 'icon_sweat').setDepth(11 + y).setVisible(false);
    const view: CustomerView = { sprite, sweat, ...this.buildBubble(order, x, y - 18), taken: order.taken, leaving: false, baseY: y };
    view.bubble.setAlpha(0);
    this.tweens.add({
      targets: sprite,
      x,
      duration: 900,
      ease: 'Quad.Out',
      onComplete: () => view.bubble.active && this.tweens.add({ targets: view.bubble, alpha: 1, duration: 200 }),
    });
    this.customers.set(order.id, view);
    return view;
  }

  /** Repartidor de un pedido para llevar: se asoma por la ventanilla con su casco. */
  private spawnRider(order: Order): CustomerView {
    const [wx, wy] = this.slotPos(-1);
    const x = wx * TILE;
    const y = (wy + 0.75) * TILE;
    const sprite = this.add.image(x - 10, y, customerKey(order.look)).setOrigin(0.5, 1).setDepth(10 + y).setAlpha(0).setTint(0xdfe8ff);
    const sweat = this.add.image(x + 5, y - 15, 'icon_sweat').setDepth(11 + y).setVisible(false);
    const view: CustomerView = { sprite, sweat, ...this.buildBubble(order, x + 22, y - 18), taken: true, leaving: false, baseY: y };
    view.bubble.setAlpha(0);
    this.tweens.add({
      targets: sprite,
      x,
      alpha: 1,
      duration: 500,
      onComplete: () => view.bubble.active && this.tweens.add({ targets: view.bubble, alpha: 1, duration: 200 }),
    });
    this.customers.set(order.id, view);
    return view;
  }

  private rebuildBubble(view: CustomerView, order: Order): void {
    const { x, y } = view.bubble;
    view.bubble.destroy();
    Object.assign(view, this.buildBubble(order, x, y), { taken: order.taken });
  }

  /**
   * Bocadillo del cliente: número y paciencia siempre; el pedido solo cuando la caja ya ha
   * tomado nota (antes, unos puntos suspensivos: hay que ir a atenderle).
   */
  private buildBubble(order: Order, x: number, y: number): Pick<CustomerView, 'bubble' | 'bar' | 'parts'> {
    const layers = orderLayers(order);
    const sides = order.taken ? (order.fries ? 1 : 0) + (order.drink ? 1 : 0) : 0;
    const innerW = order.taken ? 14 + sides * 13 : 16;
    const bubbleH = order.taken ? Math.max(stackPixelHeight(layers), 11) + 12 : 16;
    const half = Math.ceil(innerW / 2) + 2;
    const bubble = this.add.container(x, y).setDepth(400);
    const bg = this.add.graphics();
    bg.fillStyle(0x2b1d14).fillRect(-half + 1, -bubbleH, half * 2 - 2, bubbleH).fillRect(-half, -bubbleH + 1, half * 2, bubbleH - 2);
    bg.fillStyle(0xffffff).fillRect(-half + 2, -bubbleH + 1, half * 2 - 4, bubbleH - 2).fillRect(-half + 1, -bubbleH + 2, half * 2 - 2, bubbleH - 4);
    bg.fillStyle(0x2b1d14).fillRect(-2, 0, 4, 1).fillRect(-1, 1, 2, 1);
    bubble.add(bg);
    // Número del hueco, o una bolsa si es para llevar.
    bubble.add(this.add.image(-half + 2, -bubbleH + 2, order.takeaway ? 'icon_bag' : `digit_${order.slot + 1}`).setOrigin(0));
    // Clientes especiales: estrella dorada (crítico) o confeti (cumpleaños) encima del bocadillo.
    if (order.special) {
      const icon = this.add.image(half - 1, -bubbleH - 1, order.special === 'critico' ? 'icon_star' : 'icon_confetti').setOrigin(0.5);
      if (order.special === 'cumple') icon.setScale(2).setTint(0xf28ac0);
      bubble.add(icon);
    } else if (order.mood === 'noctambulo') {
      bubble.add(this.add.image(half - 1, -bubbleH - 1, 'icon_moon').setOrigin(0.5));
    } else if (order.mood === 'prisa' || order.mood === 'habitual') {
      // Con prisa: reloj; habitual: corazón.
      bubble.add(this.add.image(half - 1, -bubbleH - 1, order.mood === 'prisa' ? 'icon_clock' : 'icon_heart').setOrigin(0.5));
    }
    const parts: CustomerView['parts'] = {};

    if (!order.taken) {
      const dots = this.add.graphics();
      dots.fillStyle(0x2b1d14);
      for (const dx of [-3, 1, 5]) dots.fillRect(dx, -10, 2, 2);
      bubble.add(dots);
    } else {
      let px = -innerW / 2 + 6;
      const burger = this.add.container(px, -5);
      fillStack(burger, layers);
      bubble.add(burger);
      parts.burger = burger;
      if (order.fries) {
        px += 13;
        const fries = this.add.image(px, -5, 'side_fritas').setOrigin(0.5, 1);
        bubble.add(fries);
        parts.fries = fries;
      }
      if (order.drink) {
        px += 13;
        const drink = this.add.image(px, -5, drinkKey(order.drink)).setOrigin(0.5, 1);
        bubble.add(drink);
        parts.drink = drink;
      }
    }
    const bar = this.add.graphics({ x: 0, y: -4 });
    bubble.add(bar);
    return { bubble, bar, parts };
  }

  private sendAway(orderId: number, happy: boolean): void {
    const view = this.customers.get(orderId);
    if (!view || view.leaving) return;
    view.leaving = true;
    view.bubble.destroy();
    view.sweat.destroy();
    if (!happy) view.sprite.setTint(0xff9999);
    const worldW = this.sim.kitchen.width * TILE;
    const exitX = view.sprite.x < worldW / 2 ? -14 : worldW + 14;
    this.tweens.add({
      targets: view.sprite,
      y: view.sprite.y - (happy ? 4 : 0),
      duration: 120,
      yoyo: true,
      repeat: happy ? 1 : 0,
      onComplete: () =>
        this.tweens.add({
          targets: view.sprite,
          x: exitX,
          duration: 900,
          ease: 'Quad.In',
          onComplete: () => {
            view.sprite.destroy();
            this.customers.delete(orderId);
          },
        }),
    });
  }

  /** Casilla resaltada delante del cocinero y barras de plancha, freidora y bebidas. */
  private drawOverlay(time: number): void {
    const g = this.overlay.clear();

    const me = this.localPlayer;
    const t = me && this.sim.targetTile(me);
    if (me && t && t.kind !== 'floor' && t.kind !== 'outside' && t.kind !== 'wall') {
      const role = roleFor(t.kind);
      const mine = !role || me.roles.includes(role);
      const a = 0.55 + 0.35 * Math.sin(time / 120);
      // Blanco si es tu puesto; rojo si es de otro compañero.
      g.lineStyle(1, mine ? 0xffffff : 0xff6b5b, a).strokeRect(t.x * TILE + 0.5, t.y * TILE + 0.5, TILE - 1, TILE - 1);
    }

    // Eventos aleatorios: la freidora averiada parpadea en rojo y echa humo; con el apagón las máquinas
    // de bebida se quedan a oscuras; con la plancha a tope, las planchas brillan.
    const inc = this.sim.incident;
    if (inc) {
      const blink = Math.floor(time / 250) % 2 === 0;
      for (const row of this.sim.kitchen.tiles) {
        for (const tile of row) {
          const px = tile.x * TILE;
          const py = tile.y * TILE;
          if (inc.kind === 'averia' && inc.station === `${tile.x},${tile.y}`) {
            g.fillStyle(0xe5483a, blink ? 0.45 : 0.2).fillRect(px, py, TILE, TILE);
            g.lineStyle(2, 0xffffff, 0.9).lineBetween(px + 4, py + 4, px + 12, py + 12).lineBetween(px + 12, py + 4, px + 4, py + 12);
            if (Math.random() < 0.06) this.puff(px + 4 + Math.random() * 8, py + 4, 0x555555, 0.8);
          } else if (inc.kind === 'apagon' && tile.kind === 'drinks') {
            g.fillStyle(0x000000, 0.55).fillRect(px, py, TILE, TILE);
          } else if (inc.kind === 'plancha' && tile.kind === 'grill') {
            g.fillStyle(0xff6b1a, blink ? 0.35 : 0.18).fillRect(px, py, TILE, TILE);
          }
        }
      }
    }

    for (const [k, view] of this.stations) {
      const [x, y] = k.split(',').map(Number);
      const kind = this.sim.tile(x, y)?.kind;
      const st = this.sim.station(x, y)!;
      const item = st.item;
      const bx = x * TILE + 2;
      const by = y * TILE - 2;

      if (kind === 'drinks') {
        if (item?.kind === 'drink' && item.fill < 1) {
          g.fillStyle(0x2b1d14).fillRect(bx, by, 12, 3);
          g.fillStyle(0x4fa3e0).fillRect(bx + 1, by + 1, Math.max(1, Math.round(10 * item.fill)), 1);
        }
        continue;
      }
      if (kind !== 'grill' && kind !== 'fryer') continue;
      if (!item || item.kind === 'burnt') continue;
      const grill = kind === 'grill';
      const cooking = item.kind === 'raw' || item.kind === 'potatoes';
      // Con habilidades o mejoras, cada puesto cocina y quema a su ritmo.
      const ratio = cooking
        ? (item as { cook: number }).cook / ((grill ? CONFIG.cookTime : CONFIG.fryTime) / (st.rate || 1))
        : st.overcook / ((grill ? CONFIG.burnTime : CONFIG.fryBurnTime) * (st.burnRate || 1));
      g.fillStyle(0x2b1d14).fillRect(bx, by, 12, 3);
      if (cooking) {
        g.fillStyle(0x43b049).fillRect(bx + 1, by + 1, Math.max(1, Math.round(10 * ratio)), 1);
      } else {
        // Ya está hecho: aviso parpadeante cada vez más rápido antes de quemarse.
        const blink = ratio > 0.5 && Math.floor(time / (ratio > 0.8 ? 80 : 200)) % 2 === 0;
        // Aviso sonoro al pasar de la mitad y al 80 %, y humo oscuro.
        const level = ratio > 0.8 ? 2 : ratio > 0.5 ? 1 : 0;
        if (level > view.warned) {
          view.warned = level;
          audio.sfx('warn');
        }
        if (ratio > 0.5 && Math.random() < 0.08) this.puff(x * TILE + 4 + Math.random() * 8, y * TILE + 6, 0x777777, 0.7);
        g.fillStyle(blink ? 0xffffff : 0xe5483a).fillRect(bx + 1, by + 1, Math.max(1, Math.round(10 * ratio)), 1);
      }
      view.container.y = y * TILE + 11 - (cooking ? 0 : Math.floor(time / 150) % 2);
    }
  }

  private handleEvent(ev: SimEvent): void {
    const now = this.time.now;
    switch (ev.type) {
      case 'served': {
        const c = this.customers.get(ev.orderId);
        if (c) this.sparkle(c.sprite.x, c.sprite.y - 10, ev.perfect);
        this.sendAway(ev.orderId, true);
        audio.sfx(ev.perfect ? 'perfect' : 'served');
        this.lastActionSound = now;
        break;
      }
      case 'stolen':
        this.sendAway(ev.orderId, false);
        break;
      case 'spill':
        audio.sfx('drop');
        break;
      case 'clean':
        audio.sfx(ev.left ? 'tick' : 'coin');
        this.lastActionSound = now;
        break;
      case 'part':
        audio.sfx('part');
        this.lastActionSound = now;
        break;
      case 'lost':
        this.sendAway(ev.orderId, false);
        this.cameras.main.shake(160, 0.004);
        audio.sfx('lost');
        break;
      case 'wrong':
        this.cameras.main.shake(200, 0.006);
        audio.sfx('wrong');
        this.lastActionSound = now;
        break;
      case 'burnt':
        this.smoke(ev.x, ev.y);
        audio.sfx('burnt');
        break;
      case 'cooked':
        audio.sfx('cooked');
        break;
      case 'filled':
        audio.sfx('filled');
        break;
      case 'newOrder':
        audio.sfx('newOrder');
        break;
      case 'taken':
        audio.sfx('taken');
        break;
      case 'trash':
        audio.sfx('trash');
        this.lastActionSound = now;
        break;
      case 'denied':
        if (ev.playerId === net.id) audio.sfx('denied');
        break;
      case 'given':
        if (ev.from === net.id || ev.to === net.id) {
          audio.sfx('given');
          this.lastActionSound = now;
        }
        break;
    }
    this.events.emit('sim', ev);
  }

  private smoke(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const s = this.add.image(x * TILE + 4 + i * 3, y * TILE + 4, 'icon_smoke').setDepth(450);
      this.tweens.add({ targets: s, y: s.y - 14, alpha: 0, delay: i * 120, duration: 900, onComplete: () => s.destroy() });
    }
  }
}
