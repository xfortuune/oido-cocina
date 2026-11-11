import Phaser from 'phaser';
import type { LobbyMember } from '@hora-punta/shared';

const failed = new Set<string>();

export function avatarKey(member: Pick<LobbyMember, 'id'>): string {
  return `avatar_${member.id}`;
}

export function hasAvatar(scene: Phaser.Scene, member: Pick<LobbyMember, 'id'>): boolean {
  return scene.textures.exists(avatarKey(member));
}

/**
 * Carga los avatares de Discord que falten y llama a `onLoaded` cuando haya alguno nuevo.
 * Las texturas son globales: una vez cargado, sirve en todas las escenas.
 */
export function loadAvatars(scene: Phaser.Scene, members: LobbyMember[], onLoaded: () => void): void {
  const missing = members.filter((m) => m.avatar && !failed.has(m.avatar) && !hasAvatar(scene, m));
  if (missing.length === 0) return;
  for (const m of missing) scene.load.image(avatarKey(m), m.avatar!);
  scene.load.on('loaderror', (file: Phaser.Loader.File) => failed.add(String(file.url)));
  scene.load.once('complete', () => {
    // Las fotos se ven mejor suavizadas que con el filtro pixel del resto del juego.
    for (const m of missing) {
      if (hasAvatar(scene, m)) scene.textures.get(avatarKey(m)).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (scene.sys.isActive()) onLoaded();
  });
  scene.load.start();
}

/** Avatar cuadrado con borde, centrado en (x, y). Devuelve null si no hay avatar cargado. */
export function addAvatar(
  scene: Phaser.Scene,
  member: Pick<LobbyMember, 'id'>,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Container | null {
  if (!hasAvatar(scene, member)) return null;
  const border = scene.add.rectangle(0, 0, size + 4, size + 4, 0x2b1d14);
  const img = scene.add.image(0, 0, avatarKey(member)).setDisplaySize(size, size);
  return scene.add.container(Math.round(x), Math.round(y), [border, img]);
}
