// Guardado de las campañas: un JSON por grupo en la carpeta de datos.
// En Railway hay que montar un Volume (por ejemplo en /data) y poner DATA_DIR=/data,
// o cada despliegue empezaría las campañas de cero.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newCampaign, reviveCampaign, type Campaign } from '@hora-punta/shared';

export const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../data', import.meta.url));
const DIR = join(DATA_DIR, 'campanas');

function file(key: string): string {
  return join(DIR, `${key.replace(/[^\w-]/g, '_').slice(0, 60)}.json`);
}

export function loadCampaign(key: string): Campaign {
  try {
    return reviveCampaign(JSON.parse(readFileSync(file(key), 'utf8')), key);
  } catch {
    return newCampaign(key);
  }
}

export function saveCampaign(c: Campaign): void {
  try {
    mkdirSync(DIR, { recursive: true });
    // Escribir aparte y renombrar: si el servidor se cae a mitad, no queda un archivo roto.
    const f = file(c.key);
    writeFileSync(`${f}.tmp`, JSON.stringify(c));
    renameSync(`${f}.tmp`, f);
  } catch (err) {
    console.error('[campaña] No se pudo guardar:', err instanceof Error ? err.message : err);
  }
}
