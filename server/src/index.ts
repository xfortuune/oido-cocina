import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, WebSocketTransport } from 'colyseus';
import { ROOM_NAME } from '@hora-punta/shared';
import { discordConfig, exchangeCode } from './discord.ts';
import { KitchenRoom } from './KitchenRoom.ts';
import { getRanking } from './ranking.ts';

// Un único .env en la raíz del proyecto, compartido con el cliente (ver .env.example).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // Sin .env: se usan las variables del entorno (por ejemplo, las del hosting).
}

// En desarrollo, SERVER_PORT y no PORT: algunas herramientas (y Vite) usan PORT para el cliente.
// En producción (npm start) también vale PORT, que es lo que dan la mayoría de hostings.
const production = process.argv.includes('--produccion');
const port = Number(process.env.SERVER_PORT ?? (production ? process.env.PORT : undefined) ?? 2567);
const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.json({ ok: true });
    });

    // Paso del login de la Actividad: el cliente manda el código de authorize() y recibe el token.
    app.post('/api/token', async (req, res) => {
      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      if (!code) {
        res.status(400).json({ error: 'Falta el código' });
        return;
      }
      try {
        res.json({ access_token: await exchangeCode(code) });
      } catch (err) {
        console.error('[discord]', err instanceof Error ? err.message : err);
        // 400 y no 5xx: un túnel o proxy (Cloudflare) cambiaría un 5xx por su propia página de error.
        res.status(400).json({ error: 'No se pudo validar con Discord' });
      }
    });

    // Ranking de récords de un grupo (servidor o canal de Discord).
    app.get('/api/ranking', (req, res) => {
      res.json(getRanking(String(req.query.grupo ?? '')));
    });

    // En producción el mismo servidor sirve el juego compilado (npm run build).
    if (existsSync(clientDist)) app.use(express.static(clientDist));
  },
});

// Una sala por "sala": en Discord, una por instancia de la Actividad (todos los del canal de voz juntos).
server.define(ROOM_NAME, KitchenRoom).filterBy(['sala']);

await server.listen(port);
const { clientId, clientSecret, requireDiscord } = discordConfig();
console.log(`🍔 Servidor de ¡Oído, Cocina! escuchando en http://localhost:${port}`);
if (!clientId || !clientSecret) console.log('   (sin VITE_DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET: solo modo navegador)');
if (requireDiscord) console.log('   REQUIRE_DISCORD=1: solo se puede entrar desde Discord');
