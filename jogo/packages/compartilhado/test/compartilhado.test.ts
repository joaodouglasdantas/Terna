import { describe, expect, it } from 'vitest';
import {
  Apelido,
  CodigoSala,
  CriarConta,
  DadosSave,
  MensagemDoCliente,
  MensagemDoServidor,
  MUNDO,
  PedidoPartida,
  QUEDA_DE_ARMAS,
  cabeOutraArma,
  sortearArma,
} from '../src';

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

describe('partida', () => {
  it('aceita apelido com acento e espaço, recusa curto, longo e símbolo', () => {
    expect(Apelido.parse('  João D ')).toBe('João D');
    expect(Apelido.safeParse('J').success).toBe(false);
    expect(Apelido.safeParse('nome-muito-grande').success).toBe(false);
    expect(Apelido.safeParse('<b>').success).toBe(false);
  });

  it('normaliza o código para maiúsculas e recusa letras que se confundem', () => {
    expect(CodigoSala.parse(' k7p2q ')).toBe('K7P2Q');
    expect(CodigoSala.safeParse('K7P2O').success).toBe(false);
    expect(CodigoSala.safeParse('K7P2').success).toBe(false);
  });

  it('entrar numa sala pede o código', () => {
    expect(PedidoPartida.safeParse({ acao: 'criar', nome: 'ana' }).success).toBe(true);
    expect(PedidoPartida.safeParse({ acao: 'entrar', nome: 'ana' }).success).toBe(false);
  });
});

describe('armas', () => {
  it('cai mais uma só com pouca no chão e poucas no mapa', () => {
    expect(cabeOutraArma(0, 0)).toBe(true);
    expect(cabeOutraArma(1, 2)).toBe(true);
    expect(cabeOutraArma(2, 0)).toBe(false); // duas esperando no chão já bastam
    expect(cabeOutraArma(1, 3)).toBe(false); // quatro no mapa, contando as da mão
  });

  it('sorteia dentro do mapa, longe das beiradas', () => {
    expect(sortearArma(() => 0)).toEqual({ tipo: 'espada', x: QUEDA_DE_ARMAS.margem });
    expect(sortearArma(() => 0.9999)).toEqual({ tipo: 'arco', x: MUNDO - QUEDA_DE_ARMAS.margem });
  });
});
