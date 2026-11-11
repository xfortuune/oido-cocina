// Simulación de un turno en la cocina: cocineros, puestos, pedidos y puntuación.
// No depende de Phaser ni del navegador. El servidor Colyseus la ejecuta como autoridad
// (pedidos, tiempos, objetos y puntuación) y los clientes tienen una copia que se actualiza
// con instantáneas del servidor; cada cliente solo mueve a su propio cocinero.

import {
  CUSTOMER_SLOTS_X,
  parseKitchen,
  PLAYER_SPAWNS,
  type CrateContent,
  type Flavor,
  type Kitchen,
  type Tile,
  type TileKind,
} from './kitchen';
import { levelParams, RECIPE_LEVEL, type LevelParams } from './levels';
import { perkCount } from './perks';
import { EXTRA_GRILL } from './shop';
import { getRecipe, type Ingredient } from './recipes';

export const CONFIG = {
  maxStack: 12,
  startReputation: 50,
  maxReputation: 100,
  /**
   * Paciencia = (base + segundos por capa y por acompañamiento) × la del nivel;
   * se reduce un 15 % hacia el final de la ronda. El ritmo de clientes lo marca el nivel (levels.ts).
   */
  patienceBase: 40,
  patiencePerLayer: 6,
  patiencePerSide: 12,
  friesPrice: 3,
  drinkPrice: 2,
  perfectThreshold: 0.5,
  wrongMoneyPenalty: 3,
  wrongRepPenalty: 5,
  lostMoneyPenalty: 2,
  lostRepPenalty: 8,
  trashCost: 1,
  burnCost: 1,
  /** Segundos de plancha hasta que la carne está hecha, y segundos extra hasta que se quema. */
  cookTime: 6,
  burnTime: 8,
  /** Lo mismo para las patatas en la freidora. */
  fryTime: 5,
  fryBurnTime: 8,
  /** Segundos que tarda en llenarse un vaso. */
  fillTime: 3,
  playerSpeed: 4.2,
  playerRadius: 0.3,
};

/** Lo que se puede llevar en las manos o dejar en una encimera. */
export type Item =
  | { kind: 'raw'; cook: number }
  | { kind: 'potatoes'; cook: number }
  | { kind: 'fries' }
  | { kind: 'burnt'; what: 'carne' | 'patatas' }
  | { kind: 'drink'; flavor: Flavor; fill: number }
  /** Un ingrediente suelto o una hamburguesa a medio montar (capas de abajo arriba). */
  | { kind: 'food'; layers: Ingredient[] };

/** Puestos de trabajo. Un jugador puede tener varios si sois menos de cuatro. */
export type Role = 'caja' | 'plancha' | 'montaje' | 'freidora';
export const ROLES: Role[] = ['caja', 'plancha', 'montaje', 'freidora'];
export const ROLE_NAMES: Record<Role, string> = {
  caja: 'Caja',
  plancha: 'Plancha',
  montaje: 'Montaje',
  freidora: 'Freidora y bebidas',
};

/** Quién puede usar cada puesto. Cajas, encimeras y basura son de todos. */
const ROLE_FOR: Partial<Record<TileKind, Role>> = {
  pase: 'caja',
  grill: 'plancha',
  montaje: 'montaje',
  fryer: 'freidora',
  drinks: 'freidora',
};

export function roleFor(kind: TileKind): Role | undefined {
  return ROLE_FOR[kind];
}

export interface Station {
  item: Item | null;
  /** Segundos que lleva lo ya cocinado en la plancha o la freidora (para saber cuándo se quema). */
  overcook: number;
  /** Velocidad de cocinado/llenado y aguante antes de quemarse, según las habilidades de quien lo puso. */
  rate: number;
  burnRate: number;
}

export interface Player {
  id: string;
  name: string;
  /** Índice de color del delantal. */
  color: number;
  x: number;
  y: number;
  /** Dirección a la que mira (uno de los cuatro ejes). */
  fx: number;
  fy: number;
  inputX: number;
  inputY: number;
  holding: Item | null;
  roles: Role[];
  /** Mini-habilidades de la partida (perks.ts); las repetidas suman. */
  perks: string[];
}

/** Contribución de cada jugador, para elegir al MVP del turno. */
export interface PlayerStats {
  taken: number;
  delivered: number;
  cooked: number;
  assembled: number;
  mistakes: number;
}

export function mvpScore(s: PlayerStats): number {
  return s.delivered * 3 + s.taken * 2 + s.cooked * 2 + s.assembled - s.mistakes * 3;
}

export type OrderPart = 'burger' | 'fries' | 'drink';

export interface Order {
  id: number;
  recipeId: string;
  fries: boolean;
  drink: Flavor | null;
  /** La caja ha tomado nota: hasta entonces la cocina no sabe qué quiere el cliente. */
  taken: boolean;
  /** Partes ya entregadas en el pase. El pedido se cobra cuando están todas. */
  done: Record<OrderPart, boolean>;
  patience: number;
  maxPatience: number;
  /** Hueco de la calle donde espera el cliente. */
  slot: number;
  /** Aspecto del cliente. */
  look: number;
}

export interface TurnStats {
  served: number;
  perfect: number;
  wrong: number;
  lost: number;
  burnt: number;
  trashed: number;
  tips: number;
  earned: number;
}

export type SimEvent =
  | { type: 'newOrder'; orderId: number }
  | { type: 'taken'; orderId: number; slot: number }
  | { type: 'denied'; playerId: string; role: Role }
  | { type: 'given'; from: string; to: string }
  | { type: 'served'; orderId: number; slot: number; earned: number; tip: number; perfect: boolean }
  | { type: 'part'; orderId: number; slot: number; part: OrderPart }
  | { type: 'wrong'; penalty: number; x: number; y: number }
  | { type: 'lost'; orderId: number; slot: number; penalty: number }
  | { type: 'trash'; cost: number; x: number; y: number }
  | { type: 'cooked'; x: number; y: number }
  | { type: 'filled'; x: number; y: number }
  | { type: 'burnt'; x: number; y: number; what: 'carne' | 'patatas'; cost: number }
  | { type: 'end'; reason: EndReason };

export type EndReason = 'time' | 'reputation';

/** Estado de la partida que el servidor envía a los clientes ~20 veces por segundo. */
export interface SimSnapshot {
  time: number;
  turnDuration: number;
  level: number;
  goal: number;
  money: number;
  reputation: number;
  ended: boolean;
  endReason: EndReason | null;
  stats: TurnStats;
  players: Player[];
  orders: Order[];
  /** Solo los puestos que tienen algo encima. */
  stations: [string, Station][];
  playerStats: Record<string, PlayerStats>;
}

export class KitchenSim {
  readonly kitchen: Kitchen;
  readonly stations = new Map<string, Station>();
  readonly players = new Map<string, Player>();

  time = 0;
  money = 0;
  reputation = CONFIG.startReputation;
  orders: Order[] = [];
  stats: TurnStats = { served: 0, perfect: 0, wrong: 0, lost: 0, burnt: 0, trashed: 0, tips: 0, earned: 0 };
  ended = false;
  endReason: EndReason | null = null;
  /** Duración de la ronda en segundos (se puede acortar para pruebas). */
  turnDuration: number;
  level: number;
  /** Pedidos que hay que servir para pasar de nivel. */
  goal: number;
  playerStats: Record<string, PlayerStats> = {};

  /** En el servidor no se mueve a nadie: cada cliente manda la posición de su cocinero. */
  moveOnTick = true;
  /** Si hace falta que la caja tome nota (no en el modo de un jugador). */
  needsCaja = true;
  /** Fallos ya perdonados por Disculpa a tiempo en esta ronda, por jugador. */
  private forgiven: Record<string, number> = {};
  private nextId = 1;
  private spawnTimer: number;
  private events: SimEvent[] = [];

  constructor(
    /** Ritmo de la ronda: depende del nivel y de cuántos jugáis. */
    readonly params: LevelParams = levelParams(1, 1),
    private readonly random: () => number = Math.random,
    /** Mejoras de la tienda compradas en esta partida (shop.ts). */
    readonly upgrades: readonly string[] = [],
  ) {
    this.turnDuration = params.duration;
    this.level = params.level;
    this.goal = params.goal;
    // El primer cliente llega enseguida.
    this.spawnTimer = 2;
    this.kitchen = parseKitchen();
    if (upgrades.includes('plancha3')) {
      const t = this.kitchen.tiles[EXTRA_GRILL.y][EXTRA_GRILL.x];
      t.kind = 'grill';
    }
    for (const row of this.kitchen.tiles) {
      for (const t of row) {
        if (t.kind !== 'outside' && t.kind !== 'floor' && t.kind !== 'wall' && t.kind !== 'crate') {
          this.stations.set(key(t.x, t.y), { item: null, overcook: 0, rate: 1, burnRate: 1 });
        }
      }
    }
  }

  get timeLeft(): number {
    return Math.max(0, this.turnDuration - this.time);
  }

  /** 0 al empezar el turno, 1 al terminarlo. */
  get progress(): number {
    return Math.min(1, this.time / this.turnDuration);
  }

  tile(x: number, y: number): Tile | undefined {
    return this.kitchen.tiles[y]?.[x];
  }

  station(x: number, y: number): Station | undefined {
    return this.stations.get(key(x, y));
  }

  // ------------------------------------------------------------ jugadores

  addPlayer(id: string, name: string, color: number, roles: Role[] = ROLES, perks: string[] = []): Player {
    const spawn = PLAYER_SPAWNS[color % PLAYER_SPAWNS.length];
    const p: Player = {
      id,
      name,
      color,
      x: spawn.x,
      y: spawn.y,
      fx: 0,
      fy: 1,
      inputX: 0,
      inputY: 0,
      holding: null,
      roles: [...roles],
      perks: [...perks],
    };
    this.players.set(id, p);
    this.playerStats[id] ??= { taken: 0, delivered: 0, cooked: 0, assembled: 0, mistakes: 0 };
    return p;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /**
   * Posición que dice tener un cliente. Se acepta si no atraviesa paredes ni va
   * más rápido de lo posible; si no, el servidor mantiene la suya y el cliente se corrige.
   */
  setPose(id: string, x: number, y: number, fx: number, fy: number, moving: boolean, dt: number): boolean {
    const p = this.players.get(id);
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    p.fx = Math.sign(fx);
    p.fy = p.fx !== 0 ? 0 : Math.sign(fy) || 1;
    p.inputX = moving ? 1 : 0;
    p.inputY = 0;
    const maxStep = speedOf(p) * Math.max(dt, 0.05) * 1.5 + 0.25;
    if (Math.hypot(x - p.x, y - p.y) > maxStep || this.blocked(x, y, CONFIG.playerRadius - 0.02)) return false;
    p.x = x;
    p.y = y;
    return true;
  }

  setInput(id: string, x: number, y: number): void {
    const p = this.players.get(id);
    if (!p) return;
    const len = Math.hypot(x, y);
    p.inputX = len > 1 ? x / len : x;
    p.inputY = len > 1 ? y / len : y;
  }

  /** Casilla que tiene delante el cocinero (la que se resalta y con la que interactúa). */
  targetTile(p: Player): Tile | undefined {
    return this.tile(Math.floor(p.x + p.fx * 0.8), Math.floor(p.y + p.fy * 0.8));
  }

  /** Botón de acción: coger, dejar, apilar, servir, tomar nota, pasar o tirar según lo que haya delante. */
  interact(id: string): void {
    const p = this.players.get(id);
    if (!p || this.ended) return;
    const t = this.targetTile(p);
    if (!t) return;
    const held = p.holding;
    const st0 = this.playerStats[id];

    // Pasar lo que llevas a un compañero que tienes delante con las manos libres.
    if (t.kind === 'floor') {
      const mate = [...this.players.values()].find(
        (o) => o !== p && !o.holding && Math.floor(o.x) === t.x && Math.floor(o.y) === t.y,
      );
      if (held && mate) {
        mate.holding = held;
        p.holding = null;
        this.events.push({ type: 'given', from: p.id, to: mate.id });
      }
      return;
    }

    const role = ROLE_FOR[t.kind];
    if (role && !p.roles.includes(role)) {
      this.events.push({ type: 'denied', playerId: p.id, role });
      return;
    }

    if (t.kind === 'crate') {
      const c = t.crate!;
      if (!held) p.holding = crateItem(c);
      else if (held.kind === 'food' && held.layers.length === 1 && held.layers[0] === c) p.holding = null;
      // Bandeja: con comida en las manos, el ingrediente se apila encima.
      else if (
        held.kind === 'food' &&
        has(p, 'bandeja') &&
        c !== 'carne_cruda' &&
        c !== 'patatas' &&
        held.layers.length < CONFIG.maxStack
      ) {
        held.layers.push(c);
        st0.assembled++;
      }
      return;
    }

    const st = this.station(t.x, t.y);
    if (!st) return;

    switch (t.kind) {
      case 'trash':
        if (held) {
          p.holding = null;
          this.money -= CONFIG.trashCost;
          this.stats.trashed++;
          this.events.push({ type: 'trash', cost: CONFIG.trashCost, x: t.x, y: t.y });
        }
        return;

      case 'pase':
        // El pase no guarda cosas: con las manos vacías se toma nota, y si no, se entrega.
        if (!held) {
          const next = this.orders.filter((o) => !o.taken).sort((a, b) => a.id - b.id)[0];
          if (next) {
            next.taken = true;
            // Labia: el cliente al que tomas nota espera más.
            const extra = 1 + 0.2 * perkCount(p.perks, 'labia');
            next.patience *= extra;
            next.maxPatience *= extra;
            st0.taken++;
            this.events.push({ type: 'taken', orderId: next.id, slot: next.slot });
          }
        } else if (this.deliver(held, t, id)) p.holding = null;
        return;

      case 'grill':
      case 'fryer':
        if (!held && st.item) {
          p.holding = st.item;
          st.item = null;
        } else if (held?.kind === (t.kind === 'grill' ? 'raw' : 'potatoes') && !st.item) {
          st.item = held;
          st.overcook = 0;
          const grill = t.kind === 'grill';
          st.rate =
            (1 + 0.25 * perkCount(p.perks, grill ? 'vuelta' : 'aceite')) *
            (this.upgrades.includes(grill ? 'parrilla' : 'freidora') ? (grill ? 1.2 : 1.3) : 1);
          st.burnRate = (1 + 0.6 * perkCount(p.perks, 'termometro')) * (this.upgrades.includes('extintor') ? 1.3 : 1);
          p.holding = null;
          st0.cooked++;
        }
        return;

      case 'drinks':
        // Con las manos vacías: se pone un vaso a llenar, y cuando está lleno se recoge.
        if (!held && !st.item) {
          st.item = { kind: 'drink', flavor: t.flavor!, fill: 0 };
          st.rate = (1 + 0.35 * perkCount(p.perks, 'grifo')) * (this.upgrades.includes('dispensador') ? 1.4 : 1);
          st0.cooked++;
        }
        else if (!held && st.item?.kind === 'drink' && st.item.fill >= 1) {
          p.holding = st.item;
          st.item = null;
        }
        return;

      case 'montaje':
        if (held?.kind === 'food' && st.item?.kind === 'food') {
          if (st.item.layers.length + held.layers.length <= CONFIG.maxStack) {
            st.item.layers.push(...held.layers);
            p.holding = null;
            st0.assembled += held.layers.length;
          }
          return;
        }
        break;
    }

    // Encimeras normales (y montaje/pase sin apilar): dejar o coger.
    if (held && !st.item) {
      st.item = held;
      p.holding = null;
    } else if (!held && st.item) {
      p.holding = st.item;
      st.item = null;
    }
  }

  // ------------------------------------------------------------ bucle

  tick(dt: number): void {
    if (this.ended) return;
    this.time += dt;

    if (this.moveOnTick) for (const p of this.players.values()) this.stepPlayer(p, dt);
    this.cook(dt);

    for (const order of [...this.orders]) {
      order.patience -= dt;
      if (order.patience <= 0) {
        this.orders = this.orders.filter((o) => o !== order);
        this.money -= CONFIG.lostMoneyPenalty;
        this.reputation -= CONFIG.lostRepPenalty;
        this.stats.lost++;
        this.events.push({ type: 'lost', orderId: order.id, slot: order.slot, penalty: CONFIG.lostRepPenalty });
      }
    }

    // Nunca dejamos la cocina vacía mucho rato.
    if (this.orders.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 2);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      if (this.orders.length < this.params.maxOrders) this.spawnOrder();
      this.spawnTimer = lerp(this.params.spawnStart, this.params.spawnEnd, this.progress);
    }

    if (this.reputation <= 0) this.finish('reputation');
    else if (this.time >= this.turnDuration) this.finish('time');
  }

  snapshot(): SimSnapshot {
    return {
      time: this.time,
      turnDuration: this.turnDuration,
      level: this.level,
      goal: this.goal,
      money: this.money,
      reputation: this.reputation,
      ended: this.ended,
      endReason: this.endReason,
      stats: this.stats,
      players: [...this.players.values()],
      orders: this.orders,
      stations: [...this.stations].filter(([, st]) => st.item),
      playerStats: this.playerStats,
    };
  }

  /**
   * Copia el estado del servidor. El cocinero local conserva su posición predicha
   * salvo que el servidor la haya rechazado (diferencia grande).
   */
  applySnapshot(s: SimSnapshot, localId?: string): void {
    this.time = s.time;
    this.turnDuration = s.turnDuration;
    this.level = s.level;
    this.goal = s.goal;
    this.money = s.money;
    this.reputation = s.reputation;
    this.ended = s.ended;
    this.endReason = s.endReason;
    this.stats = s.stats;
    this.orders = s.orders;
    this.playerStats = s.playerStats;
    for (const st of this.stations.values()) st.item = null;
    for (const [k, st] of s.stations) {
      const local = this.stations.get(k);
      if (local) Object.assign(local, st);
    }
    const seen = new Set<string>();
    for (const sp of s.players) {
      seen.add(sp.id);
      const p = this.players.get(sp.id);
      if (sp.id === localId && p) {
        const far = Math.hypot(p.x - sp.x, p.y - sp.y) > 1.2;
        Object.assign(p, { ...sp, x: far ? sp.x : p.x, y: far ? sp.y : p.y, fx: p.fx, fy: p.fy, inputX: p.inputX, inputY: p.inputY });
      } else if (p) Object.assign(p, sp);
      else this.players.set(sp.id, { ...sp });
    }
    for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
  }

  /** Devuelve y vacía la cola de eventos (para efectos visuales y sonidos). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Mueve a un cocinero según su joystick (también lo usa el cliente para su propio cocinero). */
  stepPlayer(p: Player, dt: number): void {
    const { inputX: ix, inputY: iy } = p;
    if (ix === 0 && iy === 0) return;
    // Mira hacia el eje dominante del movimiento.
    if (Math.abs(ix) >= Math.abs(iy)) {
      p.fx = Math.sign(ix);
      p.fy = 0;
    } else {
      p.fx = 0;
      p.fy = Math.sign(iy);
    }
    const r = CONFIG.playerRadius;
    const step = speedOf(p) * dt;

    // Cada eje por separado, para poder deslizarse pegado a las encimeras.
    const nx = p.x + ix * step;
    if (!this.blocked(nx, p.y, r)) p.x = nx;
    else if (ix > 0) p.x = Math.floor(nx + r) - r - 0.001;
    else if (ix < 0) p.x = Math.floor(nx - r) + 1 + r + 0.001;

    const ny = p.y + iy * step;
    if (!this.blocked(p.x, ny, r)) p.y = ny;
    else if (iy > 0) p.y = Math.floor(ny + r) - r - 0.001;
    else if (iy < 0) p.y = Math.floor(ny - r) + 1 + r + 0.001;
  }

  /** Solo se puede andar por el suelo de la cocina. */
  blocked(x: number, y: number, r: number): boolean {
    for (const [cx, cy] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]) {
      if (this.tile(Math.floor(cx), Math.floor(cy))?.kind !== 'floor') return true;
    }
    return false;
  }

  /** Plancha, freidora y máquinas de bebidas. */
  private cook(dt: number): void {
    for (const [k, st] of this.stations) {
      const item = st.item;
      if (!item) continue;
      const [x, y] = k.split(',').map(Number);
      const kind = this.tile(x, y)?.kind;

      if (kind === 'drinks' && item.kind === 'drink' && item.fill < 1) {
        item.fill = Math.min(1, item.fill + (dt * st.rate) / CONFIG.fillTime);
        if (item.fill >= 1) this.events.push({ type: 'filled', x, y });
        continue;
      }
      if (kind !== 'grill' && kind !== 'fryer') continue;
      const grill = kind === 'grill';
      const cookTime = (grill ? CONFIG.cookTime : CONFIG.fryTime) / st.rate;
      const burnTime = (grill ? CONFIG.burnTime : CONFIG.fryBurnTime) * st.burnRate;

      if (item.kind === 'raw' || item.kind === 'potatoes') {
        item.cook += dt;
        if (item.cook >= cookTime) {
          st.item = grill ? { kind: 'food', layers: ['carne'] } : { kind: 'fries' };
          st.overcook = 0;
          this.events.push({ type: 'cooked', x, y });
        }
      } else if (item.kind === 'food' || item.kind === 'fries') {
        st.overcook += dt;
        if (st.overcook >= burnTime) {
          const what = grill ? 'carne' : 'patatas';
          st.item = { kind: 'burnt', what };
          const cost = this.upgrades.includes('extintor') ? 0 : CONFIG.burnCost;
          this.money -= cost;
          this.stats.burnt++;
          this.events.push({ type: 'burnt', x, y, what, cost });
        }
      }
    }
  }

  /**
   * Entrega una parte (hamburguesa, patatas o bebida) al pedido más urgente que la necesite.
   * Devuelve false si lo que se lleva no se puede servir (carne cruda, vaso a medio llenar…).
   */
  private deliver(item: Item, at: Tile, by: string): boolean {
    const byUrgency = this.orders.filter((o) => o.taken).sort((a, b) => a.patience - b.patience);
    let part: OrderPart;
    let order: Order | undefined;
    if (item.kind === 'food') {
      part = 'burger';
      order = byUrgency.find((o) => !o.done.burger && sameLayers(getRecipe(o.recipeId).layers, item.layers));
    } else if (item.kind === 'fries') {
      part = 'fries';
      order = byUrgency.find((o) => o.fries && !o.done.fries);
    } else if (item.kind === 'drink' && item.fill >= 1) {
      part = 'drink';
      order = byUrgency.find((o) => o.drink === item.flavor && !o.done.drink);
    } else {
      return false;
    }

    if (!order) {
      // Disculpa a tiempo: los primeros fallos de la ronda (uno por cada vez que se cogió) no cuestan nada.
      const p = this.players.get(by);
      const forgiven = this.forgiven[by] ?? 0;
      if (p && forgiven < perkCount(p.perks, 'disculpa')) {
        this.forgiven[by] = forgiven + 1;
        this.stats.wrong++;
        this.playerStats[by].mistakes++;
        this.events.push({ type: 'wrong', penalty: 0, x: at.x, y: at.y });
        return true;
      }
      this.money -= CONFIG.wrongMoneyPenalty;
      this.reputation -= CONFIG.wrongRepPenalty;
      this.stats.wrong++;
      this.playerStats[by].mistakes++;
      this.events.push({ type: 'wrong', penalty: CONFIG.wrongMoneyPenalty, x: at.x, y: at.y });
      if (this.reputation <= 0) this.finish('reputation');
      return true;
    }

    order.done[part] = true;
    this.playerStats[by].delivered++;
    // Simpatía: cada parte entregada devuelve algo de paciencia.
    const giver = this.players.get(by);
    const charm = giver ? perkCount(giver.perks, 'simpatia') : 0;
    if (charm) order.patience = Math.min(order.maxPatience, order.patience + 0.12 * charm * order.maxPatience);
    this.events.push({ type: 'part', orderId: order.id, slot: order.slot, part });
    if (order.done.burger && (!order.fries || order.done.fries) && (!order.drink || order.done.drink)) {
      this.complete(order);
    }
    return true;
  }

  private complete(order: Order): void {
    const recipe = getRecipe(order.recipeId);
    const price = recipe.price + (order.fries ? CONFIG.friesPrice : 0) + (order.drink ? CONFIG.drinkPrice : 0);
    const ratio = order.patience / order.maxPatience;
    const perfect = ratio >= CONFIG.perfectThreshold;
    const earned = Math.round(price * (0.6 + 0.4 * ratio));
    const tip = perfect ? Math.ceil(price * 0.3) * (this.upgrades.includes('tarro') ? 2 : 1) : 0;

    this.orders = this.orders.filter((o) => o !== order);
    this.money += earned + tip;
    this.reputation = Math.min(CONFIG.maxReputation, this.reputation + (perfect ? 2 : 1));
    this.stats.served++;
    this.stats.earned += earned + tip;
    this.stats.tips += tip;
    if (perfect) this.stats.perfect++;
    this.events.push({ type: 'served', orderId: order.id, slot: order.slot, earned, tip, perfect });
  }

  private spawnOrder(): void {
    const used = new Set(this.orders.map((o) => o.slot));
    const free = CUSTOMER_SLOTS_X.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length === 0) return;
    const slot = free[Math.floor(this.random() * free.length)];
    const { recipes } = this.params;
    // Una receta recién estrenada (hace 2 niveles o menos) sale algo más, para que se note la novedad.
    const fresh = recipes[recipes.length - 1];
    const isFresh = recipes.length > 1 && RECIPE_LEVEL[fresh] >= this.level - 2;
    const recipeId =
      isFresh && this.random() < 0.25 ? fresh : recipes[Math.floor(this.random() * recipes.length)];
    const layers = getRecipe(recipeId).layers.length;
    const sideChance = this.params.sideChance;
    const fries = this.random() < sideChance;
    const drink: Flavor | null = this.random() < sideChance ? (this.random() < 0.5 ? 'cola' : 'naranja') : null;
    const sides = (fries ? 1 : 0) + (drink ? 1 : 0);
    const maxPatience =
      (CONFIG.patienceBase + layers * CONFIG.patiencePerLayer + sides * CONFIG.patiencePerSide) *
      this.params.patience *
      (this.upgrades.includes('terraza') ? 1.15 : 1) *
      lerp(1, 0.85, this.progress);
    const order: Order = {
      id: this.nextId++,
      recipeId,
      fries,
      drink,
      // Jugando solo, tomar nota sería un paso de más: el cliente dice directamente lo que quiere.
      taken: !this.needsCaja || this.players.size <= 1,
      done: { burger: false, fries: false, drink: false },
      patience: maxPatience,
      maxPatience,
      slot,
      look: Math.floor(this.random() * 1000),
    };
    this.orders.push(order);
    this.events.push({ type: 'newOrder', orderId: order.id });
  }

  private finish(reason: EndReason): void {
    this.ended = true;
    this.endReason = reason;
    this.events.push({ type: 'end', reason });
  }
}

function crateItem(c: CrateContent): Item {
  if (c === 'carne_cruda') return { kind: 'raw', cook: 0 };
  if (c === 'patatas') return { kind: 'potatoes', cook: 0 };
  return { kind: 'food', layers: [c] };
}

function has(p: Player, id: Parameters<typeof perkCount>[1]): boolean {
  return p.perks.includes(id);
}

/** Velocidad al andar, con Zapatillas rápidas. */
export function speedOf(p: Player): number {
  return CONFIG.playerSpeed * (1 + 0.12 * perkCount(p.perks ?? [], 'zapatillas'));
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function sameLayers(a: readonly Ingredient[], b: readonly Ingredient[]): boolean {
  return a.length === b.length && a.every((ing, i) => ing === b[i]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
