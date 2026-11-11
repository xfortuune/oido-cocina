import Phaser from 'phaser';
import { audio } from '../audio';
import { txt } from '../theme';

const LABEL = { todo: 'Música y sonido', efectos: 'Solo efectos', nada: 'Silencio' } as const;

/** Botón de altavoz: todo → solo efectos → silencio. Al cambiar, enseña un momento qué ha elegido. */
export function addSoundToggle(scene: Phaser.Scene, x: number, y: number, scale: number, depth = 50): Phaser.GameObjects.Image {
  const icon = scene.add
    .image(x, y, `icon_sound_${audio.setting}`)
    .setScale(scale)
    .setDepth(depth)
    .setInteractive({ useHandCursor: true });
  let label: Phaser.GameObjects.Text | null = null;
  icon.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
    e?.stopPropagation();
    audio.unlock();
    const v = audio.cycleSetting();
    icon.setTexture(`icon_sound_${v}`);
    label?.destroy();
    const l = (label = txt(scene, x, y + 6 * scale, LABEL[v], 12, {
      color: '#fff4dc',
      backgroundColor: '#2b1d14cc',
      padding: { x: 4, y: 2 },
    })
      .setOrigin(x > scene.scale.width / 2 ? 1 : 0, 0)
      .setDepth(depth + 1));
    scene.time.delayedCall(1200, () => l.destroy());
  });
  return icon;
}
