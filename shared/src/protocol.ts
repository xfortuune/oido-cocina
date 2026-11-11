// Mensajes entre el cliente y el servidor Colyseus (sala "kitchen").
//
// Cliente → servidor:
//   'input'    InputMessage, ~20 veces por segundo
//   'interact' InputMessage (la posición en el momento de pulsar)
//   'claim'    Role: quedarse un puesto en el vestíbulo
//   'start'    empezar el turno (cualquiera, si todos los puestos están cubiertos)
//   'lobby'    volver al vestíbulo desde el resumen
//   'nivel'    number: elegir nivel (en el vestíbulo o el resumen; solo los ya desbloqueados)
//   'modo'     number: cambiar cuántos jugadores se esperan (2-4, en el vestíbulo)
//
// Servidor → cliente:
//   'room'     RoomInfo, cuando cambia el vestíbulo o la fase
//   'snap'     SimSnapshot, ~20 veces por segundo durante el turno
//   'events'   SimEvent[], efectos y avisos
//   'summary'  SummaryInfo, al acabar el turno

import type { EndReason, PlayerStats, Role, TurnStats } from './sim';

export const ROOM_NAME = 'kitchen';
export const MAX_PLAYERS = 4;
export const TICK_MS = 50;

export interface JoinOptions {
  /** Sala: en Discord será el id de la instancia de la Actividad. */
  sala: string;
  name: string;
  /** Duración de la ronda en segundos (solo para pruebas). */
  turno?: number;
  /** Nivel más alto que este jugador ya tiene desbloqueado (guardado en su navegador). */
  nivel?: number;
  /** Token de Discord: el servidor lo usa para saber quién eres (nombre y avatar verificados). */
  accessToken?: string;
  /** Cuántos jugadores (1-4). Lo fija quien crea la sala. */
  modo?: number;
}

/**
 * Reparto de puestos según el número de jugadores (en orden de llegada).
 * Con 1 no hay caja que valga: los clientes piden directamente.
 */
export const ROLE_PRESETS: Record<number, Role[][]> = {
  1: [['caja', 'plancha', 'montaje', 'freidora']],
  2: [
    ['caja', 'montaje'],
    ['plancha', 'freidora'],
  ],
  3: [['caja', 'montaje'], ['plancha'], ['freidora']],
  4: [['caja'], ['plancha'], ['montaje'], ['freidora']],
};

export function clampModo(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(1, Math.min(MAX_PLAYERS, v)) : 2;
}

export interface InputMessage {
  x: number;
  y: number;
  fx: number;
  fy: number;
  moving: boolean;
}

export type RoomPhase = 'lobby' | 'playing' | 'summary';

export interface LobbyMember {
  id: string;
  name: string;
  color: number;
  roles: Role[];
  /** URL del avatar de Discord (null fuera de Discord o sin avatar). */
  avatar: string | null;
}

export interface RoomInfo {
  phase: RoomPhase;
  sala: string;
  /** Jugadores que se esperan para empezar (1-4). */
  modo: number;
  members: LobbyMember[];
  /** Nivel que se va a jugar. */
  nivel: number;
  /** Nivel más alto desbloqueado en esta sala. */
  desbloqueado: number;
}

export interface SummaryPlayer extends LobbyMember {
  stats: PlayerStats;
  score: number;
}

export interface SummaryInfo {
  stats: TurnStats;
  money: number;
  reputation: number;
  endReason: EndReason;
  players: SummaryPlayer[];
  mvpId: string | null;
  level: number;
  goal: number;
  /** Se ha llegado al objetivo de pedidos sin perder toda la reputación. */
  passed: boolean;
  /** 0-3 (0 si no se ha pasado). */
  stars: number;
  /** Nivel más alto desbloqueado tras esta ronda. */
  unlocked: number;
}
