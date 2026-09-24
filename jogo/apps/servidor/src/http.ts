import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { Banco } from './banco/conexao';
import { jogadorDoToken, tokenDoCabecalho, type JogadorAutenticado } from './auth/sessoes';

// Valida `dados` com o esquema; se não bater, já responde 400 com a primeira mensagem.
export function validar<T>(esquema: z.ZodType<T>, dados: unknown, reply: FastifyReply): T | null {
  const resultado = esquema.safeParse(dados);
  if (resultado.success) return resultado.data;
  const problema = resultado.error.issues[0];
  const campo = problema?.path.join('.');
  void reply.code(400).send({ erro: campo ? `${campo}: ${problema.message}` : (problema?.message ?? 'dados inválidos') });
  return null;
}

// Jogador da sessão; se não houver (ou tiver expirado), já responde 401.
export async function exigirJogador(
  banco: Banco,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<JogadorAutenticado | null> {
  const token = tokenDoCabecalho(request.headers.authorization);
  const jogador = token ? await jogadorDoToken(banco, token) : null;
  if (!jogador) void reply.code(401).send({ erro: 'entre na sua conta para continuar' });
  return jogador;
}

export const jogadorPublico = (j: JogadorAutenticado) => ({ id: j.id, nome: j.nome, criadoEm: j.criadoEm.toISOString() });
