// Ranking de récords por grupo (en Discord, el servidor o canal; en el navegador, «navegador»).
// Se guarda en un JSON en disco: en un hosting sin disco persistente se vaciaría al reiniciar.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RankingEntry } from '@hora-punta/shared';

// Con DATA_DIR (por ejemplo un Volume de Railway en /data) se guarda ahí junto a las campañas.
const FILE =
  process.env.RANKING_FILE ??
  (process.env.DATA_DIR ? `${process.env.DATA_DIR}/ranking.json` : fileURLToPath(new URL('../data/ranking.json', import.meta.url)));
const KEEP = 20;

let data: Record<string, RankingEntry[]> | null = null;

function load(): Record<string, RankingEntry[]> {
  if (data) return data;
  try {
    data = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, RankingEntry[]>;
  } catch {
    data = {};
  }
  return data;
}

function save(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(data, null, 1));
  } catch (err) {
    console.error('[ranking] No se pudo guardar:', err instanceof Error ? err.message : err);
  }
}

export function cleanGroup(g: unknown): string {
  const s = String(g ?? '').replace(/[^\w-]/g, '').slice(0, 40);
  return s || 'navegador';
}

function better(a: RankingEntry, b: RankingEntry): number {
  return b.level - a.level || b.served - a.served || a.date.localeCompare(b.date);
}

export function getRanking(group: string): RankingEntry[] {
  return [...(load()[cleanGroup(group)] ?? [])];
}

/** Apunta una partida y devuelve su puesto (1 = la mejor), o null si no entra en el ranking. */
export function addRanking(group: string, entry: RankingEntry): number | null {
  const all = load();
  const key = cleanGroup(group);
  const list = [...(all[key] ?? []), entry].sort(better).slice(0, KEEP);
  all[key] = list;
  save();
  const i = list.indexOf(entry);
  return i >= 0 ? i + 1 : null;
}
