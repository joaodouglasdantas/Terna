import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { criarApp } from '../src/app';
import { conexaoPglite, type ConexaoBanco } from '../src/banco/conexao';
import { PASTA_MIGRACOES } from './banco-modelo';

// Servidor de teste com um banco novo, só na memória, já migrado: uma cópia do banco-modelo
// que o setup global (banco-modelo.ts) preparou.
export async function novoServidor(): Promise<{ app: FastifyInstance; conexao: ConexaoBanco }> {
  const modelo = new Blob([readFileSync(inject('bancoModelo'))]);
  const conexao = await conexaoPglite(new PGlite({ loadDataDir: modelo }), PASTA_MIGRACOES);
  // Limite de tentativas alto: os testes criam muitas contas seguidas do mesmo "IP".
  const app = await criarApp({ banco: conexao.banco, origens: [], diasSessao: 30, tentativasPorMinuto: 1000 });
  return { app, conexao };
}

export async function criarConta(app: FastifyInstance, nome: string, senha = 'senha-boa-123'): Promise<string> {
  const resposta = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome, senha } });
  if (resposta.statusCode !== 201) throw new Error(`criar conta: ${resposta.statusCode} ${resposta.body}`);
  return resposta.json().token;
}
