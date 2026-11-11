// Conexión con el servidor Colyseus. Una sola por pestaña, compartida por todas las escenas.
import Phaser from 'phaser';
import { Client, type Room } from '@colyseus/sdk';
import {
  cleanLook,
  DEFAULT_LOOK,
  ROOM_NAME,
  type ChefLook,
  type EmoteMessage,
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
    const room = await client.joinOrCreate(ROOM_NAME, { ...options, look: options.look ?? savedLook() });
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
    room.onMessage('bought', (id: string) => this.emit('bought', id));
    room.onMessage('emote', (msg: EmoteMessage) => this.emit('emote', msg));
    room.onMessage('summary', (summary: SummaryInfo) => {
      this.summary = summary;
      saveRecord(summary.passed ? summary.level : summary.level - 1);
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

  /** Del resumen al vestíbulo (o a elegir habilidad, si toca). En solitario se sigue jugando directamente. */
  backToLobby(): void {
    this.room?.send('lobby');
  }

  pickPerk(id: string): void {
    this.room?.send('perk', id);
  }

  buy(id: string): void {
    this.room?.send('buy', id);
  }

  toggleReady(): void {
    this.room?.send('ready');
  }

  /** Pausa o reanuda la ronda (para todo el grupo). */
  pause(on: boolean): void {
    this.room?.send('pause', on);
  }

  get paused(): boolean {
    return !!this.info?.paused && this.info.phase === 'playing';
  }

  emote(n: number): void {
    this.room?.send('emote', n);
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

/** Récord: el nivel más alto superado en este navegador. */
export function savedRecord(): number {
  try {
    return Math.max(0, Number(localStorage.getItem('horaPunta.record')) || 0);
  } catch {
    return 0;
  }
}

function saveRecord(nivel: number): void {
  try {
    if (nivel > savedRecord()) localStorage.setItem('horaPunta.record', String(nivel));
  } catch {
    // Sin almacenamiento: el progreso dura solo esta sesión.
  }
}

/** Delantal y accesorio elegidos en este navegador. */
export function savedLook(): ChefLook {
  try {
    const raw = localStorage.getItem('horaPunta.look');
    if (raw) return cleanLook(JSON.parse(raw));
  } catch {
    // sin almacenamiento o dato corrupto
  }
  return { ...DEFAULT_LOOK };
}

export function saveLook(look: ChefLook): void {
  try {
    localStorage.setItem('horaPunta.look', JSON.stringify(look));
  } catch {
    // sin almacenamiento
  }
}
