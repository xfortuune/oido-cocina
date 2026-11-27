// El Diario del Barrio: cada lunes por la mañana, una portada con la semana del restaurante, el rival,
// un cotilleo y la previsión del tiempo.
import { RIVAL } from './progress';
import { CITIES, weatherDay, type Campaign, type Newspaper } from './campaign';
import { holidayOf, WEATHER, weatherOf } from './weather';

const GOSSIP = [
  'Dicen que el gato de la plaza ya distingue el olor del bacon a tres calles.',
  'La señora del quinto asegura que vuestras patatas «son mejores que las de su nieto».',
  'Vista una cola de palomas esperando las migas del pan de vuestra puerta.',
  'El cartero confiesa que alarga la ruta para pasar por delante de la plancha.',
  'Un turista preguntó si «La Chispa» era un monumento. Casi.',
  'Se rumorea que en Mega Mordisco congelan hasta el agua.',
  'Los niños del colegio han inventado una canción sobre vuestra freidora.',
  'El concejal de fiestas fue visto con una servilleta vuestra en el bolsillo.',
];

function pick<T>(list: T[], n: number): T {
  return list[((n % list.length) + list.length) % list.length];
}

export function makeNewspaper(c: Campaign): Newspaper {
  const w = c.week;
  const name = c.city === 'mandarina' ? 'Mordiscos Mandarina' : `Mordiscos Mandarina ${CITIES[c.city].name}`;
  const headline =
    w.served === 0
      ? `${name}, una semana tranquila`
      : w.money > 150
        ? `¡${name} hace caja: +${w.money} en una semana!`
        : w.lost > w.served / 3
          ? `Colas y prisas en ${name}: ${w.lost} clientes se fueron sin comer`
          : `${w.served} hamburguesas en una semana en ${name}`;
  const lines = [
    `Servidos: ${w.served} · perdidos: ${w.lost} · resultado: ${w.money >= 0 ? '+' : ''}${w.money}`,
    ...(w.best.served ? [`Mejor día: el ${w.best.day}, con ${w.best.served} clientes servidos.`] : []),
    `Reputación: ${c.reputation}${c.rival ? ` · ${RIVAL.name}: ${c.rival.rep}` : ''}`,
    ...(c.inspection?.grade ? [`Nota de sanidad en la puerta: ${c.inspection.grade}`] : []),
  ];
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const wd = weatherDay({ day: c.day + i, city: c.city });
    const h = holidayOf(wd);
    return `${WEATHER[weatherOf(wd)].name}${h ? ` (${h})` : ''}`;
  });
  return { day: c.day, headline, lines, gossip: pick(GOSSIP, c.day * 7 + c.totals.served), forecast };
}
