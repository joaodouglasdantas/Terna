import { GANHO_POR_PARTIDA, NIVEIS_DO_PASSE, PONTOS_POR_NIVEL_DO_PASSE, PARTIDAS_COM_GANHO_POR_DIA, TEMPORADA_DO_PASSE } from '@terna/compartilhado';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../src/app';
import type { ConexaoBanco } from '../src/banco/conexao';
import { jogadores, partidasDaConta } from '../src/banco/schema';
import { correioDeTeste } from '../src/email/correio';
import { criarConta, novoServidor } from './ajuda';

let app: FastifyInstance;
let conexao: ConexaoBanco;
const autorizado = (token: string) => ({ authorization: `Bearer ${token}` });

beforeAll(async () => {
  ({ app, conexao } = await novoServidor());
});
afterAll(async () => {
  await app.close();
  await conexao.fechar();
});

// Abre uma partida e finge que ela começou há `segundos`.
async function partida(token: string, segundos = 120, modo: 'solo' | 'online' = 'solo'): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/eu/partidas', headers: autorizado(token), payload: { modo } });
  expect(r.statusCode).toBe(201);
  const id: string = r.json().id;
  await conexao.banco
    .update(partidasDaConta)
    .set({ comecouEm: new Date(Date.now() - segundos * 1000) })
    .where(eq(partidasDaConta.id, id));
  return id;
}

const terminar = (token: string, id: string, resultado: string) =>
  app.inject({ method: 'POST', url: `/api/eu/partidas/${id}/fim`, headers: autorizado(token), payload: { resultado } });

describe('progresso', () => {
  it('a conta nova começa no nível 1, sem azios e com o passe vazio', async () => {
    const token = await criarConta(app, 'novata');
    const eu = (await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).json();
    expect(eu.xp).toBe(0);
    expect(eu.azios).toBe(0);
    expect(eu.passe).toEqual({ temporada: TEMPORADA_DO_PASSE, pontos: 0, resgatados: [] });
  });

  it('a partida dá XP e pontos do passe, uma vez só', async () => {
    const token = await criarConta(app, 'jogadora');
    const id = await partida(token);
    const fim = await terminar(token, id, 'vitoria');
    expect(fim.statusCode).toBe(200);
    expect(fim.json().ganho).toEqual(GANHO_POR_PARTIDA.vitoria);
    expect(fim.json().jogador.xp).toBe(GANHO_POR_PARTIDA.vitoria.xp);
    expect(fim.json().jogador.passe.pontos).toBe(GANHO_POR_PARTIDA.vitoria.pontos);
    // De novo: já terminou.
    expect((await terminar(token, id, 'vitoria')).statusCode).toBe(409);
    // Derrota vale menos.
    const outra = await terminar(token, await partida(token), 'derrota');
    expect(outra.json().jogador.xp).toBe(GANHO_POR_PARTIDA.vitoria.xp + GANHO_POR_PARTIDA.derrota.xp);
  });

  it('a partida curta demais não dá nada; a de outra conta não fecha', async () => {
    const token = await criarConta(app, 'apressada');
    const curta = await terminar(token, await partida(token, 3), 'vitoria');
    expect(curta.json().ganho).toEqual({ xp: 0, pontos: 0 });
    expect(curta.json().jogador.xp).toBe(0);
    const outro = await criarConta(app, 'intrusa');
    const id = await partida(token);
    expect((await terminar(outro, id, 'vitoria')).statusCode).toBe(409);
    expect((await terminar(token, 'nada', 'vitoria')).statusCode).toBe(404);
    expect((await terminar(token, id, 'trapaca')).statusCode).toBe(400);
  });

  it('só PARTIDAS_COM_GANHO_POR_DIA partidas por dia dão ganho', async () => {
    const token = await criarConta(app, 'incansavel');
    const [eu] = await conexao.banco.select().from(jogadores).where(eq(jogadores.nomeNormalizado, 'incansavel'));
    await conexao.banco.insert(partidasDaConta).values(
      Array.from({ length: PARTIDAS_COM_GANHO_POR_DIA }, () => ({
        jogadorId: eu.id,
        modo: 'solo' as const,
        comecouEm: new Date(Date.now() - 600_000),
        terminouEm: new Date(Date.now() - 300_000),
        resultado: 'vitoria' as const,
        xp: 40,
        pontos: 30,
      })),
    );
    const fim = await terminar(token, await partida(token), 'vitoria');
    expect(fim.json().ganho).toEqual({ xp: 0, pontos: 0 });
  });

  it('resgata o nível liberado do passe, uma vez, e não o que ainda não chegou', async () => {
    const token = await criarConta(app, 'coleciona');
    const resgatar = (nivel: number) => app.inject({ method: 'POST', url: '/api/eu/passe/resgatar', headers: autorizado(token), payload: { nivel } });
    expect((await resgatar(1)).statusCode).toBe(409);
    await conexao.banco
      .update(jogadores)
      .set({ passePontos: PONTOS_POR_NIVEL_DO_PASSE * 2 })
      .where(eq(jogadores.nomeNormalizado, 'coleciona'));
    const um = await resgatar(1);
    expect(um.statusCode).toBe(200);
    expect(um.json().recompensa).toEqual(NIVEIS_DO_PASSE[0]);
    expect(um.json().jogador.azios).toBe(NIVEIS_DO_PASSE[0].azios);
    expect(um.json().jogador.passe.resgatados).toEqual([1]);
    expect((await resgatar(1)).statusCode).toBe(409);
    const dois = await resgatar(2);
    expect(dois.json().jogador.xp).toBe(NIVEIS_DO_PASSE[1].xp);
    expect(dois.json().jogador.passe.resgatados).toEqual([1, 2]);
    expect((await resgatar(3)).statusCode).toBe(409);
    expect((await resgatar(NIVEIS_DO_PASSE.length + 1)).statusCode).toBe(400);
  });

  it('dois resgates juntos do mesmo nível dão a recompensa uma vez', async () => {
    const token = await criarConta(app, 'ligeira');
    await conexao.banco.update(jogadores).set({ passePontos: PONTOS_POR_NIVEL_DO_PASSE }).where(eq(jogadores.nomeNormalizado, 'ligeira'));
    const pedir = () => app.inject({ method: 'POST', url: '/api/eu/passe/resgatar', headers: autorizado(token), payload: { nivel: 1 } });
    const respostas = await Promise.all([pedir(), pedir()]);
    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(1);
    const [eu] = await conexao.banco.select().from(jogadores).where(eq(jogadores.nomeNormalizado, 'ligeira'));
    expect(eu.azios).toBe(NIVEIS_DO_PASSE[0].azios);
  });

  it('o passe de outra temporada recomeça vazio', async () => {
    const token = await criarConta(app, 'veterana');
    await conexao.banco
      .update(jogadores)
      .set({ passeTemporada: TEMPORADA_DO_PASSE - 1, passePontos: 999, passeResgatados: [1, 2, 3] })
      .where(eq(jogadores.nomeNormalizado, 'veterana'));
    const eu = (await app.inject({ method: 'GET', url: '/api/eu', headers: autorizado(token) })).json();
    expect(eu.passe).toEqual({ temporada: TEMPORADA_DO_PASSE, pontos: 0, resgatados: [] });
    const fim = await terminar(token, await partida(token), 'empate');
    expect(fim.json().jogador.passe).toEqual({ temporada: TEMPORADA_DO_PASSE, pontos: GANHO_POR_PARTIDA.empate.pontos, resgatados: [] });
  });

  it('subir de nível do perfil vem na resposta', async () => {
    const token = await criarConta(app, 'quasela');
    await conexao.banco.update(jogadores).set({ xp: sql`110` }).where(eq(jogadores.nomeNormalizado, 'quasela'));
    const fim = await terminar(token, await partida(token), 'derrota');
    expect(fim.json().subiuPara).toBe(2);
  });

  it('a conta mestre resgata a trilha toda e recomeça o passe; as outras não recomeçam', async () => {
    const correio = correioDeTeste();
    const comMestre = await criarApp({
      banco: conexao.banco,
      origens: [],
      diasSessao: 30,
      tentativasPorMinuto: 1000,
      correio,
      mestres: new Set(['dona-passe@exemplo.com']),
    });
    const email = 'dona-passe@exemplo.com';
    await comMestre.inject({ method: 'POST', url: '/api/contas', payload: { nome: 'donapasse', email, senha: 'senha-boa-123' } });
    const confirmada = await comMestre.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo: correio.codigoDe(email) } });
    const token = confirmada.json().token;
    const ultimo = await comMestre.inject({
      method: 'POST',
      url: '/api/eu/passe/resgatar',
      headers: autorizado(token),
      payload: { nivel: NIVEIS_DO_PASSE.length },
    });
    expect(ultimo.statusCode).toBe(200);
    const recomecou = await comMestre.inject({ method: 'POST', url: '/api/eu/passe/recomecar', headers: autorizado(token) });
    expect(recomecou.json().passe.resgatados).toEqual([]);
    expect(recomecou.json().azios).toBe(NIVEIS_DO_PASSE[NIVEIS_DO_PASSE.length - 1].azios);
    const comum = await criarConta(app, 'comumpasse');
    expect((await app.inject({ method: 'POST', url: '/api/eu/passe/recomecar', headers: autorizado(comum) })).statusCode).toBe(403);
    await comMestre.close();
  });
});
