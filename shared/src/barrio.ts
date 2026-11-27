// Decisiones del barrio: algunas mañanas de la campaña pasa algo y hay que elegir. Unas se notan al momento
// (dinero, reputación, ingredientes) y otras solo hoy (más o menos gente, propinas, precios).
import type { Campaign, StockId } from './campaign';

export interface DilemmaOption {
  label: string;
  /** Lo que pasará (o puede pasar), en pocas palabras. */
  hint: string;
}

export interface Dilemma {
  id: string;
  title: string;
  text: string;
  options: [DilemmaOption, DilemmaOption];
}

/** Lo que cambia solo en el servicio de hoy. */
export interface DayMods {
  demand?: number;
  tips?: number;
  price?: number;
}

interface DilemmaDef extends Dilemma {
  /** Aplica la elección y devuelve lo que ha pasado. */
  apply: (c: Campaign, choice: 0 | 1, luck: number) => string;
}

const rep = (c: Campaign, n: number) => (c.reputation = Math.max(0, Math.min(100, c.reputation + n)));
const pay = (c: Campaign, n: number) => {
  c.money -= n;
  if (n > 0) c.spentToday += n;
};
const mod = (c: Campaign, m: DayMods) => {
  c.mods = {
    demand: (c.mods.demand ?? 1) * (m.demand ?? 1),
    tips: (c.mods.tips ?? 1) * (m.tips ?? 1),
    price: (c.mods.price ?? 1) * (m.price ?? 1),
  };
};
const units = (c: Campaign, id: StockId) => c.stock[id].reduce((n, l) => n + l.qty, 0);
function take(c: Campaign, id: StockId, n: number): void {
  const lots = c.stock[id].sort((a, b) => a.expires - b.expires);
  for (const lot of lots) {
    const t = Math.min(lot.qty, n);
    lot.qty -= t;
    n -= t;
  }
  c.stock[id] = lots.filter((l) => l.qty > 0);
}

const DILEMMAS: DilemmaDef[] = [
  {
    id: 'futbol',
    title: 'El equipo de fútbol del barrio',
    text: 'Tienen partido y piden 10 hamburguesas para llevar, a mitad de precio.',
    options: [
      { label: 'Aceptar', hint: '+40 monedas; gasta 10 de carne y 20 de pan' },
      { label: 'Rechazar', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'Les deseáis suerte y seguís a lo vuestro.';
      if (units(c, 'carne') < 10 || units(c, 'pan') < 20) {
        rep(c, -2);
        return 'No había ingredientes suficientes: se fueron enfadados (−2 de reputación).';
      }
      take(c, 'carne', 10);
      take(c, 'pan', 20);
      c.money += 40;
      return '¡Ganaron el partido! +40 monedas.';
    },
  },
  {
    id: 'influencer',
    title: 'Una influencer gastronómica',
    text: 'Quiere comer gratis a cambio de grabar un vídeo para sus seguidores.',
    options: [
      { label: 'Invitarla', hint: '−15 monedas; puede salir muy bien… o no' },
      { label: 'Mejor no', hint: 'No pasa nada' },
    ],
    apply: (c, i, luck) => {
      if (i === 1) return 'Se va a grabar a la cafetería de enfrente.';
      pay(c, 15);
      if (luck < 0.7) {
        rep(c, 7);
        mod(c, { demand: 1.15 });
        return '¡El vídeo se hizo viral! +7 de reputación y hoy viene más gente.';
      }
      rep(c, -3);
      return 'Dijo que la carne estaba sosa. −3 de reputación.';
    },
  },
  {
    id: 'humo',
    title: 'El vecino del primero',
    text: 'Se queja de que el humo de la plancha le entra por la ventana.',
    options: [
      { label: 'Poner un filtro', hint: '−40 monedas, +3 de reputación' },
      { label: 'Ignorarlo', hint: '−4 de reputación' },
    ],
    apply: (c, i) => {
      if (i === 0) {
        pay(c, 40);
        rep(c, 3);
        return 'Filtro nuevo. El vecino os trae galletas: +3 de reputación.';
      }
      rep(c, -4);
      return 'Ha puesto una reseña muy enfadada. −4 de reputación.';
    },
  },
  {
    id: 'estudiantes',
    title: 'Semana de exámenes',
    text: 'Los estudiantes de la academia piden un descuento para hoy.',
    options: [
      { label: 'Un 20 % menos', hint: 'Hoy precios −20 % y un 35 % más de gente' },
      { label: 'Precios normales', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'Los estudiantes se conforman con un bocadillo de casa.';
      mod(c, { price: 0.8, demand: 1.35 });
      return 'Hoy se llenará de estudiantes con hambre.';
    },
  },
  {
    id: 'musico',
    title: 'Un músico callejero',
    text: 'Pregunta si puede tocar el acordeón en la puerta durante el servicio.',
    options: [
      { label: 'Que toque', hint: '−10 monedas; hoy propinas ×1,4' },
      { label: 'Hoy no', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'Se va a tocar a la plaza.';
      pay(c, 10);
      mod(c, { tips: 1.4 });
      return 'Hoy hay música en la puerta: la gente está de buen humor.';
    },
  },
  {
    id: 'obras',
    title: 'Obras en la calle',
    text: 'El ayuntamiento corta media calle. Casi nadie sabrá que estáis abiertos.',
    options: [
      { label: 'Repartir folletos', hint: '−25 monedas; se viene igual' },
      { label: 'Aguantar', hint: 'Hoy un 25 % menos de gente' },
    ],
    apply: (c, i) => {
      if (i === 0) {
        pay(c, 25);
        return 'Folletos por todo el barrio: la gente sabe dónde encontraros.';
      }
      mod(c, { demand: 0.75 });
      return 'Hoy será un día tranquilo… demasiado tranquilo.';
    },
  },
  {
    id: 'lote',
    title: 'Oferta del proveedor',
    text: 'Le sobran 10 de carne que caducan hoy. Os la deja por 8 monedas.',
    options: [
      { label: 'Comprarla', hint: '+10 de carne (caduca hoy) por 8' },
      { label: 'No, gracias', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'El proveedor se encoge de hombros.';
      pay(c, 8);
      c.stock.carne.push({ qty: 10, expires: c.day });
      return '10 de carne más en la despensa. ¡Hay que gastarla hoy!';
    },
  },
  {
    id: 'colegio',
    title: 'La fiesta del colegio',
    text: 'Las familias piden una ayuda para la fiesta de fin de curso.',
    options: [
      { label: 'Donar 30', hint: '−30 monedas, +4 de reputación y algo más de gente hoy' },
      { label: 'Este año no', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'Quizá el año que viene.';
      pay(c, 30);
      rep(c, 4);
      mod(c, { demand: 1.1 });
      return 'Vuestro logo sale en el cartel de la fiesta. +4 de reputación.';
    },
  },
  {
    id: 'gato',
    title: 'Un gato en la puerta',
    text: 'Un gato naranja lleva días rondando el restaurante. Os mira fijamente.',
    options: [
      { label: 'Adoptarlo', hint: '−10 monedas, +2 de reputación' },
      { label: 'Espantarlo', hint: 'No pasa nada (o sí)' },
    ],
    apply: (c, i, luck) => {
      if (i === 0) {
        pay(c, 10);
        rep(c, 2);
        return 'Se llama Mandarino y ya es la mascota del local. +2 de reputación.';
      }
      if (luck < 0.3) {
        rep(c, -1);
        return 'Los niños del barrio no os lo perdonan. −1 de reputación.';
      }
      return 'El gato se va ofendido.';
    },
  },
  {
    id: 'famoso',
    title: 'Reserva de un famoso',
    text: 'Un futbolista quiere el local para él solo durante una hora y paga bien.',
    options: [
      { label: 'Aceptar', hint: '+80 monedas; hoy un 30 % menos de clientes' },
      { label: 'Rechazar', hint: 'No pasa nada' },
    ],
    apply: (c, i) => {
      if (i === 1) return 'Le decís que aquí todos los clientes son iguales.';
      c.money += 80;
      mod(c, { demand: 0.7 });
      return '¡Foto firmada para la pared! +80 monedas.';
    },
  },
];

/** Número repetible (0-1) para un día y un uso. */
function rnd(day: number, salt: number): number {
  let h = (Math.imul(day + 101, 2246822519) ^ Math.imul(salt + 7, 3266489917)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2654435761) >>> 0;
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

/** La decisión de esta mañana (la mitad de los días, desde el día 3; nunca en domingo de concurso). */
export function makeDilemma(c: Campaign): Dilemma | null {
  if (c.day < 3 || (c.day - 1) % 7 === 6 || rnd(c.day, 1) > 0.5) return null;
  const def = DILEMMAS[Math.floor(rnd(c.day, 2) * DILEMMAS.length)];
  return { id: def.id, title: def.title, text: def.text, options: def.options };
}

/** Elegir una opción: se aplica y queda el resultado para enseñarlo. */
export function decide(c: Campaign, choice: number): boolean {
  const d = c.dilemma;
  const def = d && DILEMMAS.find((x) => x.id === d.id);
  if (!def || (choice !== 0 && choice !== 1)) return false;
  c.dilemmaResult = def.apply(c, choice as 0 | 1, rnd(c.day, 3));
  c.dilemma = null;
  return true;
}
