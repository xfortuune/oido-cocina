import { Room, ServerError, type Client } from 'colyseus';
import {
  clampLevel,
  clampModo,
  KitchenSim,
  levelParams,
  levelStars,
  MAX_LEVEL,
  perkCount,
  PERK_EVERY,
  rollPerkOffer,
  cleanLook,
  EMOTES,
  getUpgrade,
  upgradePrice,
  type RunSummary,
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
import { addRanking, cleanGroup, getRanking } from './ranking.ts';

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
  /** Nivel de la partida en curso: al perder una ronda se vuelve al 1. */
  private nivel = 1;
  /** Habilidades de la partida por jugador (id de Discord, o de sesión en el navegador), por si sale y vuelve a entrar. */
  private runPerks = new Map<string, string[]>();
  private memberKeys = new Map<string, string>();
  /** Dinero y mejoras de la tienda de la partida en curso. */
  private dinero = 0;
  private mejoras: string[] = [];
  /** Totales de la partida en curso, para el resumen final. */
  private run = newRun();
  /** Grupo del ranking (lo trae el primero que entra). */
  private grupo = '';
  private members = new Map<string, LobbyMember>();
  private sim: KitchenSim | null = null;
  private summary: SummaryInfo | null = null;
  private lastInput = new Map<string, number>();
  private lastEmote = new Map<string, number>();

  onCreate(options: JoinOptions): void {
    this.sala = String(options.sala ?? 'local');
    this.modo = clampModo(options.modo);
    const turno = Number(options.turno);
    if (turno > 0) this.turnDuration = Math.max(10, Math.min(300, turno));
    if (options.nivel) this.nivel = clampLevel(options.nivel);
    this.grupo = cleanGroup(options.grupo);

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
    // Tras el resumen: habilidades (cada 2 niveles), tienda y sala. Si se ha acabado la partida, a la sala.
    this.onMessage('lobby', () => {
      if (this.phase !== 'summary') return;
      const { perkNext = false, passed = false, won = false } = this.summary ?? {};
      this.summary = null;
      if (perkNext) this.offerPerks();
      else if (passed && !won) this.openShop();
      else this.phase = 'lobby';
      this.broadcastRoom();
    });
    this.onMessage('perk', (client, id: string) => this.pickPerk(client.sessionId, String(id)));
    // Gestos rápidos, como mucho uno por segundo y medio por cocinero.
    this.onMessage('emote', (client, n: number) => {
      const emote = Math.round(Number(n));
      const now = Date.now();
      if (this.phase !== 'playing' || !(emote >= 0 && emote < EMOTES.length)) return;
      if (now - (this.lastEmote.get(client.sessionId) ?? 0) < 1500) return;
      this.lastEmote.set(client.sessionId, now);
      this.broadcast('emote', { id: client.sessionId, emote });
    });
    this.onMessage('buy', (_client, id: string) => this.buy(String(id)));
    this.onMessage('ready', (client) => {
      const m = this.members.get(client.sessionId);
      if (this.phase !== 'shop' || !m) return;
      m.ready = !m.ready;
      this.checkShopDone();
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
    const key = user?.id ?? client.sessionId;
    this.memberKeys.set(client.sessionId, key);
    const perks = this.runPerks.get(key) ?? [];
    this.runPerks.set(key, perks);
    const member: LobbyMember = {
      id: client.sessionId,
      name,
      color,
      roles: [],
      avatar: user?.avatar ?? null,
      perks,
      offer: null,
      ready: false,
      look: cleanLook(options.look, color),
    };
    this.members.set(client.sessionId, member);
    if (this.phase !== 'playing') this.assignRoles();

    // Quien entra a mitad de turno ayuda llevando cosas hasta el siguiente turno.
    this.sim?.addPlayer(member.id, member.name, member.color, member.roles, member.perks, member.look);
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
    this.memberKeys.delete(client.sessionId);
    if (this.phase === 'perks' || this.phase === 'shop') {
      this.checkPerksDone();
      this.checkShopDone();
      this.broadcastRoom();
      return;
    }
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

    const sim = new KitchenSim(levelParams(this.nivel, this.modo), Math.random, this.mejoras);
    sim.moveOnTick = false;
    sim.needsCaja = this.modo > 1;
    if (this.turnDuration) sim.turnDuration = this.turnDuration;
    for (const m of this.members.values()) sim.addPlayer(m.id, m.name, m.color, m.roles, m.perks, m.look);
    // Clientela fiel: más reputación al empezar.
    const fans = [...this.members.values()].reduce((n, m) => n + perkCount(m.perks, 'clientela'), 0);
    sim.reputation += 10 * fans + (this.mejoras.includes('resenas') ? 15 : 0);
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
    const passed = sim.endReason !== 'reputation' && sim.stats.served >= sim.goal;
    const won = passed && sim.level >= MAX_LEVEL;
    const perkNext = passed && !won && sim.level % PERK_EVERY === 0;
    // El resumen muestra las habilidades que se tenían en esta ronda.
    const summaryPlayers = [...this.members.values()].map((m) => {
      const stats = sim.playerStats[m.id] ?? { taken: 0, delivered: 0, cooked: 0, assembled: 0, mistakes: 0 };
      return { ...m, perks: [...m.perks], stats, score: mvpScore(stats) };
    });
    const best = [...summaryPlayers].sort((a, b) => b.score - a.score)[0];

    // Totales de la partida
    const run = this.run;
    run.served += sim.stats.served;
    run.perfect += sim.stats.perfect;
    run.earned += Math.max(0, sim.money);
    run.seconds += sim.time;
    if (passed) run.levelsPassed = sim.level;
    for (const p of summaryPlayers) {
      const key = this.memberKeys.get(p.id) ?? p.id;
      const prev = run.players.get(key);
      run.players.set(key, { ...p, score: (prev?.score ?? 0) + p.score });
    }
    const earnedRound = passed && !won ? Math.max(0, sim.money) : 0;
    let runSummary: RunSummary | null = null;
    if (passed && !won) {
      this.nivel = sim.level + 1;
      this.dinero += earnedRound;
    } else {
      runSummary = this.finishRun();
      this.resetRun();
    }
    this.summary = {
      stats: sim.stats,
      money: sim.money,
      reputation: Math.max(0, sim.reputation),
      endReason: sim.endReason ?? 'time',
      players: summaryPlayers,
      mvpId: best?.id ?? null,
      level: sim.level,
      goal: sim.goal,
      passed,
      stars: passed ? levelStars(sim.stats.served, sim.goal) : 0,
      won,
      perkNext,
      earnedRound,
      run: runSummary,
    };
    this.sim = null;
    this.phase = 'summary';
    this.broadcast('summary', this.summary);
    this.broadcastRoom();
  }

  /** Resumen de la partida entera y entrada en el ranking del grupo. */
  private finishRun(): RunSummary {
    const run = this.run;
    const players = [...run.players.values()];
    const mvp = [...players].sort((a, b) => b.score - a.score)[0];
    const position =
      run.levelsPassed > 0
        ? addRanking(this.grupo, {
            names: players.map((p) => p.name),
            level: run.levelsPassed,
            served: run.served,
            players: this.modo,
            date: new Date().toISOString(),
          })
        : null;
    return {
      levelsPassed: run.levelsPassed,
      served: run.served,
      earned: run.earned,
      perfect: run.perfect,
      seconds: Math.round(run.seconds),
      players,
      mvpId: players.length > 1 ? (mvp?.id ?? null) : null,
      mejoras: [...this.mejoras],
      ranking: getRanking(this.grupo).slice(0, 5),
      position,
    };
  }

  /** Partida perdida (o ganada): vuelta al nivel 1 sin habilidades, dinero ni mejoras. */
  private resetRun(): void {
    this.run = newRun();
    this.dinero = 0;
    this.mejoras = [];
    this.nivel = 1;
    this.runPerks.clear();
    for (const [id, m] of this.members) {
      m.perks = [];
      this.runPerks.set(this.memberKeys.get(id) ?? id, m.perks);
    }
  }

  /** Cada cocinero recibe tres habilidades para elegir una. */
  private offerPerks(): void {
    this.phase = 'perks';
    for (const m of this.members.values()) {
      const offer = rollPerkOffer(m.perks, m.roles, this.modo === 1);
      m.offer = offer.length ? offer : null;
    }
    this.checkPerksDone();
  }

  private pickPerk(id: string, perk: string): void {
    const m = this.members.get(id);
    if (this.phase !== 'perks' || !m?.offer?.includes(perk)) return;
    // Se modifica la misma lista que guarda runPerks.
    m.perks.push(perk);
    m.offer = null;
    this.checkPerksDone();
    this.broadcastRoom();
  }

  /** Cuando todos han elegido, a la tienda. */
  private checkPerksDone(): void {
    if (this.phase !== 'perks') return;
    if ([...this.members.values()].every((m) => !m.offer)) this.openShop();
  }

  private openShop(): void {
    this.phase = 'shop';
    for (const m of this.members.values()) m.ready = false;
  }

  private buy(id: string): void {
    const u = getUpgrade(id);
    if (this.phase !== 'shop' || !u || this.mejoras.includes(u.id)) return;
    const price = upgradePrice(u, this.modo);
    if (this.dinero < price) return;
    this.dinero -= price;
    this.mejoras.push(u.id);
    this.broadcast('bought', u.id);
    this.broadcastRoom();
  }

  /** Cuando todos están listos, a la sala (en solitario, a la cocina directamente). */
  private checkShopDone(): void {
    if (this.phase !== 'shop') return;
    if ([...this.members.values()].every((m) => m.ready)) this.phase = 'lobby';
  }

  private roomInfo(): RoomInfo {
    return {
      phase: this.phase,
      sala: this.sala,
      modo: this.modo,
      members: [...this.members.values()],
      nivel: this.nivel,
      dinero: this.dinero,
      mejoras: this.mejoras,
    };
  }

  private broadcastRoom(): void {
    this.broadcast('room', this.roomInfo());
  }
}

function newRun() {
  return {
    levelsPassed: 0,
    served: 0,
    perfect: 0,
    earned: 0,
    seconds: 0,
    /** Por jugador (clave de Discord o sesión): sus datos y la suma de sus puntuaciones. */
    players: new Map<string, LobbyMember & { score: number }>(),
  };
}
