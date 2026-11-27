// Eventos aleatorios a mitad del servicio: cambian las reglas unos segundos para que no todas las
// rondas se jueguen igual. Se avisan unos segundos antes. La lógica está en sim.ts.

export type IncidentKind = 'autobus' | 'averia' | 'apagon' | 'plancha' | 'inspeccion' | 'critico' | 'cumple';

export interface IncidentDef {
  kind: IncidentKind;
  name: string;
  /** Lo que sale en el cartel al empezar. */
  description: string;
  /** Segundos que dura (0: es un cliente especial, dura lo que tarde en irse). */
  duration: number;
}

export const INCIDENTS: Record<IncidentKind, IncidentDef> = {
  autobus: { kind: 'autobus', name: 'Autobús de turistas', description: 'Llegan clientes casi seguidos', duration: 20 },
  averia: { kind: 'averia', name: 'Freidora averiada', description: 'Pulsad acción delante 3 veces para arreglarla', duration: 30 },
  apagon: { kind: 'apagon', name: 'Apagón de bebidas', description: 'Las máquinas de bebida no funcionan', duration: 20 },
  plancha: { kind: 'plancha', name: 'Plancha a tope', description: 'La carne se hace antes… y se quema antes', duration: 20 },
  inspeccion: { kind: 'inspeccion', name: 'Inspección sanitaria', description: 'Los fallos cuentan el doble. Sin fallos, premio', duration: 25 },
  critico: { kind: 'critico', name: 'Crítico gastronómico', description: 'Paga el triple. ¡Servidlo perfecto!', duration: 0 },
  cumple: { kind: 'cumple', name: 'Cumpleaños', description: 'Un menú completo que paga el triple', duration: 0 },
};

export const INCIDENT_KINDS = Object.keys(INCIDENTS) as IncidentKind[];

/** Segundos de aviso antes de que empiece. */
export const INCIDENT_WARNING = 4;

/** Un evento en marcha. */
export interface ActiveIncident {
  kind: IncidentKind;
  /** Hasta cuándo dura (tiempo de la ronda). */
  until: number;
  /** Freidora averiada: casilla «x,y» y cuántas veces se ha pulsado para arreglarla. */
  station?: string;
  repairs?: number;
  /** Inspección: si de momento no ha habido fallos. */
  clean?: boolean;
}

/** Cuántos eventos por ronda según el nivel de dificultad (ninguno en los primeros niveles). */
export function incidentsForLevel(level: number): number {
  if (level < 4) return 0;
  if (level < 10) return 1;
  if (level < 16) return 2;
  return 3;
}
