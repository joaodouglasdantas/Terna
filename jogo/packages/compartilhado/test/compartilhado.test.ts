import { describe, expect, it } from 'vitest';
import {
  Apelido,
  CodigoEmail,
  CodigoSala,
  CriarConta,
  DadosSave,
  ESPADA,
  HEROIS_LIBERADOS,
  MensagemDoCliente,
  MensagemDoServidor,
  MUNDO,
  PedidoPartida,
  QUEDA_DE_ARMAS,
  cabeOutraArma,
  danoNaZona,
  sortearArma,
  zonaDoAcerto,
} from '../src';

describe('contas', () => {
  const email = 'joao@exemplo.com';
  it('aceita um cadastro válido e recusa nome com espaço', () => {
    expect(CriarConta.safeParse({ nome: 'joao_d', email, senha: '12345678' }).success).toBe(true);
    expect(CriarConta.safeParse({ nome: 'joão d', email, senha: '12345678' }).success).toBe(false);
  });

  it('pede o e-mail, guarda ele em minúsculas e limita o nome ao tamanho do apelido', () => {
    expect(CriarConta.safeParse({ nome: 'joao_d', senha: '12345678' }).success).toBe(false);
    expect(CriarConta.safeParse({ nome: 'joao_d', email: 'nao-e-email', senha: '12345678' }).success).toBe(false);
    expect(CriarConta.parse({ nome: 'joao_d', email: '  Joao@Exemplo.COM ', senha: '12345678' }).email).toBe(email);
    // O nome da conta vai em cima da cabeça nas partidas: tem de servir de apelido.
    const nome = CriarConta.parse({ nome: 'abcdefghijkl', email, senha: '12345678' }).nome;
    expect(Apelido.safeParse(nome).success).toBe(true);
    expect(CriarConta.safeParse({ nome: 'abcdefghijklm', email, senha: '12345678' }).success).toBe(false);
  });

  it('o código do e-mail tem 6 números', () => {
    expect(CodigoEmail.safeParse('012345').success).toBe(true);
    expect(CodigoEmail.safeParse(' 012345 ').success).toBe(true);
    expect(CodigoEmail.safeParse('12345').success).toBe(false);
    expect(CodigoEmail.safeParse('12a456').success).toBe(false);
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

describe('personagens', () => {
  it('há liberados para os dois lados: cada personagem é de um só na partida', () => {
    expect(HEROIS_LIBERADOS.length).toBeGreaterThanOrEqual(2);
  });
});

describe('armas', () => {
  it('cai mais uma só com pouca no chão e poucas no mapa', () => {
    expect(cabeOutraArma(0, 0)).toBe(true);
    expect(cabeOutraArma(3, 2)).toBe(true);
    expect(cabeOutraArma(4, 0)).toBe(false); // quatro esperando no chão já bastam
    expect(cabeOutraArma(3, 3)).toBe(false); // seis no mapa, contando as da mão
  });

  it('na cabeça é crítico, no corpo é normal e nos pés é menos', () => {
    expect(zonaDoAcerto(30)).toBe('cabeca');
    expect(zonaDoAcerto(18)).toBe('cabeca');
    expect(zonaDoAcerto(17)).toBe('corpo');
    expect(zonaDoAcerto(8)).toBe('corpo');
    expect(zonaDoAcerto(7)).toBe('pes');
    expect(zonaDoAcerto(0)).toBe('pes');
    expect(danoNaZona(ESPADA.dano, 'corpo')).toBe(ESPADA.dano);
    expect(danoNaZona(ESPADA.dano, 'cabeca')).toBeGreaterThan(ESPADA.dano);
    expect(danoNaZona(ESPADA.dano, 'pes')).toBeLessThan(ESPADA.dano);
  });

  it('sorteia dentro do mapa, longe das beiradas', () => {
    expect(sortearArma(() => 0)).toEqual({ tipo: 'espada', x: QUEDA_DE_ARMAS.margem });
    expect(sortearArma(() => 0.9999)).toEqual({ tipo: 'arco', x: MUNDO - QUEDA_DE_ARMAS.margem });
  });
});
