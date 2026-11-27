// Simula muchas campañas con distintos niveles de juego para equilibrar la economía.
// Uso: npx tsx scripts/simular-campana.ts
// «habilidad» es la parte de los clientes que se atiende (0,75 = 3 de cada 4).
import * as C from '../shared/src/index.ts';
// Simulación de una campaña con un grupo «normal»: sirve el 75 % de los clientes, 40 % perfectos.
function play(skill = 0.75, seed = 1, verbose = false) {
  let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const c = C.newCampaign('sim');
  const log: string[] = [];
  for (let d = 0; d < 90 && !c.finished; d++) {
    const players = 2;
    // Mañana: aprender recetas, contratar, mejoras, segundo local, deuda
    for (const id of ['jardin', 'ahumada', 'doble', 'monstruo']) if (c.money > C.RECIPE_COST[id] + 120) C.learnRecipe(c, id);
    if (c.chapter >= 2 && c.money > 150 && !c.staff.includes('camarero')) C.hire(c, 'camarero');
    if (c.chapter >= 3 && c.money > 200 && !c.staff.includes('encargado')) C.hire(c, 'encargado');
    if (c.chapter >= 4 && c.money > 250 && !c.staff.includes('pinche')) C.hire(c, 'pinche');
    if (c.chapter >= 4 && c.money > C.PUERTO.price + 200) C.openPuerto(c);
    for (const u of ['plantas', 'cuadros', 'musica', 'neon', 'mesas']) if (c.money > C.getLocalUpgrade(u)!.price + 250) C.buyLocalUpgrade(c, u);
    if (c.debt > 0 && c.money > 160) C.repay(c, Math.min(c.debt, c.money - 140));
    C.checkChapterNow(c);
    const contest = C.contestAvailable(c) && C.setContest(c, true);
    if (!contest && c.board.length && rnd() < 0.8) C.acceptMission(c, c.board[0].id);
    const p = contest ? C.contestParams(c, players, 'rol') : C.serviceParams(c, players, 'rol');
    const expected = C.expectedCustomers(p);
    // Comprar ingredientes para lo previsto
    if (!contest) {
      const menu = C.menuOn(c);
      const need: Record<string, number> = {};
      for (const m of menu) for (const l of C.getRecipe(m.recipeId).layers) need[l] = (need[l] ?? 0) + expected / menu.length;
      need.patatas = expected * p.sideChance; need.refresco = expected * p.sideChance;
      for (const [id, n] of Object.entries(need)) { let guard = 0; while (C.stockCount(c, id as C.StockId) < n * 1.1 && guard++ < 20 && C.buyStock(c, id as C.StockId)); }
    }
    const servedN = Math.round(expected * Math.min(1, skill + (rnd() - 0.5) * 0.2));
    // Ventas
    let earned = 0, tips = 0, perfect = 0; const byRecipe: Record<string, number> = {}; let combos = 0;
    const st = C.stockForService(c); const menu = C.menuOn(c);
    let served = 0;
    for (let i = 0; i < servedN; i++) {
      const m = menu[i % menu.length];
      const layers = C.getRecipe(m.recipeId).layers;
      if (!contest) {
        const needs: Record<string, number> = {};
        for (const l of layers) { const k = l === 'carne' ? 'carne_cruda' : l; needs[k] = (needs[k] ?? 0) + 1; }
        if (!Object.entries(needs).every(([k, n]) => (st[k] ?? 0) >= n)) continue;
        for (const [k, n] of Object.entries(needs)) st[k] -= n;
      }
      served++;
      const fries = rnd() < p.sideChance, drink = rnd() < p.sideChance;
      if (!contest) { if (fries && st.patatas > 0) st.patatas--; if (drink && st.refresco > 0) st.refresco--; }
      const price = m.price + (fries ? c.sides.fries : 0) + (drink ? c.sides.drink : 0);
      const pf = rnd() < 0.4; if (pf) perfect++;
      const e = Math.round(price * (pf ? 0.9 : 0.75)); const t = pf ? Math.ceil(price * 0.3) * (c.upgrades.includes('tarro') ? 2 : 1) : 0;
      earned += e + t; tips += t; byRecipe[m.recipeId] = (byRecipe[m.recipeId] ?? 0) + 1; if (fries && drink) combos++;
    }
    const lost = Math.max(0, expected - served);
    // Como el juego: +1 por servido, +1 más si es perfecto, -8 por cliente perdido.
    const rep = Math.max(1, Math.min(100, c.reputation + served + perfect - lost * 8));
    const result = { money: contest ? 0 : earned - lost * 2, served, lost, perfect, earned: contest ? 0 : earned, tips: contest ? 0 : tips, reputation: rep, remaining: contest ? C.stockForService(c) : st };
    const day = c.day; const ch = c.chapter;
    const rep0 = C.closeDay(c, result);
    C.afterClose(c, rep0, { stats: { served, perfect, wrong: 0, lost, burnt: 1, trashed: 0, tips, earned, byRecipe, combos }, contest: contest ? { served, goal: p.goal } : null, xp: [] });
    if (verbose && (day % 5 === 0 || rep0.chapterDone)) log.push(`día ${day} cap ${ch} · clientes ${expected} servidos ${served} · dinero ${c.money} deuda ${c.debt} rep ${c.reputation}${c.rival ? ' rival ' + c.rival.rep : ''}${rep0.chapterDone ? ' → ¡capítulo ' + rep0.chapterDone.n + '!' : ''}${rep0.bankrupt ? ' QUIEBRA' : ''}`);
    if (rep0.bankrupt) return { bankrupt: true, day, chapter: ch, log, why: `dinero ${c.money} deuda ${rep0.debtAfter} staff ${c.staff.join(',')} puerto ${c.puertoOpen} rep ${c.reputation} servidos ${served}/${expected}` };
  }
  return { bankrupt: false, day: c.day, chapter: c.chapter, finished: c.finished, log };
}
const v = play(0.75, 7, true); console.log(v.log.join('\n'));
for (const skill of [0.55, 0.65, 0.75, 0.9]) {
  const res = [1, 2, 3, 4, 5, 6].map((s) => play(skill, s));
  console.log(`habilidad ${skill}: ` + res.map((x) => x.bankrupt ? `quiebra d${x.day} cap${x.chapter}` : x.finished ? `fin d${x.day}` : `cap${x.chapter} d${x.day}`).join(' | '));
  for (const x of res) if (x.bankrupt) console.log('   ', (x as { why?: string }).why);
}
