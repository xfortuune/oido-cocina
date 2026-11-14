import Phaser from 'phaser';
// Tiny5: pixel art, pero legible en tamaño pequeño (el 5 no se confunde con la S).
import '@fontsource/tiny5/400.css';
import { audio } from './audio';
import { net } from './net';
import { startPresence } from './presence';
import { LookScene } from './scenes/LookScene';
import { CampaignScene } from './scenes/CampaignScene';
import { HudScene } from './scenes/HudScene';
import { KitchenScene } from './scenes/KitchenScene';
import { LobbyScene } from './scenes/LobbyScene';
import { MenuScene } from './scenes/MenuScene';
import { PerkScene } from './scenes/PerkScene';
import { RankingScene } from './scenes/RankingScene';
import { ShopScene } from './scenes/ShopScene';
import { SummaryScene } from './scenes/SummaryScene';

async function start(): Promise<void> {
  // Phaser dibuja el texto en un canvas: la fuente tiene que estar cargada antes.
  await document.fonts.load('16px "Tiny5"').catch(() => {});

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    backgroundColor: '#3a2a1e',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      // En un iframe oculto el tamaño inicial puede ser 0, y WebGL falla con un framebuffer vacío.
      width: Math.max(window.innerWidth, 320),
      height: Math.max(window.innerHeight, 320),
    },
    input: { activePointers: 3 },
    // Los avatares vienen de cdn.discordapp.com: hace falta CORS para usarlos como textura.
    loader: { crossOrigin: 'anonymous' },
    // El orden importa: el HUD se dibuja encima de la cocina.
    scene: [MenuScene, LobbyScene, KitchenScene, HudScene, SummaryScene, PerkScene, ShopScene, RankingScene, LookScene, CampaignScene],
  });
  startPresence();
  // El navegador solo deja sonar tras el primer toque o tecla.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  // Solo en desarrollo: acceso desde la consola para depurar.
  if (import.meta.env.DEV) Object.assign(window, { horaPunta: game, horaPuntaNet: net });
}

void start();
