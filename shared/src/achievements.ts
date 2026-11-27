// Logros y perfil de cada cocinero. El servidor guarda el perfil por cuenta de Discord (o por nombre en el
// navegador) y lo actualiza al acabar cada ronda o servicio; el cliente solo lo enseña.

/** Contadores de toda la vida del cocinero (cuentan lo que hizo el equipo en las rondas en que estuvo). */
export interface ProfileStats {
  rounds: number;
  served: number;
  perfect: number;
  money: number;
  burnt: number;
  bestStreak: number;
  /** Mejor nivel superado en el Desafío. */
  bestLevel: number;
  /** Veces MVP en una ronda con más gente. */
  mvp: number;
  /** Rondas jugadas con amigos. */
  withFriends: number;
  /** Rondas de al menos 8 pedidos sin quemar, fallar ni perder a nadie. */
  cleanRounds: number;
  /** Críticos gastronómicos servidos perfectos. */
  critics: number;
  /** Campaña. */
  days: number;
  contestsWon: number;
  holidays: number;
  snowDays: number;
  /** Versus ganados. */
  versusWins: number;
}

export interface Profile {
  name: string;
  avatar: string | null;
  stats: ProfileStats;
  /** Logro → fecha (ISO) en que se consiguió. */
  achievements: Record<string, string>;
  since: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Lo que lleva y lo que hace falta, para la barra de progreso. */
  progress: (s: ProfileStats) => [number, number];
}

const at = (key: keyof ProfileStats, goal: number) => (s: ProfileStats): [number, number] => [Math.min(s[key], goal), goal];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'oido', name: '¡Oído!', description: 'Sirve tu primer pedido.', progress: at('served', 1) },
  { id: 'cien', name: 'Cien bocados', description: 'Sirve 100 pedidos.', progress: at('served', 100) },
  { id: 'mil', name: 'Mil hamburguesas', description: 'Sirve 1000 pedidos.', progress: at('served', 1000) },
  { id: 'perfecto', name: 'Al punto', description: 'Sirve 50 pedidos perfectos.', progress: at('perfect', 50) },
  { id: 'racha10', name: 'En racha', description: 'Encadena 10 pedidos perfectos.', progress: at('bestStreak', 10) },
  { id: 'racha20', name: 'Imparable', description: 'Encadena 20 pedidos perfectos.', progress: at('bestStreak', 20) },
  { id: 'limpio', name: 'Cocina impecable', description: 'Una ronda de 8 pedidos o más sin quemar, fallar ni perder a nadie.', progress: at('cleanRounds', 1) },
  { id: 'critico', name: 'Cinco estrellas', description: 'Sirve perfecto a un crítico gastronómico.', progress: at('critics', 1) },
  { id: 'nivel5', name: 'Aprendiz', description: 'Supera el nivel 5 del Desafío.', progress: at('bestLevel', 5) },
  { id: 'nivel10', name: 'Jefe de partida', description: 'Supera el nivel 10 del Desafío.', progress: at('bestLevel', 10) },
  { id: 'nivel20', name: 'Leyenda', description: 'Completa los 20 niveles del Desafío.', progress: at('bestLevel', 20) },
  { id: 'equipo', name: 'Brigada', description: 'Juega 10 rondas con amigos.', progress: at('withFriends', 10) },
  { id: 'mvp', name: 'Estrella de la cocina', description: 'Sé el MVP 5 veces.', progress: at('mvp', 5) },
  { id: 'rico', name: 'Caja llena', description: 'Gana 5000 monedas en total.', progress: at('money', 5000) },
  { id: 'semana', name: 'Una semana abiertos', description: 'Trabaja 7 días en la campaña.', progress: at('days', 7) },
  { id: 'concurso', name: 'Campeones', description: 'Gana un concurso de cocina.', progress: at('contestsWon', 1) },
  { id: 'festivo', name: 'Día de fiesta', description: 'Trabaja en un festivo.', progress: at('holidays', 1) },
  { id: 'nieve', name: 'Ni la nieve nos para', description: 'Abre el restaurante un día de nieve.', progress: at('snowDays', 1) },
  { id: 'versus', name: 'Duelo de cocinas', description: 'Gana una partida de versus.', progress: at('versusWins', 1) },
  { id: 'versus10', name: 'Rey del barrio', description: 'Gana 10 partidas de versus.', progress: at('versusWins', 10) },
  { id: 'quemado', name: 'Huele a chamusquina', description: 'Quema 25 cosas. Pasa en las mejores cocinas.', progress: at('burnt', 25) },
];

export function newProfile(name: string, avatar: string | null = null): Profile {
  return {
    name,
    avatar,
    stats: {
      rounds: 0,
      served: 0,
      perfect: 0,
      money: 0,
      burnt: 0,
      bestStreak: 0,
      bestLevel: 0,
      mvp: 0,
      withFriends: 0,
      cleanRounds: 0,
      critics: 0,
      days: 0,
      contestsWon: 0,
      holidays: 0,
      snowDays: 0,
      versusWins: 0,
    },
    achievements: {},
    since: new Date().toISOString(),
  };
}

/** Lo que pasó en una ronda (o servicio) para un cocinero. */
export interface RoundRecord {
  served: number;
  perfect: number;
  money: number;
  burnt: number;
  wrong: number;
  lost: number;
  bestStreak: number;
  critics: number;
  players: number;
  mvp: boolean;
  /** Desafío: nivel superado (0 si no). */
  levelPassed: number;
  /** Campaña. */
  campaignDay?: boolean;
  contestWon?: boolean;
  holiday?: boolean;
  snow?: boolean;
  versusWin?: boolean;
}

/** Apunta la ronda y devuelve los logros recién conseguidos. */
export function recordRound(p: Profile, r: RoundRecord): Achievement[] {
  const s = p.stats;
  s.rounds++;
  s.served += r.served;
  s.perfect += r.perfect;
  s.money += Math.max(0, r.money);
  s.burnt += r.burnt;
  s.bestStreak = Math.max(s.bestStreak, r.bestStreak);
  s.bestLevel = Math.max(s.bestLevel, r.levelPassed);
  s.critics += r.critics;
  if (r.players > 1) s.withFriends++;
  if (r.mvp && r.players > 1) s.mvp++;
  if (r.served >= 8 && r.burnt === 0 && r.wrong === 0 && r.lost === 0) s.cleanRounds++;
  if (r.campaignDay) s.days++;
  if (r.contestWon) s.contestsWon++;
  if (r.holiday) s.holidays++;
  if (r.snow) s.snowDays++;
  if (r.versusWin) s.versusWins++;
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    const [have, need] = a.progress(s);
    if (have >= need) {
      p.achievements[a.id] = new Date().toISOString();
      fresh.push(a);
    }
  }
  return fresh;
}

/** Completa un perfil leído del disco (por si es de una versión anterior). */
export function reviveProfile(raw: unknown, name: string): Profile {
  const base = newProfile(name);
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Profile>;
  return {
    ...base,
    ...p,
    stats: { ...base.stats, ...(p.stats ?? {}) },
    achievements: { ...(p.achievements ?? {}) },
  };
}
