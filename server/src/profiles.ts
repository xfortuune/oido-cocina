// Perfiles de los cocineros (estadísticas y logros), por cuenta de Discord o, en el navegador, por nombre.
// Se guardan en un JSON en disco, como el ranking.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPassXp, newProfile, passXp, recordRound, reviveProfile, type Achievement, type PassReward, type Profile, type RoundRecord } from '@hora-punta/shared';

const FILE =
  process.env.PROFILES_FILE ??
  (process.env.DATA_DIR ? `${process.env.DATA_DIR}/perfiles.json` : fileURLToPath(new URL('../data/perfiles.json', import.meta.url)));

let data: Record<string, Profile> | null = null;

function load(): Record<string, Profile> {
  if (data) return data;
  try {
    data = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, Profile>;
  } catch {
    data = {};
  }
  return data;
}

function save(): void {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(data));
  } catch (err) {
    console.error('[perfiles] No se pudo guardar:', err instanceof Error ? err.message : err);
  }
}

/** El perfil de un cocinero (se crea si no existe); el nombre y el avatar se ponen al día. */
export function getProfile(key: string, name: string, avatar: string | null = null): Profile {
  const all = load();
  const p = all[key] ? reviveProfile(all[key], name) : newProfile(name, avatar);
  p.name = name;
  if (avatar) p.avatar = avatar;
  all[key] = p;
  return p;
}

/** Apunta una ronda en el perfil, lo guarda y devuelve los logros nuevos. */
export function recordProfile(key: string, name: string, r: RoundRecord): { profile: Profile; fresh: Achievement[]; rewards: PassReward[] } {
  const profile = getProfile(key, name);
  const fresh = recordRound(profile, r);
  // Pase de temporada: experiencia por jugar.
  const rewards = addPassXp(profile, passXp(r.served, r.perfect));
  load()[key] = profile;
  save();
  return { profile, fresh, rewards };
}
