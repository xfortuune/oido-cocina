import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // El .env está en la raíz del proyecto, compartido con el servidor.
  const env = loadEnv(mode, '..', '');
  const tunnel = env.DISCORD_TUNNEL === '1';

  return {
    envDir: '..',
    // Phaser ocupa ~1,5 MB minificado; no merece la pena trocearlo.
    build: { chunkSizeWarningLimit: 2000 },
    server: {
      port: 5173,
      // Accesible desde el móvil en la misma red Wi-Fi (http://IP-del-PC:5173)
      host: true,
      // Dentro de Discord la página llega por el túnel de cloudflared (*.trycloudflare.com).
      allowedHosts: true,
      // A través del túnel la recarga en caliente va por HTTPS (443), no por el puerto local.
      hmr: tunnel ? { clientPort: 443 } : undefined,
      // El cliente habla con el servidor en el mismo origen, como hará dentro de Discord.
      proxy: {
        '/api': 'http://localhost:2567',
        '/colyseus': {
          target: 'http://localhost:2567',
          ws: true,
          rewrite: (path) => path.replace(/^\/colyseus/, ''),
        },
      },
    },
  };
});
