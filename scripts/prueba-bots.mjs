// Prueba rápida del multijugador sin navegador: dos bots juegan un turno corto.
// Uso (con el servidor en marcha):  node scripts/prueba-bots.mjs
import { Client } from '@colyseus/sdk';

const URL = process.env.SERVIDOR ?? 'http://localhost:2567';
const sala = `bots-${Date.now()}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, label) => console.log(`${ok ? '✅' : '❌'} ${label}`);

async function bot(name, opts = {}) {
  const room = await new Client(URL).joinOrCreate('kitchen', { sala, name, turno: 15, modo: 2, ...opts });
  const b = { room, name, id: room.sessionId, info: null, snap: null, summary: null, events: [] };
  room.onMessage('room', (i) => (b.info = i));
  room.onMessage('snap', (s) => (b.snap = s));
  room.onMessage('events', (e) => b.events.push(...e));
  room.onMessage('summary', (s) => (b.summary = s));
  b.emotes = [];
  room.onMessage('emote', (e) => b.emotes.push(e));
  room.onMessage('bought', () => {});
  room.send('hello');
  b.me = () => b.snap?.players.find((p) => p.id === b.id);
  // Camina a velocidad normal por los puntos indicados y se gira hacia `face`.
  b.walk = async (path, face) => {
    let { x, y } = b.me();
    for (const [tx, ty] of path) {
      for (;;) {
        const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
        if (d < 0.01) break;
        const s = Math.min(d, 0.3);
        x += (dx / d) * s;
        y += (dy / d) * s;
        room.send('input', { x, y, fx: Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, fy: Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy), moving: true });
        await wait(80);
      }
    }
    b.pose = { x, y, fx: face[0], fy: face[1], moving: false };
    room.send('input', b.pose);
    await wait(150);
  };
  b.act = async () => {
    room.send('interact', b.pose);
    await wait(200);
  };
  await wait(300);
  return b;
}

const ana = await bot('Ana', { look: { apron: 6, hat: 'corona' } });
const beto = await bot('Beto');
check(ana.info?.members.length === 2, 'Los dos están en la misma sala');
check(ana.info.nivel === 1, 'Sala nueva: nivel 1');
const anaLook = ana.info.members.find((m) => m.id === ana.id).look;
check(anaLook.apron === 6 && anaLook.hat === 'corona', 'Ana entra con su delantal rosa y corona');

beto.room.send('claim', 'plancha');
beto.room.send('claim', 'freidora');
await wait(200);
const roles = (b) => ana.info.members.find((m) => m.id === b.id).roles.join('+');
check(roles(ana) === 'caja+montaje' && roles(beto) === 'plancha+freidora', `Reparto automático para 2: Ana ${roles(ana)}, Beto ${roles(beto)}`);

ana.room.send('start');
await wait(400);
check(ana.info.phase === 'playing' && !!beto.snap, 'Empieza el turno en los dos');
check(beto.snap.level === 1 && beto.snap.goal >= 2, `La ronda es del nivel 1 con objetivo ${beto.snap.goal}`);
check(beto.snap.players.find((p) => p.id === ana.id)?.look.hat === 'corona', 'Beto ve la corona de Ana en la cocina');
ana.room.send('emote', 1);
ana.room.send('emote', 2);
await wait(300);
check(beto.emotes.length === 1 && beto.emotes[0].id === ana.id && beto.emotes[0].emote === 1, 'Ana grita «¡Ayuda!» y Beto lo ve (el segundo gesto seguido se ignora)');
ana.room.send('pause', true);
await wait(300);
const t0 = beto.snap.time;
await wait(600);
check(beto.info.paused === 'Ana' && beto.snap.time === t0, 'Ana pausa: Beto ve «Pausada por Ana» y el reloj se para');
beto.room.send('pause', false);
await wait(400);
check(beto.info.paused === null && beto.snap.time > t0, 'Beto reanuda y el reloj sigue');

// Beto: carne cruda a la plancha
await beto.walk([[2.5, 7.5]], [0, 1]);
await beto.act();
check(beto.me().holding?.kind === 'raw', 'Beto coge carne cruda de la caja');
await beto.walk([[1.5, 7.5], [1.5, 4.5]], [-1, 0]);
await beto.act();
check(beto.snap.stations.some(([k, s]) => k === '0,4' && s.item?.kind === 'raw'), 'La carne está en la plancha');

// Ana: toma nota en el pase e intenta usar la plancha
await ana.walk([[2.5, 4.5], [4.5, 4.5]], [0, -1]);
await ana.act();
check(ana.snap.orders.some((o) => o.taken), 'Ana toma nota de un pedido en el pase');
await ana.walk([[2.5, 4.5]], [-1, 0]);
await ana.walk([[1.5, 5.5]], [-1, 0]);
await ana.act();
check(ana.events.some((e) => e.type === 'denied' && e.playerId === ana.id), 'A Ana no le deja usar la plancha (es de Beto)');

// Beto recoge la carne hecha y se la pasa a Ana
while (!beto.snap.stations.some(([k, s]) => k === '0,4' && s.item?.kind === 'food')) await wait(100);
await beto.walk([[1.5, 4.5]], [-1, 0]);
await beto.act();
check(beto.me().holding?.kind === 'food', 'Beto recoge la carne hecha');
await ana.walk([[2.5, 5.5]], [-1, 0]);
await beto.walk([[1.5, 5.5]], [1, 0]);
await beto.act();
check(ana.me().holding?.layers?.[0] === 'carne' && !beto.me().holding, 'Beto le pasa la carne a Ana en mano');

// Fin del turno
while (!ana.summary) await wait(200);
const s = ana.summary;
check(s.level === 1 && s.passed === false && s.stars === 0 && !s.perkNext, `Sin llegar al objetivo no se pasa (${s.stats.served}/${s.goal})`);
check(s.players.length === 2 && s.mvpId, `Resumen con ${s.players.length} cocineros; MVP: ${s.players.find((p) => p.id === s.mvpId)?.name}`);

// Si Beto se va, Ana hereda sus puestos
await beto.room.leave();
await wait(300);
check(roles(ana) === 'caja+plancha+montaje+freidora' || ana.info.members[0].roles.length === 4, `Beto se va y Ana hereda sus puestos (${roles(ana)})`);
await ana.room.leave();

// Modo 3: no se puede empezar hasta que estén los tres, y el reparto cambia
const sala3 = `bots3-${Date.now()}`;
const c1 = await bot('Uno', { sala: sala3, modo: 3 });
const c2 = await bot('Dos', { sala: sala3, modo: 3 });
c1.room.send('start');
await wait(300);
check(c1.info.phase === 'lobby', 'Modo 3 con 2 jugadores: todavía no se puede empezar');
const c3 = await bot('Tres', { sala: sala3, modo: 3 });
await wait(200);
const r3 = c1.info.members.map((m) => m.roles.join('+')).join(' | ');
check(r3 === 'caja+montaje | plancha | freidora', `Reparto automático para 3: ${r3}`);
c1.room.send('start');
await wait(300);
check(c1.info.phase === 'playing', 'Con los 3 ya empieza');
for (const b of [c1, c2, c3]) await b.room.leave();

// Modo libre: todos pueden hacerlo todo y no hay que tomar nota
const salaL = `libre-${Date.now()}`;
const l1 = await bot('Lola', { sala: salaL, modo: 2 });
const l2 = await bot('Leo', { sala: salaL, modo: 2 });
check(l1.info.estilo === 'rol', 'Por defecto, modo rol');
l2.room.send('estilo', 'libre');
await wait(300);
check(l1.info.estilo === 'libre' && l1.info.members.every((m) => m.roles.length === 4), 'Leo pone el modo libre: los dos tienen toda la cocina');
l1.room.send('claim', 'plancha');
await wait(200);
check(l1.info.members.every((m) => m.roles.length === 4), 'En modo libre no se reparten puestos');
l1.room.send('start');
while (!l1.snap?.orders.length) await wait(100);
check(l1.snap.orders.every((o) => o.taken), 'Modo libre: los pedidos llegan sin pasar por caja');
for (const b of [l1, l2]) await b.room.leave();
const n2 = await bot('Nora', { sala: `nivel2-${Date.now()}`, modo: 2, nivel: 2 });
n2.room.send('estilo', 'libre');
await wait(300);
check(n2.info.estilo === 'rol', 'A mitad de partida (nivel 2) no se puede cambiar el modo');
await n2.room.leave();

// Modo 1: el cliente dice directamente lo que quiere
const solo = await bot('Solo', { sala: `solo-${Date.now()}`, modo: 1 });
solo.room.send('start');
while (!solo.snap?.orders.length) await wait(100);
check(solo.snap.orders.every((o) => o.taken), 'Modo 1: los pedidos llegan sin pasar por caja');
await solo.room.leave();

// Campaña: el restaurante del grupo, con gestión, servicio, cierre y guardado
{
  const key = `bots-${Date.now()}`;
  const camp = { sala: `campana-${key}`, grupo: key, juego: 'campana', turno: 15 };
  const g1 = await bot('Gema', camp);
  const g2 = await bot('Gus', camp);
  let c = g1.info.campana;
  check(g1.info.phase === 'gestion' && c?.day === 1 && g1.info.members.length === 2, 'Campaña: los dos en la gestión del día 1');
  const carne0 = c.stock.carne.reduce((n, l) => n + l.qty, 0);
  g2.room.send('c:buy', 'carne');
  g1.room.send('c:price', { id: 'chispa', price: 8 });
  g1.room.send('c:learn', 'jardin');
  g2.room.send('c:loan', 50);
  await wait(400);
  c = g1.info.campana;
  const carne1 = c.stock.carne.reduce((n, l) => n + l.qty, 0);
  check(carne1 === carne0 + 5, `Gus compra carne y Gema lo ve (${carne0} → ${carne1})`);
  check(c.menu.find((m) => m.recipeId === 'chispa').price === 8, 'Gema sube La Chispa a 8');
  check(c.learnedRecipes.includes('jardin') && c.menu.find((m) => m.recipeId === 'jardin').on, 'Aprenden El Jardín y entra en la carta');
  check(c.debt === 150, `Piden un préstamo de 50 (deuda ${c.debt})`);
  g1.room.send('ready');
  await wait(200);
  check(g1.info.phase === 'gestion', 'Con uno solo listo no se abre');
  g2.room.send('ready');
  await wait(400);
  check(g1.info.phase === 'playing' && g1.snap?.day === 1 && g1.snap.stock?.carne_cruda === carne1, '¡Abierto! El servicio lleva el stock de la despensa');
  // Gema (caja+montaje) no puede coger carne; Gus (plancha+freidora) sí
  await g2.walk([[2.5, 7.5]], [0, 1]);
  await g2.act();
  check(g2.me().holding?.kind === 'raw' && g2.snap.stock.carne_cruda === carne1 - 1, 'Gus coge carne y la caja tiene una menos');
  while (g1.info.phase !== 'cierre') await wait(300);
  c = g1.info.campana;
  const r = c.lastReport;
  check(r?.day === 1 && c.day === 2 && r.rent === 15, `Cierre del día 1: alquiler ${r?.rent}, intereses ${r?.interest}, dinero ${r?.moneyAfter}`);
  check(c.stock.carne.reduce((n, l) => n + l.qty, 0) === carne1 - 1, 'La carne usada se descuenta de la despensa');
  g1.room.send('c:next');
  await wait(300);
  check(g2.info.phase === 'gestion' && g2.info.campana.day === 2, 'Mañana del día 2');
  await g1.room.leave();
  await g2.room.leave();
  await wait(400);
  const g3 = await bot('Gema', camp);
  check(g3.info.campana?.day === 2 && g3.info.campana.learnedRecipes.includes('jardin'), 'Al volver a entrar, el restaurante sigue en el día 2 (guardado)');
  await g3.room.leave();
}

// Partida en solitario desde el nivel 2: el bot cocina dos Chispas, supera el nivel,
// elige habilidad, y al perder el nivel 3 vuelve al 1 sin habilidades.
const chef = await bot('Chef', { sala: `perk-${Date.now()}`, modo: 1, nivel: 2, turno: 60, grupo: `bots${Date.now()}` });
check(chef.info.nivel === 2, 'Sala de prueba empezando en el nivel 2');
chef.room.send('start');
while (!chef.snap) await wait(100);
const montajeHas = (n) => chef.snap.stations.some(([k, s]) => k === '4,5' && s.item?.layers?.length === n);
async function chispa() {
  await chef.walk([[2.5, 7.5]], [0, 1]);
  await chef.act(); // carne cruda
  await chef.walk([[1.5, 7.5], [1.5, 4.5]], [-1, 0]);
  await chef.act(); // a la plancha
  await chef.walk([[1.5, 7.5]], [0, 1]);
  await chef.act(); // pan
  await chef.walk([[3.5, 7.5], [3.5, 5.5]], [1, 0]);
  await chef.act(); // base en la mesa de montaje
  while (!chef.snap.stations.some(([k, s]) => k === '0,4' && s.item?.kind === 'food')) await wait(100);
  await chef.walk([[1.5, 5.5], [1.5, 4.5]], [-1, 0]);
  await chef.act(); // carne hecha
  await chef.walk([[1.5, 5.5], [3.5, 5.5]], [1, 0]);
  await chef.act();
  await chef.walk([[3.5, 7.5]], [0, 1]);
  await chef.act(); // queso
  await chef.walk([[3.5, 5.5]], [1, 0]);
  await chef.act();
  await chef.walk([[3.5, 7.5], [1.5, 7.5]], [0, 1]);
  await chef.act(); // pan de arriba
  await chef.walk([[3.5, 7.5], [3.5, 5.5]], [1, 0]);
  await chef.act();
  const ok = montajeHas(4);
  await chef.act(); // coger la hamburguesa
  await chef.walk([[3.5, 4.5]], [0, -1]);
  while (!chef.snap.orders.some((o) => o.recipeId === 'chispa' && !o.done.burger)) await wait(100);
  await chef.act(); // servir
  return ok;
}
check(await chispa(), 'El bot monta una Chispa completa');
await chispa();
check(chef.snap.stats.served >= 2, `Sirve ${chef.snap.stats.served} pedidos (objetivo ${chef.snap.goal})`);
while (!chef.summary) await wait(200);
check(chef.summary.passed && chef.summary.perkNext, 'Nivel 2 superado: toca elegir habilidad');
chef.room.send('lobby');
await wait(300);
const offer = chef.info.members[0].offer;
check(chef.info.phase === 'perks' && offer?.length === 3 && !offer.includes('labia'), `Le ofrecen 3 habilidades (${offer?.join(', ')})`);
chef.room.send('perk', offer[0]);
await wait(300);
check(chef.info.phase === 'shop' && chef.info.members[0].perks[0] === offer[0], `Elige ${offer[0]} y pasa a la tienda`);
const dinero = chef.info.dinero;
check(dinero > 0 && dinero === chef.summary.earnedRound, `La tienda tiene el dinero de la ronda (${dinero})`);
chef.room.send('buy', 'plancha3');
await wait(200);
check(dinero < 45 && !chef.info.mejoras.includes('plancha3') && chef.info.dinero === dinero, 'Sin dinero suficiente no se compra la tercera plancha');
chef.room.send('buy', 'dispensador');
await wait(200);
const bought = chef.info.mejoras.includes('dispensador');
check(bought === (dinero >= 25) && chef.info.dinero === (bought ? dinero - 25 : dinero), `Dispensador doble (25): ${bought ? 'comprado' : 'no alcanza'}`);
chef.room.send('ready');
await wait(300);
check(chef.info.phase === 'lobby' && chef.info.nivel === 3, 'Listo: a la sala, nivel 3');
chef.summary = null;
chef.room.send('start');
await wait(300);
check(chef.snap.players[0].perks[0] === offer[0], 'La habilidad le acompaña en la cocina');
while (!chef.summary) await wait(500);
await wait(300);
check(!chef.summary.passed && chef.info.nivel === 1 && chef.info.members[0].perks.length === 0, 'Pierde el nivel 3: vuelta al nivel 1 sin habilidades');
check(chef.info.dinero === 0 && chef.info.mejoras.length === 0, 'Y sin dinero ni mejoras');
const run = chef.summary.run;
check(run?.levelsPassed === 2 && run.served >= 2 && run.players[0].perks[0] === offer[0], `Resumen de la partida: ${run?.levelsPassed} niveles, ${run?.served} hamburguesas`);
check(run?.position === 1 && run.ranking[0].names[0] === 'Chef', 'Entra el primero en el ranking del grupo');
await chef.room.leave();
process.exit(0);
