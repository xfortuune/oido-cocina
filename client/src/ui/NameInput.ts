import Phaser from 'phaser';
import { FONT, INK } from '../theme';

/**
 * Campo de texto con el estilo del juego, colocado encima del lienzo de Phaser.
 * Hace falta un <input> de verdad para que en el móvil salga el teclado, pero se dibuja
 * dentro de un panel del juego y con su fuente, no como un formulario del navegador.
 * Sobrevive a que la escena se redibuje: solo hay que volver a llamar a place().
 */
export class NameInput {
  readonly el: HTMLInputElement;

  constructor(initial: string, onEnter: () => void, onEscape: () => void, maxLength = 20) {
    const el = (this.el = document.createElement('input'));
    el.type = 'text';
    el.value = initial;
    el.maxLength = maxLength;
    el.autocomplete = 'off';
    el.spellcheck = false;
    el.setAttribute('aria-label', 'Tu nombre');
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '10',
      boxSizing: 'border-box',
      fontFamily: FONT,
      color: INK,
      background: '#fff4dc',
      border: `4px solid ${INK}`,
      borderRadius: '0',
      boxShadow: 'inset 0 -4px 0 #e8d4ae',
      outline: 'none',
      textAlign: 'center',
      padding: '0 8px',
    } satisfies Partial<CSSStyleDeclaration>);
    // Que las teclas no lleguen al juego (WASD, 1-4, Escape…).
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') onEnter();
      else if (e.key === 'Escape') onEscape();
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(el);
    // Seleccionado para poder escribir encima directamente.
    setTimeout(() => {
      el.focus();
      el.select();
    }, 50);
  }

  get value(): string {
    return this.el.value.trim();
  }

  /** Coloca el campo sobre el rectángulo (x, y, w, h) del juego. */
  place(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fontSize: number): void {
    const rect = scene.game.canvas.getBoundingClientRect();
    const sx = rect.width / scene.scale.width;
    const sy = rect.height / scene.scale.height;
    Object.assign(this.el.style, {
      left: `${rect.left + x * sx}px`,
      top: `${rect.top + y * sy}px`,
      width: `${w * sx}px`,
      height: `${h * sy}px`,
      fontSize: `${fontSize * sy}px`,
    });
  }

  destroy(): void {
    this.el.remove();
  }
}
