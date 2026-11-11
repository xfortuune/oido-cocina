// Conexión con el servidor Colyseus. Una sola por pestaña, compartida por todas las escenas.
import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import {
  ROOM_NAME,
  type InputMessage,
  type JoinOptions,
  type LobbyMember,
  type Role,
  type RoomInfo,
  type SimEvent,
  type SimSnapshot,
  type SummaryInfo,
} from '@hora-punta/shared';

/**
 * Eventos que emite:
 *   'room'    RoomInfo     (vestíbulo o fase cambiados)
 *   'snap'    SimSnapshot  (estado de la cocina, ~20/s)
 *   'events'  SimEvent[]
 *   'summary' SummaryInfo
 *   'left'               (conexión perdida del todo)
 */
class Net extends Phaser.Events.EventEmitter {
  private room: Room | null = null;
  info: RoomInfo | null = null;
  snapshot: SimSnapshot | null = null;
  summary: SummaryInfo | null = null;

  get connected(): boolean {
    return this.room !== null;
  }

  get id(): string {
    return this.room?.sessionId ?? '';
  }

  get me(): LobbyMember | undefined {
    return this.info?.members.find((m) => m.id === this.id);
  }

  async connect(options: JoinOptions): Promise<void> {
    if (this.room) return;
    // Mismo origen que la página (en Discord, el URL mapping lo lleva a nuestro servidor).
    // En desarrollo Vite reenvía /colyseus al servidor; en producción el servidor sirve todo en la raíz.
    const secure = location.protocol === 'https:';
    const client = new Client({
      hostname: location.hostname,
      port: Number(location.port) || (secure ? 443 : 80),
      secure,
      pathname: import.meta.env.DEV ? '/colyseus' : '',
    });
    const room = await client.joinOrCreate(ROOM_NAME, { ...options, nivel: savedLevel() });
    this.room = room;
    room.onMessage('room', (info: RoomInfo) => {
      this.info = info;
      // Fuera de la cocina la última instantánea ya no vale (sería de la ronda anterior).
      if (info.phase !== 'playing') this.snapshot = null;
      this.emit('room', info);
    });
    room.onMessage('snap', (snap: SimSnapshot) => {
      this.snapshot = snap;
      this.emit('snap', snap);
    });
    room.onMessage('events', (events: SimEvent[]) => this.emit('events', events));
    room.onMessage('summary', (summary: SummaryInfo) => {
      this.summary = summary;
      saveLevel(summary.unlocked);
      this.emit('summary', summary);
    });
    room.onLeave(() => {
      this.room = null;
      this.info = null;
      this.snapshot = null;
      this.emit('left');
    });
    // Pedimos el estado ahora que ya escuchamos (lo que llegó durante la unión se habría perdido).
    room.send('hello');
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.info = null;
    this.snapshot = null;
    this.summary = null;
    await room?.leave(true);
  }

  sendInput(msg: InputMessage): void {
    this.room?.send('input', msg);
  }

  interact(msg: InputMessage): void {
    this.room?.send('interact', msg);
  }

  claim(role: Role): void {
    this.room?.send('claim', role);
  }

  rename(name: string): void {
    this.room?.send('rename', name);
  }

  setModo(modo: number): void {
    this.room?.send('modo', modo);
  }

  start(): void {
    this.room?.send('start');
  }

  setNivel(nivel: number): void {
    this.room?.send('nivel', nivel);
  }

  /** Vuelve al vestíbulo (y en solitario, a la cocina) con el nivel indicado. */
  backToLobby(nivel?: number): void {
    this.room?.send('lobby', nivel);
  }
}

export const net = new Net();

/** Nombre guardado en este navegador (en la fase 3 vendrá de Discord). */
export function savedName(): string {
  try {
    const stored = localStorage.getItem('horaPunta.name');
    if (stored) return stored;
  } catch {
    // Almacenamiento bloqueado: usamos un nombre aleatorio.
  }
  return `Cocinero ${Math.floor(100 + Math.random() * 900)}`;
}

export function saveName(name: string): void {
  try {
    localStorage.setItem('horaPunta.name', name);
  } catch {
    // Sin almacenamiento: el nombre dura solo esta sesión.
  }
}

/** Nivel más alto desbloqueado en este navegador. */
export function savedLevel(): number {
  try {
    return Math.max(1, Number(localStorage.getItem('horaPunta.nivel')) || 1);
  } catch {
    return 1;
  }
}

function saveLevel(nivel: number): void {
  try {
    if (nivel > savedLevel()) localStorage.setItem('horaPunta.nivel', String(nivel));
  } catch {
    // Sin almacenamiento: el progreso dura solo esta sesión.
  }
}
