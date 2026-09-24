import { describe, expect, it } from 'vitest';
import { CriarConta, DadosSave, MensagemDoCliente, MensagemDoServidor, MUNDO } from '../src';

describe('contas', () => {
  it('aceita um cadastro válido e recusa nome com espaço', () => {
    expect(CriarConta.safeParse({ nome: 'joao_d', senha: '12345678' }).success).toBe(true);
    expect(CriarConta.safeParse({ nome: 'joão d', senha: '12345678' }).success).toBe(false);
  });
});

describe('save', () => {
  it('recusa posição fora do mapa', () => {
    const base = { versao: 1, personagem: { x: 100, direcao: 1 }, tempoDeJogo: 0 };
    expect(DadosSave.safeParse(base).success).toBe(true);
    expect(DadosSave.safeParse({ ...base, personagem: { x: MUNDO + 1, direcao: 1 } }).success).toBe(false);
  });
});

describe('protocolo de tempo real', () => {
  it('valida mensagens pelo tipo', () => {
    expect(MensagemDoCliente.safeParse({ tipo: 'posicao', x: 10, y: 200, direcao: -1, animacao: 'andando' }).success).toBe(true);
    expect(MensagemDoCliente.safeParse({ tipo: 'teleporte', x: 10 }).success).toBe(false);
    expect(MensagemDoServidor.safeParse({ tipo: 'saiu', id: 'abc' }).success).toBe(true);
  });
});
