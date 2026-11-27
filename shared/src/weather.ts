// Tiempo y estaciones de la campaña. Todo sale del número de día (repetible y sin guardar nada), así que el
// cliente puede enseñar la previsión de mañana y la lluvia en la calle sin que se lo diga el servidor.

export type Season = 'primavera' | 'verano' | 'otono' | 'invierno';
export type Weather = 'sol' | 'nubes' | 'lluvia' | 'calor' | 'frio' | 'nieve';

/** Días que dura cada estación (dos semanas). */
export const SEASON_DAYS = 14;

export const SEASON_NAMES: Record<Season, string> = {
  primavera: 'Primavera',
  verano: 'Verano',
  otono: 'Otoño',
  invierno: 'Invierno',
};

const SEASONS: Season[] = ['primavera', 'verano', 'otono', 'invierno'];

export interface WeatherInfo {
  name: string;
  /** Lo que cambia, en pocas palabras, para la previsión. */
  hint: string;
  /** Clientes respecto a lo normal. */
  demand: number;
  /** Multiplican la probabilidad de que pidan patatas / bebida. */
  fries: number;
  drink: number;
  /** Multiplica la paciencia de los clientes. */
  patience: number;
  /** Multiplica los repartos a domicilio. */
  delivery: number;
}

export const WEATHER: Record<Weather, WeatherInfo> = {
  sol: { name: 'Sol', hint: 'buen día; con terraza viene más gente', demand: 1.05, fries: 1, drink: 1.15, patience: 1, delivery: 1 },
  nubes: { name: 'Nublado', hint: 'un día normal', demand: 1, fries: 1, drink: 1, patience: 1, delivery: 1 },
  lluvia: { name: 'Lluvia', hint: 'menos gente en la calle, pero muchos más repartos', demand: 0.8, fries: 1.1, drink: 0.9, patience: 1.1, delivery: 1.75 },
  calor: { name: 'Calor', hint: 'todo el mundo quiere bebida fría', demand: 1, fries: 0.8, drink: 1.7, patience: 0.9, delivery: 1 },
  frio: { name: 'Frío', hint: 'más patatas calentitas y menos refrescos', demand: 0.9, fries: 1.5, drink: 0.6, patience: 1.05, delivery: 1.3 },
  nieve: { name: 'Nieve', hint: 'casi nadie sale; los repartos se disparan', demand: 0.65, fries: 1.4, drink: 0.5, patience: 1.2, delivery: 2 },
};

/** Probabilidad de cada tiempo según la estación. */
const ODDS: Record<Season, [Weather, number][]> = {
  primavera: [['sol', 0.4], ['nubes', 0.35], ['lluvia', 0.25]],
  verano: [['sol', 0.45], ['calor', 0.45], ['nubes', 0.1]],
  otono: [['nubes', 0.35], ['lluvia', 0.4], ['frio', 0.15], ['sol', 0.1]],
  invierno: [['frio', 0.45], ['nieve', 0.2], ['nubes', 0.2], ['lluvia', 0.15]],
};

/** Demanda de fondo de cada estación (en verano hay turistas). */
const SEASON_DEMAND: Record<Season, number> = { primavera: 1, verano: 1.1, otono: 0.97, invierno: 0.95 };

/** Un festivo por estación: más gente y propinas. */
const HOLIDAYS: Record<Season, string> = {
  primavera: 'Fiestas del barrio',
  verano: 'Noche de San Juan',
  otono: 'Castañada',
  invierno: 'Nochevieja',
};
/** Día de la estación (1-14) en el que cae el festivo: el sábado de la segunda semana. */
const HOLIDAY_DAY = 13;
export const HOLIDAY = { demand: 1.35, tips: 1.5 };

export function seasonOf(day: number): Season {
  return SEASONS[Math.floor((Math.max(1, day) - 1) / SEASON_DAYS) % SEASONS.length];
}

function hash01(day: number): number {
  let h = Math.imul(day + 7919, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

export function weatherOf(day: number): Weather {
  // El primer día siempre hace bueno, para empezar tranquilos.
  if (day <= 1) return 'sol';
  const odds = ODDS[seasonOf(day)];
  let r = hash01(day);
  for (const [w, p] of odds) {
    if (r < p) return w;
    r -= p;
  }
  return odds[odds.length - 1][0];
}

export function holidayOf(day: number): string | null {
  return ((Math.max(1, day) - 1) % SEASON_DAYS) + 1 === HOLIDAY_DAY ? HOLIDAYS[seasonOf(day)] : null;
}

export interface DayConditions {
  season: Season;
  weather: Weather;
  holiday: string | null;
  demand: number;
  fries: number;
  drink: number;
  patience: number;
  delivery: number;
  tips: number;
}

/** Cómo es el día: estación, tiempo, festivo y lo que cambia en el servicio. */
export function dayConditions(day: number, terraza = false): DayConditions {
  const season = seasonOf(day);
  const weather = weatherOf(day);
  const holiday = holidayOf(day);
  const w = WEATHER[weather];
  const terrace = terraza && (weather === 'sol' || weather === 'calor') ? 1.1 : 1;
  return {
    season,
    weather,
    holiday,
    demand: w.demand * SEASON_DEMAND[season] * terrace * (holiday ? HOLIDAY.demand : 1),
    fries: w.fries,
    drink: w.drink,
    patience: w.patience,
    delivery: w.delivery,
    tips: holiday ? HOLIDAY.tips : 1,
  };
}

/** Texto corto del día, p. ej. «Verano · Calor» o «Otoño · Lluvia · Castañada». */
export function dayLabel(day: number): string {
  const h = holidayOf(day);
  return `${SEASON_NAMES[seasonOf(day)]} · ${WEATHER[weatherOf(day)].name}${h ? ` · ${h}` : ''}`;
}
