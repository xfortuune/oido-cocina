// Tutorial para nuevos: la primera vez que se juega, una guía paso a paso con una flecha que señala
// dónde ir. Se adapta a los puestos de cada uno y cada paso avanza solo cuando se hace.
import type { Item, KitchenSim, Player, Role, TileKind } from '@hora-punta/shared';

export interface TutorialStep {
  id: string;
  /** Puestos para los que sale (si no tienes ninguno de ellos, se salta). */
  roles: Role[];
  text: string;
  /** Dónde señala la flecha: casillas de este tipo (y, si es una caja, con este contenido). */
  target?: { kind: TileKind; crate?: string };
  done: (sim: KitchenSim, me: Player) => boolean;
}

const items = (sim: KitchenSim, kind: TileKind): Item[] => {
  const out: Item[] = [];
  for (const row of sim.kitchen.tiles) {
    for (const t of row) {
      if (t.kind !== kind) continue;
      const it = sim.station(t.x, t.y)?.item;
      if (it) out.push(it);
    }
  }
  return out;
};

const foods = (sim: KitchenSim, me: Player): string[][] => {
  const out: string[][] = [];
  for (const it of [...items(sim, 'montaje'), ...items(sim, 'counter'), me.holding]) if (it?.kind === 'food') out.push(it.layers);
  for (const p of sim.players.values()) if (p.holding?.kind === 'food') out.push(p.holding.layers);
  return out;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'nota',
    roles: ['caja'],
    text: 'Eres la caja: cuando llegue un cliente, ve al pase rojo y pulsa acción para tomarle nota.',
    target: { kind: 'pase' },
    done: (sim) => !sim.needsCaja || sim.players.size <= 1 || sim.orders.some((o) => o.taken),
  },
  {
    id: 'carne',
    roles: ['plancha'],
    text: 'Coge carne cruda de su caja (ponte delante y pulsa acción).',
    target: { kind: 'crate', crate: 'carne_cruda' },
    done: (sim, me) => me.holding?.kind === 'raw' || items(sim, 'grill').length > 0,
  },
  {
    id: 'plancha',
    roles: ['plancha'],
    text: 'Pon la carne en una plancha. Cuando esté hecha, cógela antes de que se queme.',
    target: { kind: 'grill' },
    done: (sim) => items(sim, 'grill').length > 0,
  },
  {
    id: 'pan',
    roles: ['montaje'],
    text: 'Coge pan de su caja: es la base de la hamburguesa.',
    target: { kind: 'crate', crate: 'pan' },
    done: (sim, me) => foods(sim, me).some((l) => l[0] === 'pan'),
  },
  {
    id: 'montaje',
    roles: ['montaje'],
    text: 'Deja el pan en la mesa de montaje.',
    target: { kind: 'montaje' },
    done: (sim) => items(sim, 'montaje').some((i) => i.kind === 'food'),
  },
  {
    id: 'apilar',
    roles: ['montaje'],
    text: 'Pon encima la carne hecha (si no llevas la plancha, tu compañero te la pasa o la deja en una encimera).',
    target: { kind: 'montaje' },
    done: (sim, me) => foods(sim, me).some((l) => l.length >= 2 && l.includes('carne')),
  },
  {
    id: 'completar',
    roles: ['montaje'],
    text: 'Mira la comanda de arriba y añade el resto de capas en orden, acabando con la tapa de pan.',
    target: { kind: 'montaje' },
    done: (sim, me) => foods(sim, me).some((l) => l.length >= 4 && l[l.length - 1] === 'pan') || sim.stats.served > 0,
  },
  {
    id: 'entregar',
    roles: ['caja'],
    text: 'Coge la hamburguesa terminada y llévala al pase rojo para servirla.',
    target: { kind: 'pase' },
    done: (sim) => sim.stats.served > 0 || sim.orders.some((o) => o.done.burger),
  },
  {
    id: 'patatas',
    roles: ['freidora'],
    text: 'Si piden patatas: cógelas de su caja y échalas a la freidora.',
    target: { kind: 'crate', crate: 'patatas' },
    done: (sim, me) => me.holding?.kind === 'potatoes' || items(sim, 'fryer').length > 0 || !sim.orders.some((o) => o.fries),
  },
  {
    id: 'bebida',
    roles: ['freidora'],
    text: 'Si piden bebida: pulsa acción en la máquina de su sabor y recoge el vaso cuando esté lleno.',
    target: { kind: 'drinks' },
    done: (sim, me) => me.holding?.kind === 'drink' || items(sim, 'drinks').length > 0 || !sim.orders.some((o) => o.drink),
  },
];

const KEY = 'horaPunta.tutorial';

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === 'hecho';
  } catch {
    return true;
  }
}

export function markTutorial(done: boolean): void {
  try {
    if (done) localStorage.setItem(KEY, 'hecho');
    else localStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento
  }
}

/** Pasos que tocan según tus puestos (sin «tomar nota» si los clientes piden directamente). */
export function stepsFor(roles: Role[], needsCaja: boolean): TutorialStep[] {
  return TUTORIAL_STEPS.filter((s) => s.roles.some((r) => roles.includes(r)) && (needsCaja || s.id !== 'nota'));
}
