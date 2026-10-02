import { describe, expect, it } from 'vitest';
import { criarFantasma } from '../src/entidades/fantasma';
import { CORPO_REAL, deVerdade } from '../src/entidades/efeitos';
import type { Personagem } from '../src/entidades/personagem';

// Só o que o fantasma lê e escreve: o resto do personagem não importa aqui.
function corpo(): Personagem {
  return { x: 100, y: 200, vy: 0, noChao: true, vida: 2500, levado: 0, empurrao: 0, preso: 0 } as unknown as Personagem;
}

describe('fantasma do seu personagem (os golpes do outro conferem onde ele o via)', () => {
  it('a posição vem de alguns milissegundos atrás; o resto é o corpo de agora', () => {
    const real = corpo();
    const f = criarFantasma(real);
    f.ajustar(0.14); // 140 ms de viagem: 0,2 s na horizontal, 0,31 s na vertical
    expect(f.atraso().x).toBeCloseTo(0.2);
    expect(f.atraso().y).toBeCloseTo(0.31);
    // Andando 100 px/s para a direita, um passo a cada 50 ms, e pulando em t = 0,9 s.
    for (let i = 0; i <= 20; i++) {
      real.x = 100 + i * 5;
      if (i === 18) Object.assign(real, { noChao: false, y: 190, vy: -200 });
      f.gravar(i * 0.05);
    }
    // Agora (t = 1 s): x = 200, no ar. O fantasma está em t = 0,8 s (x = 180) e, na vertical, em
    // t = 0,69 s (ainda no chão).
    expect(real.x).toBe(200);
    expect(f.corpo.x).toBeCloseTo(180);
    expect(f.corpo.noChao).toBe(true);
    expect(f.corpo.y).toBe(200);
    expect(f.corpo.vida).toBe(2500);
  });

  it('o que o golpe faz com o fantasma acontece com o corpo de verdade', () => {
    const real = corpo();
    const f = criarFantasma(real);
    f.ajustar(0.05);
    f.gravar(0);
    f.corpo.vida -= 30;
    f.corpo.preso = 2;
    f.corpo.vy = -150;
    expect(real.vida).toBe(2470);
    expect(real.preso).toBe(2);
    expect(real.vy).toBe(-150);
    expect(deVerdade(f.corpo)).toBe(real);
    expect((f.corpo as unknown as Record<symbol, unknown>)[CORPO_REAL]).toBe(real);
    expect(deVerdade(real)).toBe(real);
  });

  it('carregado pelas águias, a posição é a de agora', () => {
    const real = corpo();
    const f = criarFantasma(real);
    f.ajustar(0.1);
    for (let i = 0; i <= 10; i++) {
      real.x = 100 + i * 10;
      f.gravar(i * 0.05);
    }
    real.levado = 0.5;
    expect(f.corpo.x).toBe(real.x);
  });

  it('com a rede muito lenta, o atraso tem teto: quem desvia ainda escapa', () => {
    const f = criarFantasma(corpo());
    f.ajustar(2);
    expect(f.atraso()).toEqual({ x: 0.3, y: 0.4 });
  });
});
