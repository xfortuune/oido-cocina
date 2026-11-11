import { Room, ServerError, type Client } from 'colyseus';
import {
  clampLevel,
  clampModo,
  KitchenSim,
  levelParams,
  levelStars,
  MAX_LEVEL,
  ROLE_PRESETS,
  MAX_PLAYERS,
  mvpScore,
  ROLES,
  TICK_MS,
  type InputMessage,
  type JoinOptions,
  type LobbyMember,
  type Role,
  type RoomInfo,
  type RoomPhase,
  type SummaryInfo,
} from '@hora-punta/shared';
import { discordConfig, fetchUser, type DiscordUser } from './discord.ts';

const GUEST = { guest: true } as const;

function discordUser(client: Client): DiscordUser | null {
  const auth = client.auth as DiscordUser | typeof GUEST | undefined;
  return auth && 'id' in auth ? auth : null;
}

/**
 * Una cocina compartida. El servidor es la autoridad: genera los pedidos, lleva los tiempos
 * de plancha, freidora y paciencia, decide qué pasa al pulsar el botón de acción y puntúa.
 * Los clientes solo mandan la posición de su cocinero (validada) y cuándo pulsan.
 */
export class KitchenRoom extends Room {
  maxClients = MAX_PLAYERS;

  private phase: RoomPhase = 'lobby';
  private sala = '';
  /** Jugadores que se esperan para empezar (1-4). */
  private modo = 2;
  /** Duración forzada de la ronda (solo para pruebas). */
  private turnDuration = 0;
  private nivel = 1;
  private desbloqueado = 1;
  private members = new Map<string, LobbyMember>();
  private sim: KitchenSim | null = null;
  private summary: SummaryInfo | null = null;
  private lastInput = new Map<string, number>();

  onCreate(options: JoinOptions): void {
    this.sala = String(options.sala ?? 'local');
    this.modo = clampModo(options.modo);
    const turno = Number(options.turno);
    if (turno > 0) this.turnDuration = Math.max(10, Math.min(300, turno));

    this.onMessage('input', (client, msg: InputMessage) => this.applyInput(client.sessionId, msg));
    this.onMessage('interact', (client, msg: InputMessage) => {
      if (this.phase !== 'playing' || !this.sim) return;
      this.applyInput(client.sessionId, msg);
      this.sim.interact(client.sessionId);
    });
    this.onMessage('hello', (client) => {
      client.send('room', this.roomInfo());
      if (this.summary) client.send('summary', this.summary);
    });
    this.onMessage('rename', (client, name: string) => {
      // En Discord el nombre es el de tu cuenta.
      if (discordUser(client)) return;
      const member = this.members.get(client.sessionId);
      const clean = String(name ?? '').trim().slice(0, 20);
      if (!member || !clean) return;
      member.name = clean;
      const p = this.sim?.players.get(client.sessionId);
      if (p) p.name = clean;
      this.broadcastRoom();
    });
    this.onMessage('claim', (client, role: Role) => this.claim(client.sessionId, role));
    this.onMessage('modo', (_client, n: number) => {
      const modo = clampModo(n);
      if (this.phase === 'playing' || this.modo === 1 || modo < 2) return;
      this.modo = modo;
      this.assignRoles();
      this.broadcastRoom();
    });
    this.onMessage('start', () => this.startTurn());
    this.onMessage('nivel', (_client, n: number) => {
      if (this.phase === 'playing') return;
      this.nivel = clampLevel(n, this.desbloqueado);
      this.broadcastRoom();
    });
    this.onMessage('lobby', (_client, n?: number) => {
      if (this.phase !== 'summary') return;
      if (n !== undefined && n !== null) this.nivel = clampLevel(n, this.desbloqueado);
      this.phase = 'lobby';
      this.summary = null;
      this.broadcastRoom();
    });

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
  }

  /**
   * Desde Discord se entra con un token que verificamos con la API de Discord.
   * Sin token (modo navegador) se entra como invitado, salvo con REQUIRE_DISCORD=1.
   */
  async onAuth(_client: Client, options: JoinOptions): Promise<DiscordUser | typeof GUEST> {
    if (options?.accessToken) {
      try {
        return await fetchUser(options.accessToken);
      } catch {
        throw new ServerError(401, 'No se pudo verificar tu cuenta de Discord');
      }
    }
    if (discordConfig().requireDiscord) throw new ServerError(401, 'Abre ¡Oído, Cocina! desde Discord');
    // Colyseus trata un valor vacío como "no autorizado": a los invitados les damos un marcador.
    return GUEST;
  }

  onJoin(client: Client, options: JoinOptions): void {
    const used = new Set([...this.members.values()].map((m) => m.color));
    const color = [0, 1, 2, 3].find((c) => !used.has(c)) ?? 0;
    const user = discordUser(client);
    const name = user?.name ?? (String(options.name ?? '').trim().slice(0, 20) || `Cocinero ${color + 1}`);
    const member: LobbyMember = { id: client.sessionId, name, color, roles: [], avatar: user?.avatar ?? null };
    this.members.set(client.sessionId, member);
    // La sala puede jugar hasta el nivel más alto que tenga desbloqueado cualquiera de los que entran.
    const theirs = clampLevel(options.nivel);
    if (theirs > this.desbloqueado) {
      this.desbloqueado = theirs;
      if (this.phase === 'lobby' && this.members.size === 1) this.nivel = theirs;
    }
    if (this.phase !== 'playing') this.assignRoles();

    // Quien entra a mitad de turno ayuda llevando cosas hasta el siguiente turno.
    this.sim?.addPlayer(member.id, member.name, member.color, member.roles);
    this.broadcastRoom();
    if (this.summary) client.send('summary', this.summary);
  }

  /** En el móvil la conexión se corta a menudo: guardamos el sitio unos segundos. */
  async onDrop(client: Client): Promise<void> {
    await this.allowReconnection(client, 20);
  }

  onLeave(client: Client): void {
    const leaving = this.members.get(client.sessionId);
    this.members.delete(client.sessionId);
    this.sim?.removePlayer(client.sessionId);
    this.lastInput.delete(client.sessionId);
    if (this.phase !== 'playing') {
      this.assignRoles();
      this.broadcastRoom();
      return;
    }
    // A mitad de turno, sus puestos pasan a quien tenga menos, para que la cocina no se quede sin plancha.
    for (const role of leaving?.roles ?? []) {
      const heir = [...this.members.values()].sort((a, b) => a.roles.length - b.roles.length)[0];
      if (!heir) break;
      heir.roles.push(role);
      const p = this.sim?.players.get(heir.id);
      if (p) p.roles = [...heir.roles];
    }
    this.broadcastRoom();
  }

  /**
   * Reparte los puestos según el modo y el orden de llegada. Mientras falte gente,
   * los puestos libres los lleva el primero, para que siempre estén todos cubiertos.
   */
  private assignRoles(): void {
    const members = [...this.members.values()];
    if (members.length === 0) return;
    for (const m of members) m.roles = [];
    ROLE_PRESETS[this.modo].forEach((group, i) => {
      const owner = members[i] ?? members[0];
      owner.roles.push(...group);
    });
    for (const m of members) m.roles.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
  }

  private claim(id: string, role: Role): void {
    if (this.phase === 'playing' || !ROLES.includes(role)) return;
    const me = this.members.get(id);
    if (!me || me.roles.includes(role)) return;
    for (const m of this.members.values()) m.roles = m.roles.filter((r) => r !== role);
    me.roles.push(role);
    me.roles.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));
    this.broadcastRoom();
  }

  private startTurn(): void {
    if (this.phase === 'playing') return;
    const covered = new Set([...this.members.values()].flatMap((m) => m.roles));
    if (!ROLES.every((r) => covered.has(r)) || this.members.size < this.modo) return;

    const sim = new KitchenSim(levelParams(this.nivel, this.modo));
    sim.moveOnTick = false;
    sim.needsCaja = this.modo > 1;
    if (this.turnDuration) sim.turnDuration = this.turnDuration;
    for (const m of this.members.values()) sim.addPlayer(m.id, m.name, m.color, m.roles);
    this.sim = sim;
    this.summary = null;
    this.phase = 'playing';
    this.broadcastRoom();
  }

  private applyInput(id: string, msg: InputMessage): void {
    if (!this.sim || !msg) return;
    const now = Date.now();
    const dt = (now - (this.lastInput.get(id) ?? now - TICK_MS)) / 1000;
    this.lastInput.set(id, now);
    this.sim.setPose(id, Number(msg.x), Number(msg.y), Number(msg.fx), Number(msg.fy), !!msg.moving, dt);
  }

  private tick(deltaMs: number): void {
    const sim = this.sim;
    if (this.phase !== 'playing' || !sim) return;
    sim.tick(Math.min(deltaMs, 200) / 1000);
    const events = sim.drainEvents();
    if (events.length) this.broadcast('events', events);
    this.broadcast('snap', sim.snapshot());
    if (sim.ended) this.finishTurn(sim);
  }

  private finishTurn(sim: KitchenSim): void {
    const players = [...this.members.values()].map((m) => {
      const stats = sim.playerStats[m.id] ?? { taken: 0, delivered: 0, cooked: 0, assembled: 0, mistakes: 0 };
      return { ...m, stats, score: mvpScore(stats) };
    });
    const best = [...players].sort((a, b) => b.score - a.score)[0];
    const passed = sim.endReason !== 'reputation' && sim.stats.served >= sim.goal;
    if (passed && sim.level === this.desbloqueado && this.desbloqueado < MAX_LEVEL) this.desbloqueado++;
    // Si se pasa, por defecto se juega el siguiente; si no, se repite.
    if (passed) this.nivel = Math.min(this.desbloqueado, sim.level + 1);
    this.summary = {
      stats: sim.stats,
      money: sim.money,
      reputation: Math.max(0, sim.reputation),
      endReason: sim.endReason ?? 'time',
      players,
      mvpId: best?.id ?? null,
      level: sim.level,
      goal: sim.goal,
      passed,
      stars: passed ? levelStars(sim.stats.served, sim.goal) : 0,
      unlocked: this.desbloqueado,
    };
    this.sim = null;
    this.phase = 'summary';
    this.broadcast('summary', this.summary);
    this.broadcastRoom();
  }

  private roomInfo(): RoomInfo {
    return {
      phase: this.phase,
      sala: this.sala,
      modo: this.modo,
      members: [...this.members.values()],
      nivel: this.nivel,
      desbloqueado: this.desbloqueado,
    };
  }

  private broadcastRoom(): void {
    this.broadcast('room', this.roomInfo());
  }
}
