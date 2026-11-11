// Integración con Discord (Embedded App SDK). Fuera de Discord el juego funciona como antes,
// en el navegador, con un nombre local y la sala de ?sala=.
import { DiscordSDK } from '@discord/embedded-app-sdk';
import type { JoinOptions } from '@hora-punta/shared';

export interface Identity {
  /** Opciones para unirse a la sala del servidor. */
  join: JoinOptions;
  inDiscord: boolean;
}

/** Discord abre la Actividad con estos parámetros en la URL. */
export function isInDiscord(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('frame_id') && params.has('instance_id');
}

let identity: Promise<Identity> | null = null;

/** Se hace una sola vez por carga de página (el login de Discord no se repite al volver a la sala). */
export function getIdentity(fallbackName: () => string): Promise<Identity> {
  identity ??= isInDiscord() ? discordIdentity() : Promise.resolve(browserIdentity(fallbackName()));
  // Si falla, que el botón «Reintentar» pueda volver a intentarlo.
  identity.catch(() => (identity = null));
  return identity;
}

function browserIdentity(name: string): Identity {
  const params = new URLSearchParams(location.search);
  const turno = Number(params.get('turno'));
  return {
    inDiscord: false,
    join: { sala: params.get('sala') || 'local', name, ...(turno > 0 ? { turno } : {}) },
  };
}

async function discordIdentity(): Promise<Identity> {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;
  if (!clientId) throw new Error('Falta VITE_DISCORD_CLIENT_ID en el .env');

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  // 1. Discord pide permiso al jugador (solo la primera vez) y nos da un código.
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'applications.commands'],
  });

  // 2. Nuestro servidor cambia el código por un token (el secreto no sale del servidor).
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`El servidor no pudo validar con Discord (${res.status})`);
  const { access_token } = (await res.json()) as { access_token: string };

  // 3. Con el token, el SDK nos dice quién eres.
  const auth = await sdk.commands.authenticate({ access_token });
  const name = (auth.user.global_name || auth.user.username).slice(0, 20);

  return {
    inDiscord: true,
    // Una sala por instancia de la Actividad: todos los del canal de voz en la misma partida.
    // El servidor vuelve a comprobar el token y saca de ahí tu nombre y avatar.
    join: { sala: sdk.instanceId, name, accessToken: access_token },
  };
}
