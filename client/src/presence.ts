// Estado en Discord («Jugando a ¡Oído, Cocina!»): qué estáis haciendo y cuántos sois,
// para que los amigos del servidor lo vean en tu perfil y se apunten.
import type { RoomInfo, SummaryInfo } from '@hora-punta/shared';
import { setPresence } from './discord';
import { net } from './net';

function party(info: RoomInfo) {
  return { size: info.members.length, max: Math.max(info.modo, info.members.length) };
}

function cooks(info: RoomInfo): string {
  if (info.modo === 1) return 'En solitario';
  return `${info.members.length} de ${info.modo} cocineros${info.estilo === 'libre' ? ' · modo libre' : ''}`;
}

function fromRoom(info: RoomInfo): void {
  switch (info.phase) {
    case 'lobby':
      setPresence(
        `En la sala · nivel ${info.nivel}`,
        info.members.length < info.modo ? `Esperando cocineros (${info.members.length}/${info.modo})` : cooks(info),
        party(info),
      );
      break;
    case 'playing':
      setPresence(`Cocinando en el nivel ${info.nivel}`, cooks(info), party(info));
      break;
    case 'perks':
      setPresence(`Nivel ${info.nivel - 1} superado`, 'Eligiendo habilidades', party(info));
      break;
    case 'shop':
      setPresence(`Nivel ${info.nivel - 1} superado`, 'De compras en la tienda', party(info));
      break;
  }
}

function fromSummary(s: SummaryInfo): void {
  const info = net.info;
  const p = info ? party(info) : undefined;
  if (s.run) {
    const n = s.run.levelsPassed;
    setPresence(s.won ? '¡Los 20 niveles superados!' : `Partida terminada: ${n} ${n === 1 ? 'nivel' : 'niveles'}`, 'Mirando el ranking', p);
  } else {
    setPresence(`¡Nivel ${s.level} superado!`, `${s.stats.served} hamburguesas servidas`, p);
  }
}

export function startPresence(): void {
  net.on('room', fromRoom);
  net.on('summary', fromSummary);
}

/** En el menú, sin sala. */
export function menuPresence(): void {
  setPresence('En el menú', 'Eligiendo cuántos cocinan');
}
