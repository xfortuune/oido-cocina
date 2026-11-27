// Modo campaña: el restaurante del grupo. Cada día tiene una mañana de gestión (despensa, carta,
// banco), un servicio (la cocina de siempre, con el stock y los precios reales) y un cierre con las cuentas.
// Este módulo es lógica pura: el servidor la usa para modificar y guardar la campaña.

import type { KitchenId } from './kitchen';
import { levelParams, type Estilo, type LevelParams } from './levels';
import { getRecipe, RECIPES } from './recipes';
import { dayConditions, dayLabel, type DayConditions } from './weather';

export type StockId = 'pan' | 'carne' | 'queso' | 'lechuga' | 'tomate' | 'bacon' | 'patatas' | 'refresco';

export interface StockInfo {
  id: StockId;
  name: string;
  /** Unidades por paquete. */
  pack: number;
  /** Precio base del paquete (el del día varía un poco). */
  packPrice: number;
  /** Días que dura: 1 = solo sirve el día que se compra. */
  life: number;
}

export const STOCK: StockInfo[] = [
  { id: 'pan', name: 'Pan', pack: 10, packPrice: 5, life: 4 },
  { id: 'carne', name: 'Carne', pack: 5, packPrice: 10, life: 3 },
  { id: 'queso', name: 'Queso', pack: 10, packPrice: 6, life: 6 },
  { id: 'lechuga', name: 'Lechuga', pack: 10, packPrice: 5, life: 2 },
  { id: 'tomate', name: 'Tomate', pack: 10, packPrice: 6, life: 3 },
  { id: 'bacon', name: 'Bacon', pack: 5, packPrice: 8, life: 5 },
  { id: 'patatas', name: 'Patatas', pack: 10, packPrice: 5, life: 8 },
  { id: 'refresco', name: 'Refresco', pack: 10, packPrice: 6, life: 30 },
];

const STOCK_BY_ID = new Map(STOCK.map((s) => [s.id, s]));
export function getStock(id: string): StockInfo | undefined {
  return STOCK_BY_ID.get(id as StockId);
}

/** Lo que da cada caja de la cocina, traducido a la despensa. */
export const CRATE_STOCK: Record<string, StockId> = {
  pan: 'pan',
  carne_cruda: 'carne',
  queso: 'queso',
  lechuga: 'lechuga',
  tomate: 'tomate',
  bacon: 'bacon',
  patatas: 'patatas',
};

/** Un lote comprado: cuántas unidades quedan y el último día en que se puede usar. */
export interface Lot {
  qty: number;
  expires: number;
  /** Del proveedor de calidad. */
  q?: boolean;
}

export interface MenuItem {
  recipeId: string;
  price: number;
  on: boolean;
}

/** Precio por aprender cada receta (las dos primeras se tienen desde el principio). */
export const RECIPE_COST: Record<string, number> = {
  chispa: 0,
  huertana: 0,
  jardin: 60,
  ahumada: 90,
  doble: 90,
  monstruo: 150,
};

export const SIDE_BASE = { fries: 3, drink: 2 };

// ---------------------------------------------------------------- personal y local

export type StaffId = 'camarero' | 'pinche' | 'ayudante' | 'repartidor' | 'encargado';

export interface StaffInfo {
  id: StaffId;
  name: string;
  description: string;
  /** Sueldo por día (se paga al cerrar). */
  wage: number;
}

export const STAFF: StaffInfo[] = [
  { id: 'camarero', name: 'Camarero', description: 'Toma nota a los clientes (la caja no tiene que hacerlo) y esperan un 10 % más.', wage: 12 },
  { id: 'pinche', name: 'Pinche', description: 'Vigila los fogones: todo tarda un 50 % más en quemarse.', wage: 10 },
  { id: 'ayudante', name: 'Ayudante', description: 'Patatas y bebidas salen un 25 % antes.', wage: 10 },
  { id: 'repartidor', name: 'Repartidor', description: 'Pedidos a domicilio al cerrar (un 20 % más caros): más cuanta más reputación. Gastan ingredientes.', wage: 14 },
  { id: 'encargado', name: 'Encargado', description: 'Negocia con los proveedores: la despensa sale un 20 % más barata.', wage: 12 },
];

export type LocalKind = 'cocina' | 'deco';

export interface LocalUpgrade {
  id: string;
  name: string;
  description: string;
  price: number;
  kind: LocalKind;
  /** Decoración: cuánto más atrae al público (0,05 = 5 % más clientes). */
  appeal?: number;
  /** Hace falta haber comprado esto antes. */
  requires?: string;
}

/**
 * Mejoras permanentes del local. Las de cocina usan los mismos efectos que la tienda del Desafío
 * (los mismos identificadores, que entiende la simulación).
 */
export const LOCAL_UPGRADES: LocalUpgrade[] = [
  { id: 'plancha3', name: 'Tercera plancha', description: 'Una plancha más, debajo de la mesa de montaje.', price: 180, kind: 'cocina' },
  { id: 'parrilla', name: 'Plancha de hierro', description: 'Toda la carne se hace un 20 % antes.', price: 140, kind: 'cocina' },
  { id: 'freidora', name: 'Freidora industrial', description: 'Todas las patatas se fríen un 30 % antes.', price: 120, kind: 'cocina' },
  { id: 'dispensador', name: 'Dispensador doble', description: 'Todos los vasos se llenan un 40 % antes.', price: 100, kind: 'cocina' },
  { id: 'extintor', name: 'Extintor', description: 'Lo quemado no cuesta dinero y tarda un 30 % más en quemarse.', price: 90, kind: 'cocina' },
  { id: 'camara', name: 'Cámara frigorífica', description: 'Lo que compréis dura un día más.', price: 150, kind: 'cocina' },
  { id: 'reforma1', name: 'Reforma: ampliación', description: 'El Barrio crece: otra plancha, montaje largo, dos basuras y un hueco más en la calle.', price: 250, kind: 'cocina' },
  { id: 'reforma2', name: 'Reforma: gran cocina', description: 'Tres freidoras, dos islas de montaje y siete huecos en la calle.', price: 500, kind: 'cocina', requires: 'reforma1' },
  { id: 'terraza', name: 'Terraza con sombrillas', description: 'Los clientes esperan un 15 % más.', price: 160, kind: 'deco' },
  { id: 'tarro', name: 'Tarro de propinas', description: 'Las propinas valen el doble.', price: 80, kind: 'deco' },
  { id: 'plantas', name: 'Plantas', description: 'Un poco de verde: 4 % más clientes.', price: 40, kind: 'deco', appeal: 0.04 },
  { id: 'cuadros', name: 'Cuadros', description: 'Las paredes con arte local: 5 % más clientes.', price: 60, kind: 'deco', appeal: 0.05 },
  { id: 'musica', name: 'Música ambiente', description: 'Un tocadiscos: 7 % más clientes.', price: 90, kind: 'deco', appeal: 0.07 },
  { id: 'neon', name: 'Cartel de neón', description: 'Se ve desde la otra calle: 10 % más clientes.', price: 120, kind: 'deco', appeal: 0.1 },
  { id: 'mesas', name: 'Mesas nuevas', description: 'Más sitio para sentarse: 10 % más clientes.', price: 150, kind: 'deco', appeal: 0.1 },
];

const LOCAL_BY_ID = new Map(LOCAL_UPGRADES.map((u) => [u.id, u]));
export function getLocalUpgrade(id: string): LocalUpgrade | undefined {
  return LOCAL_BY_ID.get(id);
}

export function hasStaff(c: Campaign, id: StaffId): boolean {
  return c.staff.includes(id);
}

export function wagesPerDay(c: Campaign): number {
  return STAFF.filter((s) => c.staff.includes(s.id)).reduce((n, s) => n + s.wage, 0);
}

export function hire(c: Campaign, id: string): boolean {
  if (!STAFF.some((s) => s.id === id) || c.staff.includes(id as StaffId)) return false;
  c.staff.push(id as StaffId);
  return true;
}

export function fire(c: Campaign, id: string): boolean {
  if (!c.staff.includes(id as StaffId)) return false;
  c.staff = c.staff.filter((s) => s !== id);
  return true;
}

export function buyLocalUpgrade(c: Campaign, id: string): boolean {
  const u = getLocalUpgrade(id);
  if (!u || c.upgrades.includes(id) || c.money < u.price) return false;
  if (u.requires && !c.upgrades.includes(u.requires)) return false;
  c.money -= u.price;
  c.spentToday += u.price;
  c.upgrades.push(id);
  return true;
}

/** Lo que la cocina tiene en cuenta en el servicio: mejoras del local y personal con efecto en los fogones. */
export function serviceUpgrades(c: Campaign): string[] {
  return [...c.upgrades, ...c.staff];
}

/** Clientes de más por la decoración (0,1 = 10 %). */
export function decorAppeal(c: Campaign): number {
  return c.upgrades.reduce((n, id) => n + (getLocalUpgrade(id)?.appeal ?? 0), 0);
}

export const CAMPAIGN = {
  startMoney: 150,
  startDebt: 100,
  startReputation: 50,
  rent: 10,
  /** Interés diario de la deuda. */
  interest: 0.03,
  /** Con más deuda que esto al cerrar un día, bancarrota. */
  debtLimit: 400,
  /** Comisión del préstamo automático cuando el día acaba en negativo. */
  emergencyFee: 0.1,
};

export interface Mission {
  id: string;
  kind: 'boda' | 'critico' | 'festival' | 'inspeccion' | 'colegio';
  title: string;
  text: string;
  recipeId?: string;
  target: number;
  reward: number;
  rep: number;
}

export interface ChefTraining {
  name: string;
  xp: number;
  perks: string[];
}

export interface DayReport {
  day: number;
  served: number;
  lost: number;
  perfect: number;
  /** Ventas y propinas del servicio. */
  sales: number;
  tips: number;
  /** Multas del servicio: pedidos equivocados, clientes perdidos, cosas tiradas o quemadas. */
  penalties: number;
  /** Gastado hoy en la despensa, recetas y mejoras. */
  purchases: number;
  rent: number;
  wages: number;
  /** Repartos a domicilio (con repartidor). */
  deliveries: number;
  deliveryIncome: number;
  interest: number;
  expired: { id: StockId; qty: number }[];
  /** Préstamo automático para no acabar el día en negativo (incluye la comisión). */
  emergencyLoan: number;
  repBefore: number;
  repAfter: number;
  /** Reputación ganada o perdida por los precios de la carta. */
  repFromPrices: number;
  repFromQuality?: number;
  /** Tiempo del día, p. ej. «Otoño · Lluvia». */
  weather?: string;
  moneyAfter: number;
  debtAfter: number;
  bankrupt: boolean;
  /** Progresión: encargo, concurso, capítulo completado y experiencia ganada (progress.ts). */
  mission?: { title: string; ok: boolean; reward: number; rep: number; progress: string } | null;
  contest?: { served: number; goal: number; won: boolean; prize: number } | null;
  chapterDone?: { n: number; title: string; reward: number } | null;
  xp?: { name: string; gained: number; newPoints: number }[];
  /** Reputación de la cadena rival al cerrar (desde el capítulo 4). */
  rivalRep?: number | null;
}

export interface Campaign {
  version: 1;
  key: string;
  day: number;
  money: number;
  debt: number;
  reputation: number;
  stock: Record<StockId, Lot[]>;
  menu: MenuItem[];
  /** Recetas compradas (además de las iniciales). */
  learnedRecipes: string[];
  sides: { fries: number; drink: number };
  /** Gastado hoy (para el informe del cierre). */
  spentToday: number;
  /** Personal contratado (cobra cada día). */
  staff: StaffId[];
  /** Mejoras permanentes del local y decoración. */
  upgrades: string[];
  /** Progresión (progress.ts): capítulo actual y cómo estaban los contadores al empezarlo. */
  chapter: number;
  chapterStart: { served: number; missions: number; contests: number };
  missionsDone: number;
  contestsWon: number;
  /** Encargos del tablón de hoy, el aceptado y si hoy se va al concurso. */
  board: Mission[];
  activeMission: Mission | null;
  contestToday: boolean;
  /** Formación de cada cocinero (por cuenta de Discord, o por nombre en el navegador). */
  chefs: Record<string, ChefTraining>;
  /** Fase 4: segundo local (El Puerto), dónde se cocina hoy, la cadena rival y si se ha llegado al final. */
  puertoOpen: boolean;
  localHoy: KitchenId;
  rival: { rep: number } | null;
  finished: boolean;
  lastReport: DayReport | null;
  /** Lo que queda de partidas anteriores tras una bancarrota. */
  fame: { quiebras: number; mejorDia: number };
  totals: { served: number; days: number };
}

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function weekday(day: number): string {
  return WEEKDAYS[(day - 1) % 7];
}

/** Más gente el fin de semana. */
function weekdayFactor(day: number): number {
  return [0.85, 0.9, 0.95, 1, 1.15, 1.3, 1.1][(day - 1) % 7];
}

export function newCampaign(key: string, fame = { quiebras: 0, mejorDia: 0 }): Campaign {
  const day = 1;
  const lot = (id: StockId, qty: number): Lot[] => [{ qty, expires: day + getStock(id)!.life - 1 }];
  return {
    version: 1,
    key,
    day,
    money: CAMPAIGN.startMoney,
    debt: CAMPAIGN.startDebt,
    reputation: CAMPAIGN.startReputation,
    stock: {
      pan: lot('pan', 20),
      carne: lot('carne', 10),
      queso: lot('queso', 10),
      lechuga: lot('lechuga', 10),
      tomate: [],
      bacon: [],
      patatas: lot('patatas', 10),
      refresco: lot('refresco', 10),
    },
    menu: RECIPES.map((r) => ({ recipeId: r.id, price: r.price, on: RECIPE_COST[r.id] === 0 })),
    learnedRecipes: [],
    staff: [],
    upgrades: [],
    chapter: 1,
    chapterStart: { served: 0, missions: 0, contests: 0 },
    missionsDone: 0,
    contestsWon: 0,
    board: [],
    activeMission: null,
    contestToday: false,
    chefs: {},
    puertoOpen: false,
    localHoy: 'barrio',
    rival: null,
    finished: false,
    sides: { ...SIDE_BASE },
    spentToday: 0,
    lastReport: null,
    fame,
    totals: { served: 0, days: 0 },
  };
}

/** Recetas que el restaurante ya sabe hacer. */
function isLearned(c: Campaign, recipeId: string): boolean {
  return RECIPE_COST[recipeId] === 0 || c.learnedRecipes.includes(recipeId);
}

// ---------------------------------------------------------------- despensa

/** Factor de precio del día (0,8-1,25), igual para todos y repetible. */
export function priceFactor(day: number, id: StockId): number {
  let h = day * 374761393 + id.length * 668265263 + id.charCodeAt(0) * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  const r = ((h >>> 0) % 1000) / 1000;
  return 0.8 + 0.45 * r;
}

export function packPriceToday(c: Campaign, id: StockId): number {
  const s = getStock(id)!;
  const boss = hasStaff(c, 'encargado') ? 0.8 : 1;
  return Math.max(1, Math.round(s.packPrice * priceFactor(c.day, id) * boss));
}

export function stockCount(c: Campaign, id: StockId): number {
  return c.stock[id].reduce((n, l) => n + l.qty, 0);
}

/** Unidades que caducan al cerrar hoy. */
export function expiringToday(c: Campaign, id: StockId): number {
  return c.stock[id].filter((l) => l.expires <= c.day).reduce((n, l) => n + l.qty, 0);
}

/**
 * Proveedor de calidad: el mismo paquete, más caro, pero los clientes lo notan. Cuanta más parte de la despensa
 * sea de calidad al abrir, más propinas (hasta +60 %) y más reputación al cerrar (hasta +3).
 */
export const QUALITY = { price: 1.6, tips: 0.6, rep: 3 };

export function qualityPackPrice(c: Campaign, id: StockId): number {
  return Math.round(packPriceToday(c, id) * QUALITY.price);
}

export function buyStock(c: Campaign, id: StockId, premium = false): boolean {
  const s = getStock(id);
  if (!s) return false;
  const price = premium ? qualityPackPrice(c, id) : packPriceToday(c, id);
  if (c.money < price) return false;
  c.money -= price;
  c.spentToday += price;
  // Con cámara frigorífica, todo dura un día más.
  const life = s.life + (c.upgrades.includes('camara') ? 1 : 0);
  c.stock[id].push({ qty: s.pack, expires: c.day + life - 1, ...(premium ? { q: true } : {}) });
  return true;
}

/** Unidades de calidad que hay de un ingrediente. */
export function qualityCount(c: Campaign, id: StockId): number {
  return c.stock[id].filter((l) => l.q).reduce((n, l) => n + l.qty, 0);
}

/** Parte de la despensa (0-1) que es de calidad. */
export function qualityShare(c: Campaign): number {
  let all = 0;
  let q = 0;
  for (const s of STOCK) {
    all += stockCount(c, s.id);
    q += qualityCount(c, s.id);
  }
  return all ? q / all : 0;
}

/** Lo que se lleva la cocina al empezar el servicio (cajas por contenido). */
export function stockForService(c: Campaign): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [crate, id] of Object.entries(CRATE_STOCK)) out[crate] = stockCount(c, id);
  out.refresco = stockCount(c, 'refresco');
  return out;
}

/** Descuenta de la despensa lo gastado en el servicio, empezando por lo que caduca antes. */
export function consumeStock(c: Campaign, remaining: Record<string, number>): void {
  const left = (id: StockId) => (id === 'refresco' ? remaining.refresco : remaining[Object.keys(CRATE_STOCK).find((k) => CRATE_STOCK[k] === id)!]);
  for (const s of STOCK) {
    const have = stockCount(c, s.id);
    let used = Math.max(0, have - Math.max(0, left(s.id) ?? have));
    const lots = c.stock[s.id].sort((a, b) => a.expires - b.expires);
    for (const lot of lots) {
      const take = Math.min(lot.qty, used);
      lot.qty -= take;
      used -= take;
    }
    c.stock[s.id] = lots.filter((l) => l.qty > 0);
  }
}

// ---------------------------------------------------------------- carta

export function recipeLearned(c: Campaign, recipeId: string): boolean {
  return isLearned(c, recipeId);
}

export function learnRecipe(c: Campaign, recipeId: string): boolean {
  const cost = RECIPE_COST[recipeId];
  if (cost === undefined || isLearned(c, recipeId) || c.money < cost) return false;
  c.money -= cost;
  c.spentToday += cost;
  c.learnedRecipes.push(recipeId);
  const item = c.menu.find((m) => m.recipeId === recipeId);
  if (item) item.on = true;
  return true;
}

export function setMenuOn(c: Campaign, recipeId: string, on: boolean): boolean {
  const item = c.menu.find((m) => m.recipeId === recipeId);
  if (!item || !isLearned(c, recipeId)) return false;
  // Al menos una hamburguesa en la carta.
  if (!on && c.menu.filter((m) => m.on).length <= 1) return false;
  item.on = on;
  return true;
}

/** Precio permitido: de la mitad al triple del de referencia. */
export function clampPrice(base: number, price: number): number {
  const p = Math.round(Number(price));
  return Number.isFinite(p) ? Math.max(Math.ceil(base / 2), Math.min(base * 3, p)) : base;
}

export function setPrice(c: Campaign, what: string, price: number): boolean {
  if (what === 'fries' || what === 'drink') {
    c.sides[what] = clampPrice(SIDE_BASE[what], price);
    return true;
  }
  const item = c.menu.find((m) => m.recipeId === what);
  if (!item) return false;
  item.price = clampPrice(getRecipe(what).price, price);
  return true;
}

/** Cuánto atrae un precio: 1 al de referencia, más si es barato, mucho menos si es caro. */
export function priceAppeal(base: number, price: number): number {
  return Math.pow(base / Math.max(1, price), 1.4);
}

export function menuOn(c: Campaign): MenuItem[] {
  return c.menu.filter((m) => m.on && isLearned(c, m.recipeId));
}

// ---------------------------------------------------------------- demanda

/** Cuánta gente viene respecto a lo normal (0,3-2,2). */
export function demandFactor(c: Campaign): number {
  const items = menuOn(c);
  const appeal = items.reduce((n, m) => n + priceAppeal(getRecipe(m.recipeId).price, m.price), 0) / Math.max(1, items.length);
  const variety = 1 + 0.06 * (items.length - 1);
  const rep = 0.55 + (c.reputation / 100) * 0.9;
  const decor = 1 + decorAppeal(c);
  // El Puerto tiene más paso de gente; el rival, si tiene más fama, se lleva clientes.
  const local = c.localHoy === 'puerto' ? PUERTO.demand : 1;
  // El tiempo, la estación y los festivos (weather.ts).
  const weather = conditions(c).demand;
  return Math.max(0.3, Math.min(3, appeal * variety * rep * decor * local * weather * rivalFactor(c) * weekdayFactor(c.day)));
}

/** Tiempo y estación de hoy. */
export function conditions(c: Campaign): DayConditions {
  return dayConditions(c.day, c.upgrades.includes('terraza'));
}

// ---------------------------------------------------------------- segundo local y rival

export const PUERTO = {
  /** Precio de abrir el segundo local (desde el capítulo 4). */
  price: 500,
  /** Alquiler extra al día en cuanto está abierto (se cocine allí o no). */
  rent: 25,
  /** Cuánta más gente pasa por el puerto. */
  demand: 1.4,
};

export function openPuerto(c: Campaign): boolean {
  if (c.puertoOpen || c.chapter < 4 || c.money < PUERTO.price) return false;
  c.money -= PUERTO.price;
  c.spentToday += PUERTO.price;
  c.puertoOpen = true;
  c.localHoy = 'puerto';
  return true;
}

export function setLocal(c: Campaign, id: string): boolean {
  if (id !== 'barrio' && id !== 'puerto') return false;
  if (id === 'puerto' && !c.puertoOpen) return false;
  if (c.localHoy === id) return false;
  c.localHoy = id;
  return true;
}

export function rentPerDay(c: Campaign): number {
  return CAMPAIGN.rent + (c.puertoOpen ? PUERTO.rent : 0);
}

/** Con el rival por encima en reputación, hasta un 30 % menos de clientes. */
export function rivalFactor(c: Campaign): number {
  if (!c.rival) return 1;
  return 1 - Math.max(0, Math.min(0.3, (c.rival.rep - c.reputation) / 120));
}

/** La dificultad de la cocina crece con los días (como los niveles del Desafío, pero más despacio). */
export function campaignLevel(day: number): number {
  return Math.min(12, 1 + Math.floor((day - 1) / 2));
}

/** Parámetros del servicio de hoy: ritmo según la demanda, solo platos de la carta. */
export function serviceParams(c: Campaign, players: number, estilo: Estilo): LevelParams {
  const p = levelParams(campaignLevel(c.day) + (c.localHoy === 'puerto' ? 1 : 0), players, estilo);
  const d = demandFactor(c);
  const recipes = menuOn(c).map((m) => m.recipeId);
  // Patatas y bebida caras se piden menos.
  const sideAppeal = (priceAppeal(SIDE_BASE.fries, c.sides.fries) + priceAppeal(SIDE_BASE.drink, c.sides.drink)) / 2;
  // Con camarero, los clientes esperan un 10 % más.
  const w = conditions(c);
  const side = Math.min(0.85, Math.max(p.sideChance, 0.2) * sideAppeal);
  const params: LevelParams = {
    ...p,
    patience: p.patience * (hasStaff(c, 'camarero') ? 1.1 : 1) * w.patience,
    duration: Math.max(120, p.duration),
    spawnStart: p.spawnStart / d,
    spawnEnd: p.spawnEnd / d,
    sideChance: side,
    friesChance: Math.min(0.9, side * w.fries),
    drinkChance: Math.min(0.9, side * w.drink),
    recipes: recipes.length ? recipes : ['chispa'],
    goal: 0,
  };
  params.goal = expectedCustomers(params);
  return params;
}

/** Clientes que se esperan en un servicio con estos parámetros (aprox.). */
export function expectedCustomers(p: LevelParams): number {
  return Math.round(p.duration / ((p.spawnStart + p.spawnEnd) / 2)) + 1;
}

/** Precios que cobra la cocina. */
export function servicePrices(c: Campaign): { recipes: Record<string, number>; fries: number; drink: number } {
  return {
    recipes: Object.fromEntries(c.menu.map((m) => [m.recipeId, m.price])),
    fries: c.sides.fries,
    drink: c.sides.drink,
  };
}

// ---------------------------------------------------------------- banco

export function takeLoan(c: Campaign, amount: number): boolean {
  const a = Math.round(Number(amount));
  if (!(a > 0) || c.debt + a > CAMPAIGN.debtLimit - 50) return false;
  c.debt += a;
  c.money += a;
  return true;
}

export function repay(c: Campaign, amount: number): boolean {
  const a = Math.min(Math.round(Number(amount)), c.debt, c.money);
  if (!(a > 0)) return false;
  c.debt -= a;
  c.money -= a;
  return true;
}

// ---------------------------------------------------------------- cierre

export interface ServiceResult {
  money: number;
  served: number;
  lost: number;
  perfect: number;
  earned: number;
  tips: number;
  reputation: number;
  remaining: Record<string, number>;
  /** Parte de la despensa que era de calidad al abrir (0-1). */
  quality?: number;
}

/** Lo que multiplica las propinas hoy: festivo y despensa de calidad. */
export function serviceTipMult(c: Campaign): number {
  return conditions(c).tips * (1 + QUALITY.tips * qualityShare(c));
}

/** Cierra el día: cobra el servicio, paga gastos, retira lo caducado y pasa al día siguiente. */
export function closeDay(c: Campaign, r: ServiceResult): DayReport {
  const repBefore = c.reputation;
  consumeStock(c, r.remaining);
  c.money += r.money;

  // Precios abusivos bajan la reputación; muy baratos la suben un poco.
  const items = menuOn(c);
  const ratio = items.reduce((n, m) => n + m.price / getRecipe(m.recipeId).price, 0) / Math.max(1, items.length);
  const repFromPrices = ratio > 1.5 ? -4 : ratio > 1.25 ? -2 : ratio < 0.85 ? 1 : 0;
  // La reputación de la campaña depende de cómo fue el día en conjunto (no de la del servicio, que cae
  // 8 por cada cliente perdido): sube si se atiende bien a la mayoría y baja si se pierden muchos. ±6 al día como mucho.
  const serviceDelta = Math.max(-6, Math.min(6, Math.round(0.5 * r.served + 0.4 * r.perfect - 1.4 * r.lost)));
  // Con ingredientes de calidad, los que comen hablan bien del sitio.
  const repFromQuality = r.served > 0 ? Math.round(QUALITY.rep * (r.quality ?? 0)) : 0;
  c.reputation = Math.max(0, Math.min(100, repBefore + serviceDelta + repFromPrices + repFromQuality));

  // Repartos a domicilio: con lo que quede en la despensa, más cuanta más reputación.
  const { count: deliveries, income: deliveryIncome } = hasStaff(c, 'repartidor') ? deliver(c, Math.floor((c.reputation / 8) * conditions(c).delivery)) : { count: 0, income: 0 };
  c.money += deliveryIncome;

  const rent = rentPerDay(c);
  const interest = Math.ceil(c.debt * CAMPAIGN.interest);
  const wages = wagesPerDay(c);
  c.money -= rent + interest + wages;

  const expired: DayReport['expired'] = [];
  for (const s of STOCK) {
    const gone = c.stock[s.id].filter((l) => l.expires <= c.day).reduce((n, l) => n + l.qty, 0);
    if (gone > 0) expired.push({ id: s.id, qty: gone });
    c.stock[s.id] = c.stock[s.id].filter((l) => l.expires > c.day);
  }

  let emergencyLoan = 0;
  if (c.money < 0) {
    emergencyLoan = Math.ceil(-c.money * (1 + CAMPAIGN.emergencyFee));
    c.debt += emergencyLoan;
    c.money += emergencyLoan;
    c.money = Math.max(0, c.money);
  }
  const bankrupt = c.debt > CAMPAIGN.debtLimit;

  const report: DayReport = {
    day: c.day,
    served: r.served,
    lost: r.lost,
    perfect: r.perfect,
    sales: r.earned - r.tips,
    tips: r.tips,
    penalties: r.money - r.earned,
    purchases: c.spentToday,
    rent,
    wages,
    deliveries,
    deliveryIncome,
    interest,
    expired,
    emergencyLoan,
    repBefore,
    repAfter: c.reputation,
    repFromPrices,
    repFromQuality,
    weather: dayLabel(c.day),
    moneyAfter: c.money,
    debtAfter: c.debt,
    bankrupt,
  };
  c.lastReport = report;
  c.totals.served += r.served;
  c.totals.days++;
  c.fame.mejorDia = Math.max(c.fame.mejorDia, c.day);
  c.spentToday = 0;
  c.day++;
  return report;
}

/** Prepara hasta `max` pedidos a domicilio con lo que haya en la despensa (cobrados a precio de carta). */
function deliver(c: Campaign, max: number): { count: number; income: number } {
  const items = menuOn(c);
  let count = 0;
  let income = 0;
  for (let i = 0; i < max * items.length && count < max; i++) {
    const item = items[i % items.length];
    const needs: Partial<Record<StockId, number>> = {};
    for (const l of getRecipe(item.recipeId).layers) needs[l as StockId] = (needs[l as StockId] ?? 0) + 1;
    if (!Object.entries(needs).every(([id, n]) => stockCount(c, id as StockId) >= (n as number))) continue;
    for (const [id, n] of Object.entries(needs)) takeUnits(c, id as StockId, n as number);
    count++;
    // A domicilio se cobra un 20 % más.
    income += Math.round(item.price * 1.2);
  }
  return { count, income };
}

/** Saca unidades de la despensa, empezando por lo que caduca antes. */
function takeUnits(c: Campaign, id: StockId, n: number): void {
  const lots = c.stock[id].sort((a, b) => a.expires - b.expires);
  for (const lot of lots) {
    const take = Math.min(lot.qty, n);
    lot.qty -= take;
    n -= take;
  }
  c.stock[id] = lots.filter((l) => l.qty > 0);
}

/** Comprueba y completa una campaña leída del disco (por si es de una versión anterior). */
export function reviveCampaign(raw: unknown, key: string): Campaign {
  const base = newCampaign(key);
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Campaign>;
  if (c.version !== 1) return base;
  const out = { ...base, ...c, key } as Campaign;
  for (const s of STOCK) if (!Array.isArray(out.stock?.[s.id])) out.stock = { ...out.stock, [s.id]: [] };
  for (const r of RECIPES) if (!out.menu.some((m) => m.recipeId === r.id)) out.menu.push({ recipeId: r.id, price: r.price, on: false });
  if (!Array.isArray(out.learnedRecipes)) out.learnedRecipes = [];
  if (!Array.isArray(out.staff)) out.staff = [];
  if (!Array.isArray(out.upgrades)) out.upgrades = [];
  if (typeof out.chapter !== 'number') out.chapter = 1;
  out.chapterStart ??= { served: out.totals?.served ?? 0, missions: 0, contests: 0 };
  out.missionsDone ??= 0;
  out.contestsWon ??= 0;
  if (!Array.isArray(out.board)) out.board = [];
  out.activeMission ??= null;
  out.contestToday ??= false;
  out.chefs ??= {};
  out.puertoOpen ??= false;
  out.localHoy = out.puertoOpen && out.localHoy === 'puerto' ? 'puerto' : 'barrio';
  out.rival ??= null;
  out.finished ??= false;
  return out;
}
