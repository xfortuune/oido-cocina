// Mensajes entre el cliente y el servidor Colyseus (sala "kitchen").
//
// Cliente → servidor:
//   'input'    InputMessage, ~20 veces por segundo
//   'interact' InputMessage (la posición en el momento de pulsar)
//   'claim'    Role: quedarse un puesto en el vestíbulo
//   'start'    empezar el turno (cualquiera, si todos los puestos están cubiertos)
//   'lobby'    volver al vestíbulo desde el resumen (o elegir habilidades, si toca)
//   'perk'     PerkId: elegir una de las tres habilidades ofrecidas
//   'buy'      UpgradeId: comprar una mejora en la tienda (dinero de todo el equipo)
//   'ready'    en la tienda: listo para seguir (cuando lo están todos, a la sala)
//   'emote'    number: gesto rápido (índice de EMOTES), en la cocina
//   'pause'    boolean: pausar o reanudar la ronda (para todos)
//   'estilo'   Estilo: modo rol o libre (en la sala, solo en el nivel 1)
//   'modo'     number: cambiar cuántos jugadores se esperan (2-4, en el vestíbulo)
//
// Servidor → cliente:
//   'room'     RoomInfo, cuando cambia el vestíbulo o la fase
//   'snap'     SimSnapshot, ~20 veces por segundo durante el turno
//   'events'   SimEvent[], efectos y avisos
//   'summary'  SummaryInfo, al acabar el turno
//   'emote'    EmoteMessage: alguien ha hecho un gesto
//   'bought'   UpgradeId: alguien ha comprado una mejora

import type { Estilo } from './levels';
import type { ChefLook } from './looks';
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
  /** Nivel con el que empieza la sala (solo para pruebas). */
  nivel?: number;
  /** Grupo para el ranking: en Discord, el servidor (guild) o el canal. */
  grupo?: string;
  /** Delantal y accesorio elegidos en el menú. */
  look?: ChefLook;
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

export type RoomPhase = 'lobby' | 'playing' | 'summary' | 'perks' | 'shop';

export interface LobbyMember {
  id: string;
  name: string;
  color: number;
  roles: Role[];
  /** URL del avatar de Discord (null fuera de Discord o sin avatar). */
  avatar: string | null;
  /** Mini-habilidades conseguidas en esta partida. */
  perks: string[];
  /** Habilidades entre las que está eligiendo ahora (null si no le toca o ya ha elegido). */
  offer: string[] | null;
  /** En la tienda: ha pulsado «Listo». */
  ready: boolean;
  look: ChefLook;
}

export interface EmoteMessage {
  id: string;
  emote: number;
}

export interface RoomInfo {
  phase: RoomPhase;
  sala: string;
  /** Jugadores que se esperan para empezar (1-4). */
  modo: number;
  members: LobbyMember[];
  /** Nivel que se va a jugar. Al perder una ronda se vuelve al 1. */
  nivel: number;
  /** Dinero de la partida (se gasta en la tienda; se pierde al perder una ronda). */
  dinero: number;
  /** Mejoras de la tienda compradas en esta partida. */
  mejoras: string[];
  /** Quién ha pausado la ronda (null si no está en pausa). */
  paused: string | null;
  /** Modo de juego de la partida: rol (puestos) o libre (todos lo hacen todo, sin caja). */
  estilo: Estilo;
}

export interface RankingEntry {
  names: string[];
  /** Niveles superados. */
  level: number;
  served: number;
  players: number;
  /** Fecha ISO. */
  date: string;
  /** Modo en que se jugó (las partidas antiguas no lo tienen: eran de rol). */
  estilo?: Estilo;
}

/** Resumen de una partida entera (al perder, o al superar los 20 niveles). */
export interface RunSummary {
  levelsPassed: number;
  served: number;
  earned: number;
  perfect: number;
  seconds: number;
  players: (LobbyMember & { score: number })[];
  mvpId: string | null;
  mejoras: string[];
  /** Mejores partidas del grupo, y en qué puesto ha quedado esta (null si fuera del ranking). */
  ranking: RankingEntry[];
  position: number | null;
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
  /** Se han superado los 20 niveles. */
  won: boolean;
  /** Toca elegir habilidad al continuar. */
  perkNext: boolean;
  /** Dinero que se suma a la partida con esta ronda (si se ha superado). */
  earnedRound: number;
  /** Solo cuando se acaba la partida. */
  run: RunSummary | null;
}
