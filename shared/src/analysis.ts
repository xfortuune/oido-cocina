// Análisis de una ronda o un servicio: qué salió bien, dónde se atascó la cocina y qué mejorar.
import { TIMELINE_STEP, type TurnStats } from './sim';

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Frases cortas sobre la ronda, de la más importante a la menos. */
export function insights(st: TurnStats): string[] {
  const out: string[] = [];
  const idle = st.idle ?? { grill: 0, fryer: 0, caja: 0 };
  if (idle.grill >= 12) out.push(`La plancha estuvo parada ${Math.round(idle.grill)} s con hamburguesas pendientes: carne a la plancha antes de que la pidan.`);
  if (idle.fryer >= 12) out.push(`La freidora estuvo parada ${Math.round(idle.fryer)} s con patatas pendientes.`);
  if (idle.caja >= 15) out.push(`Hubo clientes esperando a que les tomaran nota durante ${Math.round(idle.caja)} s.`);
  const tl = st.timeline;
  if (tl) {
    // El peor tramo de 30 segundos (más clientes perdidos) y el mejor (más servidos).
    const win = (arr: number[], i: number) => (arr[i] ?? 0) + (arr[i + 1] ?? 0) + (arr[i + 2] ?? 0);
    let worst = -1;
    let worstN = 0;
    let best = -1;
    let bestN = 0;
    for (let i = 0; i < Math.max(tl.lost.length, tl.served.length); i++) {
      if (win(tl.lost, i) > worstN) [worst, worstN] = [i, win(tl.lost, i)];
      if (win(tl.served, i) > bestN) [best, bestN] = [i, win(tl.served, i)];
    }
    if (worstN >= 2) out.push(`El peor momento: entre ${clock(worst * TIMELINE_STEP)} y ${clock((worst + 3) * TIMELINE_STEP)} se fueron ${worstN} clientes.`);
    if (bestN >= 3) out.push(`El mejor momento: ${bestN} pedidos servidos entre ${clock(best * TIMELINE_STEP)} y ${clock((best + 3) * TIMELINE_STEP)}.`);
  }
  if (st.burnt >= 2) out.push(`Se quemaron ${st.burnt} cosas: hay que estar pendiente de la plancha y la freidora.`);
  if (st.wrong >= 2) out.push(`${st.wrong} entregas equivocadas: mirad bien la comanda (el «sin» y el «doble»).`);
  if ((st.bestStreak ?? 0) >= 6) out.push(`Mejor racha: ${st.bestStreak} pedidos seguidos sin fallar.`);
  if (!out.length) out.push('¡Cocina redonda! Nada que mejorar en esta ronda.');
  return out;
}
