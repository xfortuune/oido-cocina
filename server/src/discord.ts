// Autenticación con Discord: el cliente secreto solo vive aquí, nunca en el navegador.

const API = 'https://discord.com/api/v10';

export function discordConfig() {
  return {
    clientId: process.env.VITE_DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    /** Si es "1", solo se puede entrar desde Discord (recomendado al desplegar). */
    requireDiscord: process.env.REQUIRE_DISCORD === '1',
  };
}

/** Cambia el código que da `authorize()` en el cliente por un access token. */
export async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret } = discordConfig();
  if (!clientId || !clientSecret) throw new Error('Faltan VITE_DISCORD_CLIENT_ID o DISCORD_CLIENT_SECRET en el .env');
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });
  if (!res.ok) throw new Error(`Discord rechazó el código (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Discord no devolvió access_token');
  return data.access_token;
}

export interface DiscordUser {
  id: string;
  name: string;
  avatar: string | null;
}

/** Comprueba el token preguntando a Discord quién es: así nadie puede hacerse pasar por otro. */
export async function fetchUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Token de Discord no válido (${res.status})`);
  const u = (await res.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };
  return {
    id: u.id,
    name: (u.global_name || u.username).slice(0, 20),
    // Las imágenes de cdn.discordapp.com/avatars/ están permitidas dentro de las Actividades sin URL mapping.
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
  };
}
