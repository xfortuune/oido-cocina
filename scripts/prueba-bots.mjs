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

const ana = await bot('Ana');
const beto = await bot('Beto');
check(ana.info?.members.length === 2, 'Los dos están en la misma sala');
check(ana.info.nivel === 1, 'Sala nueva: nivel 1');

beto.room.send('claim', 'plancha');
beto.room.send('claim', 'freidora');
await wait(200);
const roles = (b) => ana.info.members.find((m) => m.id === b.id).roles.join('+');
check(roles(ana) === 'caja+montaje' && roles(beto) === 'plancha+freidora', `Reparto automático para 2: Ana ${roles(ana)}, Beto ${roles(beto)}`);

ana.room.send('start');
await wait(400);
check(ana.info.phase === 'playing' && !!beto.snap, 'Empieza el turno en los dos');
check(beto.snap.level === 1 && beto.snap.goal >= 2, `La ronda es del nivel 1 con objetivo ${beto.snap.goal}`);

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

// Modo 1: el cliente dice directamente lo que quiere
const solo = await bot('Solo', { sala: `solo-${Date.now()}`, modo: 1 });
solo.room.send('start');
while (!solo.snap?.orders.length) await wait(100);
check(solo.snap.orders.every((o) => o.taken), 'Modo 1: los pedidos llegan sin pasar por caja');
await solo.room.leave();

// Partida en solitario desde el nivel 2: el bot cocina dos Chispas, supera el nivel,
// elige habilidad, y al perder el nivel 3 vuelve al 1 sin habilidades.
const chef = await bot('Chef', { sala: `perk-${Date.now()}`, modo: 1, nivel: 2, turno: 60 });
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
check(chef.info.phase === 'lobby' && chef.info.nivel === 3 && chef.info.members[0].perks[0] === offer[0], `Elige ${offer[0]} y pasa al nivel 3`);
chef.summary = null;
chef.room.send('start');
await wait(300);
check(chef.snap.players[0].perks[0] === offer[0], 'La habilidad le acompaña en la cocina');
while (!chef.summary) await wait(500);
await wait(300);
check(!chef.summary.passed && chef.info.nivel === 1 && chef.info.members[0].perks.length === 0, 'Pierde el nivel 3: vuelta al nivel 1 sin habilidades');
await chef.room.leave();
process.exit(0);
