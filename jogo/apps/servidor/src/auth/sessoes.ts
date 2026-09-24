import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Banco } from '../banco/conexao';
import { jogadores, sessoes } from '../banco/schema';

// O token vai para o jogador uma vez só; o banco guarda apenas o hash dele. Quem ler o
// banco não consegue se passar por ninguém.
const hashDoToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function criarSessao(banco: Banco, jogadorId: string, dias: number): Promise<{ token: string; expiraEm: Date }> {
  // Aproveita o login para jogar fora as sessões vencidas deste jogador.
  await banco.delete(sessoes).where(and(eq(sessoes.jogadorId, jogadorId), lt(sessoes.expiraEm, new Date())));
  const token = randomBytes(32).toString('base64url');
  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  await banco.insert(sessoes).values({ jogadorId, tokenHash: hashDoToken(token), expiraEm });
  return { token, expiraEm };
}

export type JogadorAutenticado = typeof jogadores.$inferSelect;

export async function jogadorDoToken(banco: Banco, token: string): Promise<JogadorAutenticado | null> {
  const [linha] = await banco
    .select({ jogador: jogadores })
    .from(sessoes)
    .innerJoin(jogadores, eq(jogadores.id, sessoes.jogadorId))
    .where(and(eq(sessoes.tokenHash, hashDoToken(token)), gt(sessoes.expiraEm, new Date())))
    .limit(1);
  return linha?.jogador ?? null;
}

// Sessões vencidas não servem para nada e ocupariam o banco (o grátis tem 0,5 GB) para
// sempre. Roda quando o servidor sobe, o que no plano grátis acontece várias vezes por dia.
export async function apagarSessoesVencidas(banco: Banco): Promise<number> {
  const apagadas = await banco.delete(sessoes).where(lt(sessoes.expiraEm, new Date())).returning({ id: sessoes.id });
  return apagadas.length;
}

export async function encerrarSessao(banco: Banco, token: string): Promise<void> {
  await banco.delete(sessoes).where(eq(sessoes.tokenHash, hashDoToken(token)));
}

// Token de `Authorization: Bearer <token>`.
export function tokenDoCabecalho(cabecalho: string | undefined): string | null {
  const [tipo, token] = (cabecalho ?? '').split(' ');
  return tipo?.toLowerCase() === 'bearer' && token ? token : null;
}
