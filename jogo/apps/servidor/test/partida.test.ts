import type { MensagemPartidaDoServidor } from '@terna/compartilhado';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import type { ConexaoBanco } from '../src/banco/conexao';
import { Salas } from '../src/partida/salas';
import type { Conexao } from '../src/tempo-real/sala';
import { novoServidor } from './ajuda';

// Uma conexão de mentira que guarda o que recebeu.
function conexaoFalsa() {
  const recebidas: MensagemPartidaDoServidor[] = [];
  const conexao = {
    fechada: null as null | { codigo?: number; motivo?: string },
    send: (dados: string) => recebidas.push(JSON.parse(dados) as MensagemPartidaDoServidor),
    close(codigo?: number, motivo?: string) {
      this.fechada = { codigo, motivo };
    },
  } satisfies Conexao & { fechada: unknown };
  return { conexao, recebidas, ultima: () => recebidas.at(-1) };
}

const ESTADO = {
  x: 300,
  y: 200,
  vx: 60,
  vy: 0,
  direcao: 1,
  noChao: true,
  forma: 'base',
  esquerda: false,
  direita: true,
  pular: false,
  transformar: false,
} as const;

describe('salas de partida', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cria com código, o segundo entra e os dois começam com o tempo todo', () => {
    const salas = new Salas({ duracaoMs: 300_000, gerarCodigo: () => 'K7P2Q' });
    const a = conexaoFalsa();
    const b = conexaoFalsa();
    salas.criar('Ana', a.conexao);
    expect(a.ultima()).toEqual({ tipo: 'sala-criada', codigo: 'K7P2Q' });

    salas.entrar('K7P2Q', 'Bia', b.conexao);
    expect(a.ultima()).toEqual({ tipo: 'comecou', lado: 'anfitriao', oponente: 'Bia', restanteMs: 300_000 });
    expect(b.ultima()).toEqual({ tipo: 'comecou', lado: 'convidado', oponente: 'Ana', restanteMs: 300_000 });
  });

  it('recusa código que não existe e sala cheia', () => {
    const salas = new Salas({ gerarCodigo: () => 'K7P2Q' });
    const intruso = conexaoFalsa();
    expect(salas.entrar('ZZZZZ', 'Cid', intruso.conexao)).toBeNull();
    expect(intruso.ultima()).toMatchObject({ tipo: 'erro' });
    expect(intruso.conexao.fechada).not.toBeNull();

    salas.criar('Ana', conexaoFalsa().conexao);
    salas.entrar('K7P2Q', 'Bia', conexaoFalsa().conexao);
    const terceiro = conexaoFalsa();
    expect(salas.entrar('K7P2Q', 'Cid', terceiro.conexao)).toBeNull();
    expect(terceiro.ultima()).toEqual({ tipo: 'erro', erro: 'essa sala já está cheia' });
  });

  it('repassa o estado só para o outro jogador e só depois de começar', () => {
    const salas = new Salas({ gerarCodigo: () => 'K7P2Q' });
    const a = conexaoFalsa();
    const b = conexaoFalsa();
    const anfitriao = salas.criar('Ana', a.conexao)!;
    salas.receber(anfitriao, JSON.stringify({ tipo: 'estado', estado: ESTADO }));
    expect(a.recebidas).toHaveLength(1); // só o sala-criada: sozinho, não há para quem mandar

    salas.entrar('K7P2Q', 'Bia', b.conexao);
    salas.receber(anfitriao, JSON.stringify({ tipo: 'estado', estado: ESTADO }));
    expect(b.ultima()).toEqual({ tipo: 'estado', estado: ESTADO });
    expect(a.ultima()?.tipo).toBe('comecou');

    salas.receber(anfitriao, JSON.stringify({ tipo: 'estado', estado: { ...ESTADO, x: 99999 } }));
    expect(a.ultima()).toEqual({ tipo: 'erro', erro: 'mensagem inválida' });
  });

  it('acaba para os dois quando o tempo termina', () => {
    vi.useFakeTimers();
    const salas = new Salas({ duracaoMs: 1000, gerarCodigo: () => 'K7P2Q' });
    const a = conexaoFalsa();
    const b = conexaoFalsa();
    salas.criar('Ana', a.conexao);
    salas.entrar('K7P2Q', 'Bia', b.conexao);
    vi.advanceTimersByTime(999);
    expect(b.ultima()?.tipo).toBe('comecou');
    vi.advanceTimersByTime(1);
    expect(a.ultima()).toEqual({ tipo: 'fim', motivo: 'tempo' });
    expect(b.ultima()).toEqual({ tipo: 'fim', motivo: 'tempo' });
    expect(salas.quantidade).toBe(0);
  });

  it('avisa quem ficou quando o outro sai no meio', () => {
    const salas = new Salas({ gerarCodigo: () => 'K7P2Q' });
    const a = conexaoFalsa();
    const b = conexaoFalsa();
    salas.criar('Ana', a.conexao);
    const convidado = salas.entrar('K7P2Q', 'Bia', b.conexao)!;
    salas.sair(convidado);
    expect(a.ultima()).toEqual({ tipo: 'fim', motivo: 'oponente-saiu' });
    expect(a.conexao.fechada).not.toBeNull();
    expect(salas.quantidade).toBe(0);
  });

  it('fecha a sala que ninguém entrou a tempo', () => {
    vi.useFakeTimers();
    const salas = new Salas({ esperaMaxMs: 5000, gerarCodigo: () => 'K7P2Q' });
    const a = conexaoFalsa();
    salas.criar('Ana', a.conexao);
    vi.advanceTimersByTime(5000);
    expect(a.ultima()).toEqual({ tipo: 'erro', erro: 'ninguém entrou na sala a tempo' });
    expect(salas.quantidade).toBe(0);
  });
});

describe('rota /api/partida', () => {
  let app: FastifyInstance;
  let conexao: ConexaoBanco;

  beforeAll(async () => {
    ({ app, conexao } = await novoServidor());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await conexao.fechar();
  });

  // Conecta já ouvindo: a primeira mensagem chega junto com a conexão.
  async function conectar(consulta: string) {
    const recebidas: MensagemPartidaDoServidor[] = [];
    const esperando: ((m: MensagemPartidaDoServidor) => void)[] = [];
    const socket: WebSocket = await app.injectWS(
      `/api/partida?${consulta}`,
      {},
      {
        onInit: (ws) =>
          ws.on('message', (dados) => {
            const m = JSON.parse(dados.toString()) as MensagemPartidaDoServidor;
            const resolver = esperando.shift();
            if (resolver) resolver(m);
            else recebidas.push(m);
          }),
      },
    );
    const proxima = () =>
      new Promise<MensagemPartidaDoServidor>((resolver) => {
        const m = recebidas.shift();
        if (m) resolver(m);
        else esperando.push(resolver);
      });
    return { socket, proxima };
  }

  it('recusa nome inválido antes de abrir a conexão', async () => {
    await expect(app.injectWS('/api/partida?acao=criar&nome=x')).rejects.toThrow();
    await expect(app.injectWS('/api/partida?acao=entrar&nome=Bia')).rejects.toThrow();
  });

  it('dois jogadores entram pela mesma sala e trocam estado', async () => {
    const a = await conectar('acao=criar&nome=Ana');
    const criada = await a.proxima();
    expect(criada.tipo).toBe('sala-criada');
    const codigo = criada.tipo === 'sala-criada' ? criada.codigo : '';

    const b = await conectar(`acao=entrar&codigo=${codigo.toLowerCase()}&nome=${encodeURIComponent('Bia é')}`);
    expect(await b.proxima()).toMatchObject({ tipo: 'comecou', lado: 'convidado', oponente: 'Ana' });
    expect(await a.proxima()).toMatchObject({ tipo: 'comecou', lado: 'anfitriao', oponente: 'Bia é' });

    b.socket.send(JSON.stringify({ tipo: 'estado', estado: ESTADO }));
    expect(await a.proxima()).toEqual({ tipo: 'estado', estado: ESTADO });

    b.socket.terminate();
    expect(await a.proxima()).toEqual({ tipo: 'fim', motivo: 'oponente-saiu' });
    a.socket.terminate();
  });
});
