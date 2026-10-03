import { DIAS_ENTRE_TROCAS_DE_NOME } from '@terna/compartilhado';
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

// O IP de quem pediu. Atrás de proxy, o Render acrescenta o IP real ao fim do X-Forwarded-For mas
// mantém o que o cliente mandou no começo; o CF-Connecting-IP vem da borda do Cloudflare (por onde
// o Render recebe o tráfego) e não pode ser forjado.
export function ipDoPedido(request: FastifyRequest, confiarProxy: boolean): string {
  const borda = confiarProxy ? request.headers['cf-connecting-ip'] : undefined;
  // (Num pedido simulado, sem conexão de verdade, o `ip` pode não vir.)
  return typeof borda === 'string' && borda ? borda : (request.ip ?? request.socket?.remoteAddress ?? '');
}

// A conta dona do jogo: o e-mail está na lista de mestres e já foi confirmado (o código chegou na
// caixa dele; ninguém vira dono só digitando o e-mail).
export const ehDono = (j: JogadorAutenticado, mestres: ReadonlySet<string>): boolean =>
  Boolean(j.email && j.emailConfirmadoEm && mestres.has(j.email));

// Mestre: a conta dona com o modo mestre ligado (tudo liberado, sem prazos).
export const ehMestre = (j: JogadorAutenticado, mestres: ReadonlySet<string>): boolean => ehDono(j, mestres) && j.modoMestre;

// Quando o nome pode ser trocado de novo (null: já pode). O mestre não tem prazo.
export function nomeLivreEm(j: JogadorAutenticado, mestres: ReadonlySet<string>, agora = new Date()): Date | null {
  if (ehMestre(j, mestres) || !j.nomeTrocadoEm) return null;
  const livre = new Date(j.nomeTrocadoEm.getTime() + DIAS_ENTRE_TROCAS_DE_NOME * 24 * 60 * 60 * 1000);
  return livre > agora ? livre : null;
}

// O que vai para o jogo sobre o jogador.
export const jogadorPublico = (j: JogadorAutenticado, mestres: ReadonlySet<string> = new Set()) => ({
  id: j.id,
  nome: j.nome,
  criadoEm: j.criadoEm.toISOString(),
  mestre: ehMestre(j, mestres),
  dono: ehDono(j, mestres),
  icone: j.icone,
  nomeLivreEm: nomeLivreEm(j, mestres)?.toISOString() ?? null,
});
