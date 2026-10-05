import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { criarApp, type OpcoesApp } from '../src/app';
import { conexaoPglite, type ConexaoBanco } from '../src/banco/conexao';
import { correioDeTeste } from '../src/email/correio';
import { PASTA_MIGRACOES } from './banco-modelo';

export type CorreioDeTeste = ReturnType<typeof correioDeTeste>;

// O correio de cada servidor de teste: os e-mails ficam guardados nele (com os códigos).
const correios = new WeakMap<FastifyInstance, CorreioDeTeste>();

// Servidor de teste com um banco novo, só na memória, já migrado: uma cópia do banco-modelo
// que o setup global (banco-modelo.ts) preparou. `extra`: opções a mais do servidor (o Google).
export async function novoServidor(extra: Partial<OpcoesApp> = {}): Promise<{ app: FastifyInstance; conexao: ConexaoBanco; correio: CorreioDeTeste }> {
  const modelo = new Blob([readFileSync(inject('bancoModelo'))]);
  const conexao = await conexaoPglite(new PGlite({ loadDataDir: modelo }), PASTA_MIGRACOES);
  const correio = correioDeTeste();
  // Limite de tentativas alto: os testes criam muitas contas seguidas do mesmo "IP".
  const app = await criarApp({ banco: conexao.banco, origens: [], diasSessao: 30, tentativasPorMinuto: 1000, correio, ...extra });
  correios.set(app, correio);
  return { app, conexao, correio };
}

export const emailDe = (nome: string): string => `${nome.toLowerCase()}@exemplo.com`;

// Cria a conta inteira — cadastro e o código do e-mail — e devolve o token da sessão.
export async function criarConta(app: FastifyInstance, nome: string, senha = 'senha-boa-123'): Promise<string> {
  const correio = correios.get(app);
  if (!correio) throw new Error('servidor sem correio de teste (use novoServidor)');
  const email = emailDe(nome);
  const cadastro = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome, email, senha } });
  if (cadastro.statusCode !== 201) throw new Error(`criar conta: ${cadastro.statusCode} ${cadastro.body}`);
  const codigo = correio.codigoDe(email);
  const confirmada = await app.inject({ method: 'POST', url: '/api/contas/confirmar', payload: { email, codigo } });
  if (confirmada.statusCode !== 200) throw new Error(`confirmar: ${confirmada.statusCode} ${confirmada.body}`);
  return confirmada.json().token;
}
