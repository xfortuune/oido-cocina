// Datos de la carta de "Mordiscos Mandarina", la hamburguesería (inventada) de ¡Oído, Cocina!.
// Este módulo es puro TypeScript: lo usarán tanto el cliente como el servidor.

export type Ingredient = 'pan' | 'carne' | 'queso' | 'lechuga' | 'tomate' | 'bacon';

export const INGREDIENT_NAMES: Record<Ingredient, string> = {
  pan: 'Pan',
  carne: 'Carne',
  queso: 'Queso',
  lechuga: 'Lechuga',
  tomate: 'Tomate',
  bacon: 'Bacon',
};

export interface Recipe {
  id: string;
  name: string;
  /** Capas de abajo a arriba. El primer y el último "pan" son la base y la tapa. */
  layers: Ingredient[];
  /** Precio base en monedas. */
  price: number;
}

// Hamburguesas cortas: la dificultad está en coordinar plancha, freidora y bebidas, no en apilar.
export const RECIPES: Recipe[] = [
  { id: 'chispa', name: 'La Chispa', layers: ['pan', 'carne', 'queso', 'pan'], price: 6 },
  { id: 'huertana', name: 'La Huertana', layers: ['pan', 'carne', 'lechuga', 'pan'], price: 6 },
  { id: 'jardin', name: 'El Jardín', layers: ['pan', 'carne', 'lechuga', 'tomate', 'pan'], price: 8 },
  { id: 'ahumada', name: 'La Ahumada', layers: ['pan', 'carne', 'bacon', 'queso', 'pan'], price: 9 },
  { id: 'doble', name: 'Doble Trueno', layers: ['pan', 'carne', 'carne', 'queso', 'pan'], price: 9 },
  { id: 'monstruo', name: 'El Monstruo', layers: ['pan', 'carne', 'bacon', 'queso', 'carne', 'pan'], price: 12 },
];

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe {
  const r = RECIPE_BY_ID.get(id);
  if (!r) throw new Error(`Receta desconocida: ${id}`);
  return r;
}
