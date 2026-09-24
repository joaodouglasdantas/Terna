import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app';
import { abrirBanco, type ConexaoBanco } from '../src/banco/conexao';

// Servidor de teste com um banco novo, só na memória, já migrado.
export async function novoServidor(): Promise<{ app: FastifyInstance; conexao: ConexaoBanco }> {
  const conexao = await abrirBanco({
    url: null,
    pasta: 'memoria',
    pastaMigracoes: join(import.meta.dirname, '..', 'drizzle'),
  });
  await conexao.migrar();
  // Limite de tentativas alto: os testes criam muitas contas seguidas do mesmo "IP".
  const app = await criarApp({ banco: conexao.banco, origens: [], diasSessao: 30, tentativasPorMinuto: 1000 });
  return { app, conexao };
}

export async function criarConta(app: FastifyInstance, nome: string, senha = 'senha-boa-123'): Promise<string> {
  const resposta = await app.inject({ method: 'POST', url: '/api/contas', payload: { nome, senha } });
  if (resposta.statusCode !== 201) throw new Error(`criar conta: ${resposta.statusCode} ${resposta.body}`);
  return resposta.json().token;
}
