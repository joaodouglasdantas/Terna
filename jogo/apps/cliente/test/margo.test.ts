import { describe, expect, it, vi } from 'vitest';

// Sem navegador aqui: os módulos do jogo desenham os sprites ao carregar, então entra um canvas de
// mentira (qualquer chamada nele não faz nada). O `vi.hoisted` roda antes dos imports abaixo.
vi.hoisted(() => {
  const nulo: unknown = new Proxy(function () {}, {
    get: (_, chave) => {
      if (chave === 'data') return new Uint8ClampedArray(1 << 16);
      if (chave === 'width' || chave === 'height') return 1;
      if (chave === Symbol.toPrimitive) return () => 1;
      return nulo;
    },
    apply: () => nulo,
    set: () => true,
  });
  Object.assign(globalThis, { document: { createElement: () => nulo } });
});

import { HEROIS_DO_TUTORIAL, HEROIS_LIBERADOS, ROLO } from '@terna/compartilhado';
import { tentarAtacar } from '../src/entidades/armas';
import {
  armaPronta,
  bloqueioDaArma,
  criarPersonagem,
  passarSelecao,
  podePegarArma,
  precisaLargarArma,
  usaPoderes,
} from '../src/entidades/personagem';

describe('a Margo: sem soco e sem arma do chão, a arma dela é o rolo de massa', () => {
  it('está liberada, mas fora do tutorial (só a Leslie e o Grow, sempre)', () => {
    expect(HEROIS_LIBERADOS).toContain('margo');
    expect(HEROIS_DO_TUTORIAL).toEqual(['leslie', 'grow']);
  });

  it('não pega arma do chão', () => {
    const m = criarPersonagem('margo', 100);
    expect(podePegarArma(m)).toBe(false);
    expect(precisaLargarArma(m)).toBe(false);
  });

  it('no lugar do soco, o clique esquerdo dá a rolada', () => {
    const m = criarPersonagem('margo', 100);
    expect(bloqueioDaArma(m)).toBeNull();
    expect(armaPronta(m)).toBe(true);
    const uso = tentarAtacar(m, { x: 130, y: m.y - 16 });
    expect(uso?.arma).toBe('rolo');
    expect(m.recargaSoco).toBe(ROLO.recarga);
    // A Leslie, sem arma, soca.
    const l = criarPersonagem('leslie', 100);
    expect(tentarAtacar(l, { x: 130, y: l.y - 16 })?.arma).toBe('soco');
  });

  it('com o rolo voando (o Bumerangue), nada de rolada', () => {
    const m = criarPersonagem('margo', 100);
    m.roloFora = true;
    expect(bloqueioDaArma(m)).toBe('O ROLO ESTA VOANDO');
    expect(armaPronta(m)).toBe(false);
  });

  it('o botão direito passa pelo rolo e pelos poderes carregados, como na Leslie', () => {
    const m = criarPersonagem('margo', 100);
    m.energia = 10; // dá para o Bumerangue e a Farinha, não para o Ganso
    expect(m.modo).toBe('arma');
    passarSelecao(m);
    expect(usaPoderes(m)).toBe(true);
    expect(m.poderes.lista[m.poderes.selecionado]).toBe('bumerangue');
    passarSelecao(m);
    expect(m.poderes.lista[m.poderes.selecionado]).toBe('farinha');
    passarSelecao(m); // o Ganso, sem a barra cheia, é pulado: volta para o rolo
    expect(m.modo).toBe('arma');
  });
});
