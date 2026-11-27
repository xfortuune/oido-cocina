// Reseñas de los clientes al cerrar el día de la campaña: dos o tres frases cortas (y con guasa) sobre cómo fue,
// que dan pistas de qué mejorar.
import { getRecipe } from './recipes';
import type { TurnStats } from './sim';

export interface Review {
  author: string;
  stars: number;
  text: string;
}

export interface ReviewInput {
  day: number;
  stats: TurnStats;
  /** Precio medio de la carta respecto al de referencia (1 = normal). */
  priceRatio: number;
  /** Parte de la despensa de calidad (0-1). */
  quality: number;
  weather: string;
  night: boolean;
  holiday: boolean;
  chefs: string[];
}

const AUTHORS = [
  'Paqui, del 3.º B',
  'Un turista con chanclas',
  'Don Ramón, cliente de siempre',
  'Lucía, 8 años',
  '@foodie_del_barrio',
  'El cartero',
  'Una abuela con bolso',
  'Marcos, que pasaba por aquí',
  'Dos novios en su primera cita',
  'Un taxista con prisa',
  'La profe de música',
  'Anónimo (pero con hambre)',
];

function rnd(day: number, salt: number): number {
  let h = (Math.imul(day + 13, 2654435761) ^ Math.imul(salt + 1, 2246822519)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

export function makeReviews(r: ReviewInput): Review[] {
  const s = r.stats;
  const pool: { stars: number; text: string; weight: number }[] = [];
  const add = (stars: number, text: string, weight = 1) => pool.push({ stars, text, weight });
  const top = Object.entries(s.byRecipe ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
  const burger = top ? getRecipe(top).name : 'hamburguesa';
  const chef = r.chefs.length ? r.chefs[Math.floor(rnd(r.day, 9) * r.chefs.length)] : null;
  const perfectShare = s.served ? s.perfect / s.served : 0;

  if (s.served === 0) add(1, 'Abierto, con luz y todo… y sin servir a nadie. Curioso.', 5);
  if (s.lost >= 3) add(1, 'Esperé tanto que me salió barba. Me fui sin comer.', 3);
  else if (s.lost >= 1) add(3, 'Bien, pero vi a alguien irse sin su pedido. Ojo con las colas.', 1.5);
  if (s.wrong >= 2) add(2, 'Pedí una cosa y me trajeron otra. ¿Alguien lee las comandas?', 2.5);
  if (s.burnt >= 2) add(2, 'Olía a quemado desde la esquina. La plancha no se vigila sola.', 2.5);
  if (perfectShare >= 0.6 && s.served >= 4) add(5, `${burger} estaba de escándalo y salió rapidísima.`, 2);
  else if (s.served >= 3) add(4, `${burger}: buenísima. Volveré.`, 1);
  if ((s.bestStreak ?? 0) >= 10) add(5, `Iban como una máquina: ¡${s.bestStreak} pedidos seguidos sin un fallo!`, 2.5);
  if ((s.combos ?? 0) >= 3) add(4, 'Menú completo con patatas y bebida. Salí rodando.', 1);
  if (r.priceRatio > 1.3) add(2, 'Rica, pero a ese precio me compro un coche.', 2.5);
  else if (r.priceRatio < 0.9) add(4, 'Barato y bueno. Vuelvo mañana. Y pasado.', 1.5);
  if (r.quality > 0.4) add(5, 'Se nota que el producto es bueno. Ese pan…', 2);
  if (/Lluvia/.test(r.weather)) add(4, 'Llovía a mares y aquí dentro se estaba de lujo.', 1);
  if (/Nieve/.test(r.weather)) add(5, 'Abrir con la que estaba cayendo tiene mérito. Gracias.', 1.5);
  if (/Calor/.test(r.weather)) add(4, 'Con el calor que hacía, el refresco me salvó la vida.', 1);
  if (r.night) add(4, 'Las tantas de la noche y con hambre: me salvasteis.', 1.5);
  if (r.holiday) add(4, 'Día de fiesta, todo lleno y aun así me atendieron con una sonrisa.', 1.5);
  if (chef && s.served >= 2) add(4, `Saludos a ${chef}, que tiene un arte con la plancha.`, 1.2);
  if (!pool.length) add(3, 'Correcto. Ni fu ni fa.', 1);

  // Dos o tres reseñas distintas, sorteadas según su peso.
  const n = Math.min(pool.length, s.served >= 6 ? 3 : 2);
  const out: Review[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((t, p, j) => t + (used.has(j) ? 0 : p.weight), 0);
    let x = rnd(r.day, 20 + i) * total;
    let pick = pool.findIndex((p, j) => !used.has(j) && (x -= p.weight) < 0);
    if (pick < 0) pick = pool.findIndex((_, j) => !used.has(j));
    used.add(pick);
    out.push({ author: AUTHORS[Math.floor(rnd(r.day, 40 + i) * AUTHORS.length)], stars: pool[pick].stars, text: pool[pick].text });
  }
  return out;
}
