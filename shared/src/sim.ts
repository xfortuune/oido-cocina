// Simulación de un turno en la cocina: cocineros, puestos, pedidos y puntuación.
// No depende de Phaser ni del navegador. El servidor Colyseus la ejecuta como autoridad
// (pedidos, tiempos, objetos y puntuación) y los clientes tienen una copia que se actualiza
// con instantáneas del servidor; cada cliente solo mueve a su propio cocinero.

import {
  getKitchen,
  parseKitchen,
  type KitchenId,
  type CrateContent,
  type Flavor,
  type Kitchen,
  type Tile,
  type TileKind,
} from './kitchen';
import { levelParams, RECIPE_LEVEL, type LevelParams } from './levels';
import { INCIDENT_KINDS, INCIDENT_WARNING, INCIDENTS, type ActiveIncident, type IncidentKind } from './incidents';
import { perkCount } from './perks';
import { DEFAULT_LOOK, type ChefLook } from './looks';
import { getRecipe, INGREDIENT_NAMES, type Ingredient } from './recipes';

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
  /** Delantal y accesorio. */
  look: ChefLook;
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
  /** Cliente especial de un evento: crítico o cumpleaños (paga el triple). */
  special?: 'critico' | 'cumple';
  /** Personalidad: con prisa, niño, exigente (lo quiere a su manera) o habitual. */
  mood?: Mood;
  /** Hamburguesa a su manera (sin o con doble de algo); si no, la de la receta. */
  layers?: Ingredient[];
  /** Cómo la quiere, para la comanda: «sin queso», «doble de queso»… */
  note?: string;
  /** Para llevar: lo recoge un repartidor en la ventanilla (slot -1). */
  takeaway?: boolean;
}

export type Mood = 'prisa' | 'nino' | 'exigente' | 'habitual' | 'noctambulo';

/** Capas que hay que entregar para un pedido (la receta, o como la quiere el cliente). */
export function orderLayers(o: Order): readonly Ingredient[] {
  return o.layers ?? getRecipe(o.recipeId).layers;
}

/** Multiplicador de la racha de pedidos servidos seguidos. */
export function streakMult(n: number): number {
  return n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1.5 : 1;
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
  /** Hamburguesas servidas de cada receta (para los encargos de la campaña). */
  byRecipe?: Record<string, number>;
  /** Pedidos servidos con hamburguesa, patatas y bebida. */
  combos?: number;
  /** La mejor racha de la ronda. */
  bestStreak?: number;
  /** Críticos servidos perfectos. */
  critics?: number;
}

export type SimEvent =
  | { type: 'newOrder'; orderId: number }
  | { type: 'taken'; orderId: number; slot: number }
  | { type: 'denied'; playerId: string; role: Role }
  | { type: 'given'; from: string; to: string }
  | { type: 'served'; orderId: number; slot: number; earned: number; tip: number; perfect: boolean; streak: number; bonus: number }
  /** La racha sube de multiplicador o se rompe (con lo que llevaba). */
  | { type: 'streak'; n: number; mult: number; broken: boolean }
  | { type: 'part'; orderId: number; slot: number; part: OrderPart }
  | { type: 'wrong'; penalty: number; x: number; y: number }
  | { type: 'lost'; orderId: number; slot: number; penalty: number }
  | { type: 'trash'; cost: number; x: number; y: number }
  | { type: 'cooked'; x: number; y: number }
  | { type: 'filled'; x: number; y: number }
  | { type: 'burnt'; x: number; y: number; what: 'carne' | 'patatas'; cost: number }
  | { type: 'end'; reason: EndReason }
  /** Campaña: la caja (o el refresco) se ha quedado sin existencias. */
  | { type: 'empty'; playerId: string; item: string }
  /** Eventos aleatorios: aviso, empieza o acaba (la inspección dice si fue limpia y su premio). */
  | { type: 'incident'; kind: IncidentKind; phase: 'soon' | 'start' | 'end'; ok?: boolean; bonus?: number }
  | { type: 'repair'; x: number; y: number; left: number }
  | { type: 'blocked'; playerId: string; kind: IncidentKind }
  /** Una mancha en el suelo (refresco, aceite…) y cómo va la limpieza. */
  | { type: 'spill'; x: number; y: number }
  | { type: 'clean'; x: number; y: number; left: number }
  /** Versus: el otro equipo ha servido antes a este cliente. */
  | { type: 'stolen'; orderId: number; slot: number };

export type EndReason = 'time' | 'reputation';

/** Estado de la partida que el servidor envía a los clientes ~20 veces por segundo. */
export interface SimSnapshot {
  time: number;
  turnDuration: number;
  level: number;
  goal: number;
  /** Campaña: día del restaurante (0 en el Desafío) y existencias de cada caja. */
  day: number;
  contest: boolean;
  /** Cocina en la que se juega (barrio o puerto). */
  map: KitchenId;
  /** Evento aleatorio en marcha. */
  incident: ActiveIncident | null;
  /** Si la caja tiene que tomar nota (no en solitario, modo libre ni con camarero). */
  needsCaja: boolean;
  /** Pedidos servidos seguidos (racha). */
  streak: number;
  /** Manchas del suelo: casilla → frotadas que faltan. */
  spills: Record<string, number>;
  night: boolean;
  stock: Record<string, number> | null;
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
  stats: TurnStats = { served: 0, perfect: 0, wrong: 0, lost: 0, burnt: 0, trashed: 0, tips: 0, earned: 0, byRecipe: {}, combos: 0 };
  /** Campaña: el servicio es un concurso de cocina (con objetivo, como el Desafío). */
  contest = false;
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
  /** Campaña: día (0 en el Desafío), existencias por caja (null = ilimitadas) y precios de la carta. */
  day = 0;
  stock: Record<string, number> | null = null;
  prices: { recipes: Record<string, number>; fries: number; drink: number } | null = null;

  /** Pedidos servidos seguidos sin fallar (se rompe al equivocarse, perder un cliente o quemar algo). */
  streak = 0;
  /** Campaña: las propinas valen más (festivo, ingredientes de calidad). */
  tipMult = 1;
  /** Manchas del suelo: casilla → frotadas que faltan para limpiarla. */
  spills: Record<string, number> = {};
  /** Turno de noche. */
  night: boolean;
  /** Ventanilla de los pedidos para llevar (si la cocina tiene). */
  readonly windowTile: Tile | undefined;
  private takeawayTimer = 20;
  /** Versus: los clientes los pone la sala (los mismos en las dos cocinas), no la simulación. */
  externalOrders = false;
  private spillTimer = 25;

  /** Fallos perdonados por el Seguro de cocina y cada cuánto trabajan los empleados. */
  private insured = 0;
  private staffTimer = 0;

  /** Fallos ya perdonados por Disculpa a tiempo en esta ronda, por jugador. */
  private forgiven: Record<string, number> = {};
  private nextId = 1;
  private spawns: { x: number; y: number }[];
  /** Huecos de la calle (x del centro de cada uno). */
  readonly slots: number[];
  /** Eventos de la ronda: cuándo (fracción de la ronda) y si ya se han avisado o empezado. */
  private incidentPlan: { kind: IncidentKind; at: number; warned: boolean; started: boolean }[] = [];
  incident: ActiveIncident | null = null;
  /** Cliente especial (crítico, cumpleaños) esperando a que haya hueco en la calle. */
  private pendingSpecial: 'critico' | 'cumple' | null = null;
  private spawnTimer: number;
  private events: SimEvent[] = [];

  constructor(
    /** Ritmo de la ronda: depende del nivel y de cuántos jugáis. */
    readonly params: LevelParams = levelParams(1, 1),
    private readonly random: () => number = Math.random,
    /** Mejoras de la tienda compradas en esta partida (shop.ts). */
    readonly upgrades: readonly string[] = [],
    /** Qué cocina: la del barrio (la de siempre) o la del puerto (campaña). */
    readonly map: KitchenId = 'barrio',
  ) {
    this.turnDuration = params.duration;
    this.night = !!params.night;
    this.level = params.level;
    this.goal = params.goal;
    // El primer cliente llega enseguida.
    this.spawnTimer = 2;
    const def = getKitchen(map);
    this.spawns = def.spawns;
    this.slots = def.slots;
    this.kitchen = parseKitchen(def.rows);
    if (upgrades.includes('plancha3')) {
      const t = this.kitchen.tiles[def.extraGrill.y][def.extraGrill.x];
      t.kind = 'grill';
    }
    for (const row of this.kitchen.tiles) {
      for (const t of row) {
        if (t.kind !== 'outside' && t.kind !== 'floor' && t.kind !== 'wall' && t.kind !== 'crate') {
          this.stations.set(key(t.x, t.y), { item: null, overcook: 0, rate: 1, burnRate: 1 });
        }
      }
    }
    this.windowTile = this.kitchen.tiles.flat().find((t) => t.kind === 'ventanilla');
    // Con la cocina ya montada (la avería necesita saber dónde están las freidoras).
    this.planIncidents(params.incidents ?? 0);
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

  addPlayer(id: string, name: string, color: number, roles: Role[] = ROLES, perks: string[] = [], look: ChefLook = DEFAULT_LOOK): Player {
    const spawn = this.spawns[color % this.spawns.length];
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
      look: { ...look },
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
      } else if (!held) this.scrub(t.x, t.y);
      return;
    }

    const role = ROLE_FOR[t.kind];
    if (role && !p.roles.includes(role)) {
      this.events.push({ type: 'denied', playerId: p.id, role });
      return;
    }

    if (t.kind === 'crate') {
      const c = t.crate!;
      if (!held) {
        if (!this.take(c, p.id)) return;
        p.holding = crateItem(c);
      } else if (held.kind === 'food' && held.layers.length === 1 && held.layers[0] === c) {
        p.holding = null;
        if (this.stock) this.stock[c] = (this.stock[c] ?? 0) + 1;
      }
      // Bandeja: con comida en las manos, el ingrediente se apila encima.
      else if (
        held.kind === 'food' &&
        has(p, 'bandeja') &&
        c !== 'carne_cruda' &&
        c !== 'patatas' &&
        held.layers.length < CONFIG.maxStack &&
        this.take(c, p.id)
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
          const cost = this.upgrades.includes('emp_limpiador') ? 0 : CONFIG.trashCost * this.inspectionFactor();
          this.money -= cost;
          this.stats.trashed++;
          this.events.push({ type: 'trash', cost, x: t.x, y: t.y });
        }
        return;

      case 'ventanilla':
        // Para llevar: se entrega al repartidor (cualquiera puede).
        if (held && this.deliver(held, t, id)) p.holding = null;
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
        if (this.incident?.station === key(t.x, t.y)) {
          this.repair(t.x, t.y);
          return;
        }
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
          st.burnRate =
            (1 + 0.6 * perkCount(p.perks, 'termometro')) *
            (this.upgrades.includes('extintor') ? 1.3 : 1) *
            (this.upgrades.includes('pinche') ? 1.5 : 1);
          // Campaña: el ayudante acelera la freidora.
          if (!grill && this.upgrades.includes('ayudante')) st.rate *= 1.25;
          p.holding = null;
          st0.cooked++;
        }
        return;

      case 'drinks':
        // Apagón: las máquinas no funcionan (se puede recoger un vaso que ya estuviera lleno).
        if (this.incident?.kind === 'apagon' && !(st.item?.kind === 'drink' && st.item.fill >= 1)) {
          this.events.push({ type: 'blocked', playerId: p.id, kind: 'apagon' });
          return;
        }
        // Con las manos vacías: se pone un vaso a llenar, y cuando está lleno se recoge.
        if (!held && !st.item) {
          if (!this.take('refresco', p.id)) return;
          st.item = { kind: 'drink', flavor: t.flavor!, fill: 0 };
          st.rate =
            (1 + 0.35 * perkCount(p.perks, 'grifo')) *
            (this.upgrades.includes('dispensador') ? 1.4 : 1) *
            (this.upgrades.includes('ayudante') ? 1.25 : 1);
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
    this.updateIncidents();
    this.staffTimer -= dt;
    if (this.staffTimer <= 0) {
      this.staffTimer = 0.5;
      this.autoStaff();
    }
    this.cook(dt);

    this.updateTakeaway(dt);
    this.updateSpills(dt);
    // Con la cocina sucia los clientes se impacientan antes.
    const dirt = 1 + 0.12 * Object.keys(this.spills).length;
    for (const order of [...this.orders]) {
      order.patience -= dt * dirt;
      if (order.patience <= 0) {
        this.orders = this.orders.filter((o) => o !== order);
        // Si el crítico se va enfadado, lo cuenta en su columna: mucha más reputación perdida.
        const penalty = CONFIG.lostRepPenalty + (order.special === 'critico' ? 7 : 0);
        this.money -= CONFIG.lostMoneyPenalty;
        this.reputation -= penalty;
        this.stats.lost++;
        this.breakStreak();
        this.events.push({ type: 'lost', orderId: order.id, slot: order.slot, penalty });
      }
    }

    // Nunca dejamos la cocina vacía mucho rato.
    if (this.orders.length === 0) this.spawnTimer = Math.min(this.spawnTimer, 2);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && !this.externalOrders) {
      // Con el autobús de turistas se llenan todos los huecos de la calle.
      const limit = this.incident?.kind === 'autobus' ? this.slots.length : this.params.maxOrders;
      if (this.orders.length < limit || this.pendingSpecial) this.spawnOrder();
      // Autobús de turistas: los clientes llegan casi seguidos.
      this.spawnTimer = lerp(this.params.spawnStart, this.params.spawnEnd, this.progress) * (this.incident?.kind === 'autobus' ? 0.35 : 1);
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
      day: this.day,
      contest: this.contest,
      map: this.map,
      incident: this.incident,
      needsCaja: this.needsCaja,
      streak: this.streak,
      spills: this.spills,
      night: this.night,
      stock: this.stock,
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
    this.day = s.day;
    this.contest = s.contest;
    this.incident = s.incident;
    this.needsCaja = s.needsCaja;
    this.streak = s.streak;
    this.spills = s.spills ?? {};
    this.night = !!s.night;
    this.stock = s.stock;
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
    // Pisar una mancha pegajosa frena.
    const sticky = this.spills[key(Math.floor(p.x), Math.floor(p.y))] ? 0.55 : 1;
    const step = speedOf(p) * dt * sticky;

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

      // Freidora averiada: no avanza hasta que la arreglen. Apagón: las bebidas tampoco.
      if (this.incident?.station === k) continue;
      if (kind === 'drinks' && this.incident?.kind === 'apagon') continue;
      if (kind === 'drinks' && item.kind === 'drink' && item.fill < 1) {
        item.fill = Math.min(1, item.fill + (dt * st.rate) / CONFIG.fillTime);
        if (item.fill >= 1) this.events.push({ type: 'filled', x, y });
        continue;
      }
      if (kind !== 'grill' && kind !== 'fryer') continue;
      const grill = kind === 'grill';
      // Plancha a tope: la carne se hace antes y se quema antes.
      const hot = grill && this.incident?.kind === 'plancha';
      const cookTime = ((grill ? CONFIG.cookTime : CONFIG.fryTime) / st.rate) / (hot ? 1.6 : 1);
      const burnTime = (grill ? CONFIG.burnTime : CONFIG.fryBurnTime) * st.burnRate * (hot ? 0.6 : 1);

      if (item.kind === 'raw' || item.kind === 'potatoes') {
        item.cook += dt;
        if (item.cook >= cookTime) {
          st.item = grill ? { kind: 'food', layers: ['carne'] } : { kind: 'fries' };
          st.overcook = 0;
          this.events.push({ type: 'cooked', x, y });
        }
      } else if (item.kind === 'food' || item.kind === 'fries') {
        // El freidor vigila la freidora: sus patatas no se queman.
        if (!grill && this.upgrades.includes('emp_freidor')) continue;
        st.overcook += dt;
        if (st.overcook >= burnTime) {
          const what = grill ? 'carne' : 'patatas';
          st.item = { kind: 'burnt', what };
          const cost = (this.upgrades.includes('extintor') ? 0 : CONFIG.burnCost) * this.inspectionFactor();
          this.money -= cost;
          this.stats.burnt++;
          this.breakStreak();
          this.events.push({ type: 'burnt', x, y, what, cost });
          // El limpiador lo retira al momento.
          if (this.upgrades.includes('emp_limpiador')) st.item = null;
        }
      }
    }
  }

  /**
   * Entrega una parte (hamburguesa, patatas o bebida) al pedido más urgente que la necesite.
   * Devuelve false si lo que se lleva no se puede servir (carne cruda, vaso a medio llenar…).
   */
  private deliver(item: Item, at: Tile, by: string): boolean {
    // En la ventanilla solo los pedidos para llevar; en el pase, los de la calle.
    const toGo = at.kind === 'ventanilla';
    const byUrgency = this.orders.filter((o) => o.taken && !!o.takeaway === toGo).sort((a, b) => a.patience - b.patience);
    let part: OrderPart;
    let order: Order | undefined;
    if (item.kind === 'food') {
      part = 'burger';
      order = byUrgency.find((o) => !o.done.burger && sameLayers(orderLayers(o), item.layers));
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
      // Seguro de cocina: los 3 primeros fallos de la ronda no cuentan (para todo el equipo).
      if (this.upgrades.includes('c_seguro') && this.insured < 3) {
        this.insured++;
        this.stats.wrong++;
        this.events.push({ type: 'wrong', penalty: 0, x: at.x, y: at.y });
        return true;
      }
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
      const f = this.inspectionFactor();
      this.money -= CONFIG.wrongMoneyPenalty * f;
      this.reputation -= CONFIG.wrongRepPenalty * f;
      this.stats.wrong++;
      this.playerStats[by].mistakes++;
      this.breakStreak();
      this.events.push({ type: 'wrong', penalty: CONFIG.wrongMoneyPenalty * f, x: at.x, y: at.y });
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

  /** Campaña: gasta una unidad de la caja; sin existencias, avisa y no deja coger. */
  private take(item: string, playerId: string): boolean {
    if (!this.stock) return true;
    if ((this.stock[item] ?? 0) <= 0) {
      this.events.push({ type: 'empty', playerId, item });
      return false;
    }
    this.stock[item]--;
    return true;
  }

  private complete(order: Order): void {
    const recipe = getRecipe(order.recipeId);
    // En la campaña se cobra a los precios de la carta.
    const pr = this.prices;
    const price =
      (pr?.recipes[recipe.id] ?? recipe.price) +
      (order.fries ? (pr?.fries ?? CONFIG.friesPrice) : 0) +
      (order.drink ? (pr?.drink ?? CONFIG.drinkPrice) : 0);
    const ratio = order.patience / order.maxPatience;
    const perfect = ratio >= CONFIG.perfectThreshold;
    // Crítico y cumpleaños pagan el triple; el crítico, si sale perfecto, da mucha reputación.
    const mult = order.special ? 3 : 1;
    const earned = Math.round(price * (0.6 + 0.4 * ratio)) * mult;
    if (order.special === 'critico' && perfect) {
      this.reputation = Math.min(CONFIG.maxReputation, this.reputation + 6);
      this.stats.critics = (this.stats.critics ?? 0) + 1;
    }
    const tip = perfect
      ? Math.round(
          Math.ceil(price * 0.3) *
            (this.upgrades.includes('tarro') ? 2 : 1) *
            (this.upgrades.includes('c_propinas') ? 2 : 1) *
            (order.mood === 'prisa' ? 2 : order.mood === 'noctambulo' ? 2.5 : 1) *
            this.tipMult,
        )
      : 0;
    // Los habituales hablan bien de vosotros.
    if (order.mood === 'habitual') this.reputation = Math.min(CONFIG.maxReputation, this.reputation + 2);
    // Racha: cada pedido seguido sube el multiplicador, que da un extra.
    this.streak++;
    this.stats.bestStreak = Math.max(this.stats.bestStreak ?? 0, this.streak);
    const sm = streakMult(this.streak);
    if (sm > streakMult(this.streak - 1)) this.events.push({ type: 'streak', n: this.streak, mult: sm, broken: false });
    const bonus = Math.round((earned + tip) * (sm - 1) * 0.5);

    this.orders = this.orders.filter((o) => o !== order);
    this.money += earned + tip + bonus;
    this.reputation = Math.min(CONFIG.maxReputation, this.reputation + (perfect ? 2 : 1));
    this.stats.served++;
    const by = (this.stats.byRecipe ??= {});
    by[order.recipeId] = (by[order.recipeId] ?? 0) + 1;
    if (order.fries && order.drink) this.stats.combos = (this.stats.combos ?? 0) + 1;
    this.stats.earned += earned + tip + bonus;
    this.stats.tips += tip + bonus;
    if (perfect) this.stats.perfect++;
    this.events.push({ type: 'served', orderId: order.id, slot: order.slot, earned, tip, perfect, streak: this.streak, bonus });
  }

  /**
   * Un cliente nuevo en un hueco libre. Con `push` false no se añade: lo devuelve (versus: la sala lo pone en
   * las dos cocinas); `busy` son huecos ocupados además de los de esta cocina.
   */
  spawnOrder(busy?: ReadonlySet<number>, push = true): Order | null {
    const used = new Set([...this.orders.map((o) => o.slot), ...(busy ?? [])]);
    const free = this.slots.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length === 0) return null;
    const slot = free[Math.floor(this.random() * free.length)];
    if (this.pendingSpecial) {
      this.spawnSpecial(this.pendingSpecial, slot);
      this.pendingSpecial = null;
      return null;
    }
    const { recipes } = this.params;
    // Una receta recién estrenada (hace 2 niveles o menos) sale algo más, para que se note la novedad.
    const fresh = recipes[recipes.length - 1];
    const isFresh = recipes.length > 1 && RECIPE_LEVEL[fresh] >= this.level - 2;
    const recipeId =
      isFresh && this.random() < 0.25 ? fresh : recipes[Math.floor(this.random() * recipes.length)];
    const layers = getRecipe(recipeId).layers.length;
    const sideChance = this.params.sideChance;
    const fries = this.random() < (this.params.friesChance ?? sideChance);
    const drink: Flavor | null = this.random() < (this.params.drinkChance ?? sideChance) ? (this.random() < 0.5 ? 'cola' : 'naranja') : null;
    const sides = (fries ? 1 : 0) + (drink ? 1 : 0);
    const maxPatience =
      (CONFIG.patienceBase + layers * CONFIG.patiencePerLayer + sides * CONFIG.patiencePerSide) *
      this.params.patience *
      (this.upgrades.includes('terraza') ? 1.15 : 1) *
      (this.upgrades.includes('c_hilo') ? 1.25 : 1) *
      lerp(1, 0.85, this.progress);
    const order: Order = this.withMood({
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
    });
    if (push) this.injectOrder(order);
    else this.nextId--;
    return order;
  }

  /** Pone un cliente ya hecho (una copia), con su mismo número de pedido. */
  injectOrder(o: Order): void {
    const order: Order = JSON.parse(JSON.stringify(o));
    this.orders.push(order);
    this.nextId = Math.max(this.nextId, order.id + 1);
    this.events.push({ type: 'newOrder', orderId: order.id });
  }

  /** Versus: el otro equipo ha servido a este cliente; aquí se va (y lo entregado a medias se pierde). */
  removeOrder(id: number): boolean {
    const order = this.orders.find((o) => o.id === id);
    if (!order) return false;
    this.orders = this.orders.filter((o) => o !== order);
    this.events.push({ type: 'stolen', orderId: id, slot: order.slot });
    return true;
  }

  /**
   * Desde el nivel 2, algunos clientes tienen personalidad: con prisa (poca paciencia, propina doble), niños
   * (La Chispa sin queso y con patatas), exigentes (sin algo o con doble de algo) y habituales (más reputación).
   */
  private withMood(o: Order): Order {
    // Los 3 primeros clientes de la ronda son normales, para calentar.
    if (this.level < 2 || o.id <= 3 || this.random() > (this.night ? 0.55 : 0.3)) return o;
    // De noche: noctámbulos que piden menú completo y dejan mucha propina, pero tienen poca paciencia.
    if (this.night && this.random() < 0.4) {
      const t = o.patience * 0.9;
      return { ...o, mood: 'noctambulo', fries: true, drink: o.drink ?? (this.random() < 0.5 ? 'cola' : 'naranja'), patience: t, maxPatience: t };
    }
    const r = this.random();
    if (r < 0.3) {
      const t = o.patience * 0.65;
      return { ...o, mood: 'prisa', patience: t, maxPatience: t };
    }
    if (r < 0.5) {
      const t = o.patience * 1.2;
      return { ...o, mood: 'nino', recipeId: 'chispa', layers: ['pan', 'carne', 'pan'], note: 'sin queso', fries: true, patience: t, maxPatience: t };
    }
    if (r < 0.8) {
      const base = getRecipe(o.recipeId).layers;
      const optional = base.filter((l, i) => l !== 'pan' && l !== 'carne' && base.indexOf(l) === i);
      if (!optional.length) return { ...o, mood: 'habitual' };
      const ing = optional[Math.floor(this.random() * optional.length)];
      const name = INGREDIENT_NAMES[ing].toLowerCase();
      if (this.random() < 0.5) return { ...o, mood: 'exigente', layers: base.filter((l) => l !== ing), note: `sin ${name}` };
      const at = base.indexOf(ing);
      return { ...o, mood: 'exigente', layers: [...base.slice(0, at + 1), ing, ...base.slice(at + 1)], note: `doble de ${name}` };
    }
    return { ...o, mood: 'habitual' };
  }

  private breakStreak(): void {
    if (this.streak >= 3) this.events.push({ type: 'streak', n: this.streak, mult: 1, broken: true });
    this.streak = 0;
  }

  // ---------------------------------------------------------------- empleados del Desafío

  /** Lo que hay de un tipo por la cocina: en fogones y máquinas, en las manos o en las encimeras. */
  private countItems(match: (it: Item) => boolean): number {
    let n = 0;
    for (const st of this.stations.values()) if (st.item && match(st.item)) n++;
    for (const p of this.players.values()) if (p.holding && match(p.holding)) n++;
    return n;
  }

  /** El freidor echa patatas y el barman llena vasos cuando los pedidos los necesitan. */
  private autoStaff(): void {
    const pending = this.orders.filter((o) => o.taken);
    // El limpiador friega las manchas.
    if (this.upgrades.includes('emp_limpiador')) {
      const k = Object.keys(this.spills)[0];
      if (k) {
        const [x, y] = k.split(',').map(Number);
        this.scrub(x, y);
      }
    }
    if (this.upgrades.includes('emp_freidor')) {
      const need = pending.filter((o) => o.fries && !o.done.fries).length;
      const have = this.countItems((it) => it.kind === 'fries' || it.kind === 'potatoes');
      if (need > have) {
        const fryer = this.freeStation('fryer');
        if (fryer && this.take('patatas', 'personal')) {
          fryer.item = { kind: 'potatoes', cook: 0 };
          fryer.overcook = 0;
          fryer.rate = this.upgrades.includes('freidora') ? 1.3 : 1;
          fryer.burnRate = 1;
        }
      }
    }
    if (this.upgrades.includes('emp_barman') && this.incident?.kind !== 'apagon') {
      for (const flavor of ['cola', 'naranja'] as Flavor[]) {
        const need = pending.filter((o) => o.drink === flavor && !o.done.drink).length;
        const have = this.countItems((it) => it.kind === 'drink' && it.flavor === flavor);
        if (need <= have) continue;
        const machine = this.freeStation('drinks', flavor);
        if (machine && this.take('refresco', 'personal')) {
          machine.item = { kind: 'drink', flavor, fill: 0 };
          machine.rate = this.upgrades.includes('dispensador') ? 1.4 : 1;
        }
      }
    }
  }

  /** Un fogón o máquina vacío (y no averiado) de este tipo. */
  private freeStation(kind: TileKind, flavor?: Flavor): Station | undefined {
    for (const [k, st] of this.stations) {
      if (st.item || this.incident?.station === k) continue;
      const [x, y] = k.split(',').map(Number);
      const t = this.tile(x, y);
      if (t?.kind === kind && (!flavor || t.flavor === flavor)) return st;
    }
    return undefined;
  }

  // ---------------------------------------------------------------- eventos aleatorios

  /** Reparte los eventos de la ronda entre el 25 % y el 85 % del tiempo, sin repetir tipo. */
  private planIncidents(n: number): void {
    const kinds = [...INCIDENT_KINDS].filter((k) => k !== 'averia' || this.hasTile('fryer'));
    for (let i = 0; i < n && kinds.length; i++) {
      const kind = kinds.splice(Math.floor(this.random() * kinds.length), 1)[0];
      const at = 0.25 + (0.6 * (i + 0.5)) / n + (this.random() - 0.5) * 0.08;
      this.incidentPlan.push({ kind, at, warned: false, started: false });
    }
  }

  private hasTile(kind: TileKind): boolean {
    return this.kitchen.tiles.some((row) => row.some((t) => t.kind === kind));
  }

  /** Inspección: los fallos cuentan el doble (y estropean el premio). */
  private inspectionFactor(): number {
    if (this.incident?.kind !== 'inspeccion') return 1;
    this.incident.clean = false;
    return 2;
  }

  private updateIncidents(): void {
    for (const plan of this.incidentPlan) {
      const at = plan.at * this.turnDuration;
      if (!plan.warned && this.time >= at - INCIDENT_WARNING) {
        plan.warned = true;
        this.events.push({ type: 'incident', kind: plan.kind, phase: 'soon' });
      }
      if (!plan.started && this.time >= at && !this.incident) {
        plan.started = true;
        this.startIncident(plan.kind);
      }
    }
    if (this.incident && this.time >= this.incident.until) this.endIncident(true);
  }

  private startIncident(kind: IncidentKind): void {
    const def = INCIDENTS[kind];
    this.events.push({ type: 'incident', kind, phase: 'start' });
    if (kind === 'critico' || kind === 'cumple') {
      // Un cliente especial: llega en cuanto haya hueco en la calle.
      this.pendingSpecial = kind;
      this.spawnTimer = Math.min(this.spawnTimer, 0.5);
      return;
    }
    this.incident = { kind, until: this.time + def.duration };
    if (kind === 'autobus') this.spawnTimer = Math.min(this.spawnTimer, 1);
    if (kind === 'inspeccion') this.incident.clean = true;
    if (kind === 'averia') {
      const fryers = [...this.stations.keys()].filter((k) => {
        const [x, y] = k.split(',').map(Number);
        return this.tile(x, y)?.kind === 'fryer';
      });
      this.incident.station = fryers[Math.floor(this.random() * fryers.length)];
      this.incident.repairs = 0;
    }
  }

  /** Fin del evento. La freidora se arregla sola al acabar el tiempo; la inspección limpia da premio. */
  private endIncident(timeUp: boolean): void {
    const inc = this.incident;
    if (!inc) return;
    this.incident = null;
    if (inc.kind === 'inspeccion') {
      // Un suelo con manchas también suspende la inspección.
      const ok = inc.clean !== false && Object.keys(this.spills).length === 0;
      if (ok) {
        this.reputation = Math.min(CONFIG.maxReputation, this.reputation + 5);
        this.money += 10;
      }
      this.events.push({ type: 'incident', kind: inc.kind, phase: 'end', ok, bonus: ok ? 10 : 0 });
      return;
    }
    this.events.push({ type: 'incident', kind: inc.kind, phase: 'end', ok: inc.kind === 'averia' ? !timeUp : true });
  }

  /** Freidora averiada: cada pulsación delante la arregla un poco (3 en total). */
  private repair(x: number, y: number): void {
    const inc = this.incident!;
    inc.repairs = (inc.repairs ?? 0) + 1;
    const left = Math.max(0, 3 - inc.repairs);
    this.events.push({ type: 'repair', x, y, left });
    if (left === 0) this.endIncident(false);
  }

  /** Cliente especial: el crítico pide la hamburguesa más grande y tiene poca paciencia; el cumpleaños, menú completo. */
  private spawnSpecial(kind: 'critico' | 'cumple', slot: number): void {
    const recipes = this.params.recipes;
    const recipeId = [...recipes].sort((a, b) => getRecipe(b).layers.length - getRecipe(a).layers.length)[0];
    const layers = getRecipe(recipeId).layers.length;
    const fries = kind === 'cumple';
    const drink: Flavor | null = kind === 'cumple' ? 'naranja' : null;
    const sides = (fries ? 1 : 0) + (drink ? 1 : 0);
    const maxPatience =
      (CONFIG.patienceBase + layers * CONFIG.patiencePerLayer + sides * CONFIG.patiencePerSide) *
      this.params.patience *
      (kind === 'critico' ? 0.6 : 1.5) *
      (this.upgrades.includes('c_hilo') ? 1.25 : 1);
    const order: Order = {
      id: this.nextId++,
      recipeId,
      fries,
      drink,
      taken: !this.needsCaja || this.players.size <= 1,
      done: { burger: false, fries: false, drink: false },
      patience: maxPatience,
      maxPatience,
      slot,
      look: kind === 'critico' ? 7 : 4,
      special: kind,
    };
    this.orders.push(order);
    this.events.push({ type: 'newOrder', orderId: order.id });
  }

  // ---------------------------------------------------------------- para llevar y manchas

  /** Desde el nivel 3, de vez en cuando llega un repartidor a la ventanilla a por un pedido (como mucho 2 a la vez). */
  private updateTakeaway(dt: number): void {
    if (!this.windowTile || this.level < 3 || this.contest || this.externalOrders) return;
    this.takeawayTimer -= dt;
    if (this.takeawayTimer > 0) return;
    this.takeawayTimer = lerp(30, 18, this.progress) / (this.params.takeaway ?? 1);
    if (this.orders.filter((o) => o.takeaway).length >= 2) return;
    const recipes = this.params.recipes;
    const recipeId = recipes[Math.floor(this.random() * recipes.length)];
    const fries = this.random() < 0.5;
    const drink: Flavor | null = this.random() < 0.4 ? (this.random() < 0.5 ? 'cola' : 'naranja') : null;
    const sides = (fries ? 1 : 0) + (drink ? 1 : 0);
    // El repartidor espera algo más que un cliente, pero no para siempre.
    const maxPatience =
      (CONFIG.patienceBase + getRecipe(recipeId).layers.length * CONFIG.patiencePerLayer + sides * CONFIG.patiencePerSide) * this.params.patience * 1.2;
    const order: Order = {
      id: this.nextId++,
      recipeId,
      fries,
      drink,
      taken: true,
      done: { burger: false, fries: false, drink: false },
      patience: maxPatience,
      maxPatience,
      slot: -1,
      look: Math.floor(this.random() * 1000),
      takeaway: true,
    };
    this.orders.push(order);
    this.events.push({ type: 'newOrder', orderId: order.id });
  }

  /** Desde el nivel 4 se derrama algo de vez en cuando: la mancha frena y pone nerviosos a los clientes. */
  private updateSpills(dt: number): void {
    if (this.level < 4 || this.contest) return;
    this.spillTimer -= dt;
    if (this.spillTimer > 0) return;
    this.spillTimer = 22 + this.random() * 14;
    if (Object.keys(this.spills).length >= 3) return;
    const floors = this.kitchen.tiles.flat().filter((t) => t.kind === 'floor' && !this.spills[key(t.x, t.y)]);
    const t = floors[Math.floor(this.random() * floors.length)];
    if (!t) return;
    this.spills[key(t.x, t.y)] = 3;
    this.events.push({ type: 'spill', x: t.x, y: t.y });
  }

  /** Frotar una mancha (3 veces y queda limpia). */
  private scrub(x: number, y: number): void {
    const k = key(x, y);
    if (!this.spills[k]) return;
    const left = this.spills[k] - 1;
    if (left <= 0) delete this.spills[k];
    else this.spills[k] = left;
    this.events.push({ type: 'clean', x, y, left });
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
