// Modo campaña: el restaurante del grupo. Cada día tiene una mañana de gestión (despensa, carta,
// banco), un servicio (la cocina de siempre, con el stock y los precios reales) y un cierre con las cuentas.
// Este módulo es lógica pura: el servidor la usa para modificar y guardar la campaña.

import { levelParams, type Estilo, type LevelParams } from './levels';
import { getRecipe, RECIPES } from './recipes';

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

export const CAMPAIGN = {
  startMoney: 150,
  startDebt: 100,
  startReputation: 50,
  rent: 15,
  /** Interés diario de la deuda. */
  interest: 0.03,
  /** Con más deuda que esto al cerrar un día, bancarrota. */
  debtLimit: 400,
  /** Comisión del préstamo automático cuando el día acaba en negativo. */
  emergencyFee: 0.1,
};

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
  /** Gastado hoy en la despensa y en recetas. */
  purchases: number;
  rent: number;
  interest: number;
  expired: { id: StockId; qty: number }[];
  /** Préstamo automático para no acabar el día en negativo (incluye la comisión). */
  emergencyLoan: number;
  repBefore: number;
  repAfter: number;
  /** Reputación ganada o perdida por los precios de la carta. */
  repFromPrices: number;
  moneyAfter: number;
  debtAfter: number;
  bankrupt: boolean;
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
  return Math.max(1, Math.round(s.packPrice * priceFactor(c.day, id)));
}

export function stockCount(c: Campaign, id: StockId): number {
  return c.stock[id].reduce((n, l) => n + l.qty, 0);
}

/** Unidades que caducan al cerrar hoy. */
export function expiringToday(c: Campaign, id: StockId): number {
  return c.stock[id].filter((l) => l.expires <= c.day).reduce((n, l) => n + l.qty, 0);
}

export function buyStock(c: Campaign, id: StockId): boolean {
  const s = getStock(id);
  if (!s) return false;
  const price = packPriceToday(c, id);
  if (c.money < price) return false;
  c.money -= price;
  c.spentToday += price;
  c.stock[id].push({ qty: s.pack, expires: c.day + s.life - 1 });
  return true;
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
  return Math.max(0.3, Math.min(2.2, appeal * variety * rep * weekdayFactor(c.day)));
}

/** La dificultad de la cocina crece con los días (como los niveles del Desafío, pero más despacio). */
export function campaignLevel(day: number): number {
  return Math.min(12, 1 + Math.floor((day - 1) / 2));
}

/** Parámetros del servicio de hoy: ritmo según la demanda, solo platos de la carta. */
export function serviceParams(c: Campaign, players: number, estilo: Estilo): LevelParams {
  const p = levelParams(campaignLevel(c.day), players, estilo);
  const d = demandFactor(c);
  const recipes = menuOn(c).map((m) => m.recipeId);
  // Patatas y bebida caras se piden menos.
  const sideAppeal = (priceAppeal(SIDE_BASE.fries, c.sides.fries) + priceAppeal(SIDE_BASE.drink, c.sides.drink)) / 2;
  const params: LevelParams = {
    ...p,
    duration: Math.max(120, p.duration),
    spawnStart: p.spawnStart / d,
    spawnEnd: p.spawnEnd / d,
    sideChance: Math.min(0.85, Math.max(p.sideChance, 0.2) * sideAppeal),
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
  c.reputation = Math.max(0, Math.min(100, Math.round(r.reputation) + repFromPrices));

  const rent = CAMPAIGN.rent;
  const interest = Math.ceil(c.debt * CAMPAIGN.interest);
  c.money -= rent + interest;

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
    interest,
    expired,
    emergencyLoan,
    repBefore,
    repAfter: c.reputation,
    repFromPrices,
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

/** Comprueba y completa una campaña leída del disco (por si es de una versión anterior). */
export function reviveCampaign(raw: unknown, key: string): Campaign {
  const base = newCampaign(key);
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Campaign>;
  if (c.version !== 1) return base;
  const out = { ...base, ...c, key } as Campaign;
  for (const s of STOCK) if (!Array.isArray(out.stock?.[s.id])) out.stock = { ...out.stock, [s.id]: [] };
  for (const r of RECIPES) if (!out.menu.some((m) => m.recipeId === r.id)) out.menu.push({ recipeId: r.id, price: r.price, on: false });
  if (!Array.isArray(out.learnedRecipes)) out.learnedRecipes = [];
  return out;
}
