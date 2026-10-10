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

import { alternarGolem } from '../src/entidades/grow/golem';
import {
  armaPronta,
  bloqueioDaArma,
  criarPersonagem,
  formaDo,
  passarSelecao,
  podePegarArma,
  precisaLargarArma,
  usaPoderes,
  voltarSeSemEnergia,
  type Personagem,
} from '../src/entidades/personagem';

// O Grow já virado em golem (a pedra assentou: o corpo está livre).
function golem(): Personagem {
  const g = criarPersonagem('grow', 100);
  g.golem.forma = 'golem';
  g.golem.fase = 'parado';
  g.golem.resta = 30;
  return g;
}

describe('o golem só tem os poderes: nem soco nem arma do chão', () => {
  it('o Grow de gente, no modo arma, soca e pega arma', () => {
    const g = criarPersonagem('grow', 100);
    expect(formaDo(g)).toBe('base');
    expect(bloqueioDaArma(g)).toBeNull();
    expect(armaPronta(g)).toBe(true); // sem arma, o soco
    expect(podePegarArma(g)).toBe(true);
  });

  it('de golem, o clique esquerdo são os poderes e o soco não sai', () => {
    const g = golem();
    expect(formaDo(g)).toBe('golem');
    expect(usaPoderes(g)).toBe(true);
    expect(bloqueioDaArma(g)).toBe('SO PODERES');
    expect(armaPronta(g)).toBe(false);
  });

  it('de golem, não pega arma do chão e a da mão cai', () => {
    const g = golem();
    expect(podePegarArma(g)).toBe(false);
    g.arma = { tipo: 'espada', durabilidade: 20, recarga: 0 };
    expect(precisaLargarArma(g)).toBe(true);
  });

  it('enquanto a pedra sobe, o corpo também não ataca', () => {
    const g = criarPersonagem('grow', 100);
    expect(alternarGolem(g.golem, true)).toBe(true); // começou a virar
    expect(bloqueioDaArma(g)).toBe('TRANSFORMANDO');
    expect(armaPronta(g)).toBe(false);
    expect(podePegarArma(g)).toBe(false);
  });

  it('de golem, o botão direito nunca volta para o quadrinho do punho', () => {
    const g = golem();
    g.modo = 'poderes';
    g.energia = 100;
    for (let i = 0; i < 6; i++) {
      passarSelecao(g);
      expect(g.modo).toBe('poderes');
    }
  });
});

describe('a Leslie continua na forma humana, até ultando', () => {
  it('é sempre a forma base: o soco e a arma nunca ficam bloqueados', () => {
    const l = criarPersonagem('leslie', 100);
    expect(formaDo(l)).toBe('base');
    expect(bloqueioDaArma(l)).toBeNull();
    expect(podePegarArma(l)).toBe(true);
  });

  it('gastou a barra na Flor: volta para a arma (ou o soco) e ataca', () => {
    const l = criarPersonagem('leslie', 100);
    l.modo = 'poderes';
    l.poderes.selecionado = 2; // a Flor Carnívora
    l.energia = 0; // a ult gasta a barra toda
    voltarSeSemEnergia(l);
    expect(l.modo).toBe('arma');
    expect(armaPronta(l)).toBe(true);
  });
});
