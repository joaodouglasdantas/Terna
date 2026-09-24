import type { MensagemDoServidor } from '@terna/compartilhado';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import type { ConexaoBanco } from '../src/banco/conexao';
import { criarConta, novoServidor } from './ajuda';

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

// Conecta já ouvindo (a mensagem de boas-vindas chega junto com a conexão), guarda tudo o
// que chega e deixa esperar pela próxima mensagem de um tipo.
async function conectar(token: string) {
  let proxima!: ReturnType<typeof ouvir>;
  const socket = await app.injectWS(
    `/api/tempo-real?token=${token}`,
    {},
    {
      onInit: (ws) => {
        proxima = ouvir(ws);
      },
    },
  );
  return { socket, proxima };
}

function ouvir(socket: WebSocket) {
  const recebidas: MensagemDoServidor[] = [];
  const esperando: { tipo: string; resolver: (m: MensagemDoServidor) => void }[] = [];
  socket.on('message', (dados) => {
    const m = JSON.parse(dados.toString()) as MensagemDoServidor;
    const i = esperando.findIndex((e) => e.tipo === m.tipo);
    if (i >= 0) esperando.splice(i, 1)[0].resolver(m);
    else recebidas.push(m);
  });
  return (tipo: MensagemDoServidor['tipo']) =>
    new Promise<MensagemDoServidor>((resolver) => {
      const i = recebidas.findIndex((m) => m.tipo === tipo);
      if (i >= 0) resolver(recebidas.splice(i, 1)[0]);
      else esperando.push({ tipo, resolver });
    });
}

describe('tempo real', () => {
  it('recusa conexão sem sessão', async () => {
    await expect(app.injectWS('/api/tempo-real?token=falso')).rejects.toThrow();
  });

  it('um jogador vê o outro entrar, andar e sair', async () => {
    const tokenA = await criarConta(app, 'andarilho');
    const tokenB = await criarConta(app, 'observador');

    const { socket: b, proxima: proximaDeB } = await conectar(tokenB);
    expect(await proximaDeB('bem-vindo')).toMatchObject({ jogadores: [] });

    const { socket: a, proxima: proximaDeA } = await conectar(tokenA);
    const boasVindas = await proximaDeA('bem-vindo');
    expect(boasVindas.tipo === 'bem-vindo' && boasVindas.jogadores.map((j) => j.nome)).toEqual(['observador']);
    expect(await proximaDeB('entrou')).toMatchObject({ jogador: { nome: 'andarilho' } });

    a.send(JSON.stringify({ tipo: 'posicao', x: 321, y: 180, direcao: -1, animacao: 'andando' }));
    expect(await proximaDeB('posicao')).toMatchObject({ x: 321, direcao: -1 });

    a.send(JSON.stringify({ tipo: 'posicao', x: 99999, y: 0, direcao: 1, animacao: 'x' }));
    expect(await proximaDeA('erro')).toMatchObject({ erro: 'mensagem inválida' });

    a.terminate();
    expect(await proximaDeB('saiu')).toMatchObject({ tipo: 'saiu' });
    b.terminate();
  });
});
