import { describe, expect, it } from 'vitest';
import { carregarLocal, gravarLocal, type ArmazenamentoSimples } from '../src/save/save';

function memoria(): ArmazenamentoSimples & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (c) => dados.get(c) ?? null, setItem: (c, v) => void dados.set(c, v) };
}

describe('save local', () => {
  it('grava e lê de volta', () => {
    const m = memoria();
    const save = { versao: 1 as const, personagem: { x: 300, direcao: -1 as const }, tempoDeJogo: 42 };
    gravarLocal(2, save, m);
    expect(carregarLocal(2, m)).toEqual(save);
    expect(carregarLocal(1, m)).toBeNull();
  });

  it('ignora save corrompido', () => {
    const m = memoria();
    m.setItem('terna:save:1', '{"versao": 99}');
    expect(carregarLocal(1, m)).toBeNull();
  });
});
