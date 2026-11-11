import Phaser from 'phaser';
import type { Ingredient, Item } from '@hora-punta/shared';
import { itemKey, layerHeight, layerKey } from './sprites';

/** Firma corta para saber si hay que redibujar un objeto. */
export function itemSignature(item: Item | null): string {
  if (!item) return '';
  if (item.kind === 'food') return item.layers.join(',');
  if (item.kind === 'drink') return `drink:${item.flavor}`;
  if (item.kind === 'burnt') return `burnt:${item.what}`;
  return item.kind;
}

/** Pila de capas con la base en (0, 0) del contenedor. */
export function fillStack(container: Phaser.GameObjects.Container, layers: readonly Ingredient[]): number {
  let y = 0;
  layers.forEach((_, i) => {
    const key = layerKey(layers, i);
    container.add(container.scene.add.image(0, y, key).setOrigin(0.5, 1));
    y -= layerHeight(key) - 1; // se solapan 1 px para que la hamburguesa quede compacta
  });
  return -y;
}

export function fillItem(container: Phaser.GameObjects.Container, item: Item | null): void {
  container.removeAll(true);
  if (!item) return;
  if (item.kind === 'food') fillStack(container, item.layers);
  else container.add(container.scene.add.image(0, 0, itemKey(item)).setOrigin(0.5, 1));
}

/** Altura en píxeles de una receta dibujada con fillStack. */
export function stackPixelHeight(layers: readonly Ingredient[]): number {
  return layers.reduce((h, _, i) => h + layerHeight(layerKey(layers, i)) - 1, 1);
}
