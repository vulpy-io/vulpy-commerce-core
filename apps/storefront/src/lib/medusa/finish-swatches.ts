// Core stub — Starter finish-swatch data excluded from the public Core tree.
// Neutral defaults: no swatches in Core.

export interface FinishSwatch {
  name: string;
  hex: string;
  label?: string;
}

export function getFinishSwatch(_name: string): FinishSwatch | null {
  return null;
}

export function hasFinishSwatch(_name: string): boolean {
  return false;
}

export function collectFinishValues(_variants: unknown): string[] {
  return [];
}
