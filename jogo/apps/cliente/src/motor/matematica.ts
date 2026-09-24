import type { Intervalo } from '@terna/compartilhado';

export function sortear([min, max]: Intervalo): number {
  return min + Math.random() * (max - min);
}

export function suavizar(de: number, ate: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - de) / (ate - de)));
  return t * t * (3 - 2 * t);
}
