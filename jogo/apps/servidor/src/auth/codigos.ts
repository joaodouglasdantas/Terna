import { createHash, randomInt } from 'node:crypto';
import { TAMANHO_CODIGO_EMAIL } from '@terna/compartilhado';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Banco } from '../banco/conexao';
import { codigosEmail, jogadores } from '../banco/schema';

// Os códigos de 6 números que vão por e-mail: confirmar o cadastro ou trocar a senha. Cada conta
// tem no máximo um por motivo (pedir outro troca o de antes). O banco guarda só o hash: quem o
// lesse não teria o código. Com 15 minutos de validade, 5 chances por código e um código novo
// por minuto no máximo, adivinhar não compensa.

export type MotivoCodigo = 'confirmar' | 'senha';

export const VALIDADE_CODIGO_MIN = 15;
export const TENTATIVAS_POR_CODIGO = 5;
export const ESPERA_REENVIO_S = 60; // segundos entre um código e o próximo para a mesma conta
const DIAS_CADASTRO_ABANDONADO = 7;

const hashDoCodigo = (jogadorId: string, motivo: MotivoCodigo, codigo: string): string =>
  createHash('sha256').update(`${jogadorId}:${motivo}:${codigo}`).digest('hex');

export function sortearCodigo(): string {
  return String(randomInt(0, 10 ** TAMANHO_CODIGO_EMAIL)).padStart(TAMANHO_CODIGO_EMAIL, '0');
}

// Segundos até poder mandar outro código deste motivo para a conta (0 = já pode).
export async function esperaParaReenviar(banco: Banco, jogadorId: string, motivo: MotivoCodigo): Promise<number> {
  const [atual] = await banco
    .select({ criadoEm: codigosEmail.criadoEm })
    .from(codigosEmail)
    .where(and(eq(codigosEmail.jogadorId, jogadorId), eq(codigosEmail.motivo, motivo)))
    .limit(1);
  if (!atual) return 0;
  const passou = (Date.now() - atual.criadoEm.getTime()) / 1000;
  return Math.max(0, Math.ceil(ESPERA_REENVIO_S - passou));
}

// Um código novo (o de antes deixa de valer). Devolve o código, que vai no e-mail.
export async function novoCodigo(banco: Banco, jogadorId: string, motivo: MotivoCodigo): Promise<string> {
  const codigo = sortearCodigo();
  const valores = {
    codigoHash: hashDoCodigo(jogadorId, motivo, codigo),
    tentativas: 0,
    criadoEm: new Date(),
    expiraEm: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000),
  };
  await banco
    .insert(codigosEmail)
    .values({ jogadorId, motivo, ...valores })
    .onConflictDoUpdate({ target: [codigosEmail.jogadorId, codigosEmail.motivo], set: valores });
  return codigo;
}

// Esqueceu o código (o e-mail não saiu): apaga, para a pessoa poder pedir outro na hora.
export async function apagarCodigo(banco: Banco, jogadorId: string, motivo: MotivoCodigo): Promise<void> {
  await banco.delete(codigosEmail).where(and(eq(codigosEmail.jogadorId, jogadorId), eq(codigosEmail.motivo, motivo)));
}

export type Conferencia = 'certo' | 'errado' | 'vencido' | 'esgotado' | 'nenhum';

// Confere o código digitado. Certo: o código é gasto. Errado: conta a tentativa e, na última,
// apaga (precisa pedir outro).
export async function conferirCodigo(banco: Banco, jogadorId: string, motivo: MotivoCodigo, codigo: string): Promise<Conferencia> {
  const onde = and(eq(codigosEmail.jogadorId, jogadorId), eq(codigosEmail.motivo, motivo));
  const [atual] = await banco.select().from(codigosEmail).where(onde).limit(1);
  if (!atual) return 'nenhum';
  if (atual.expiraEm.getTime() < Date.now()) {
    await banco.delete(codigosEmail).where(onde);
    return 'vencido';
  }
  if (atual.codigoHash === hashDoCodigo(jogadorId, motivo, codigo)) {
    await banco.delete(codigosEmail).where(onde);
    return 'certo';
  }
  const tentativas = atual.tentativas + 1;
  if (tentativas >= TENTATIVAS_POR_CODIGO) {
    await banco.delete(codigosEmail).where(onde);
    return 'esgotado';
  }
  await banco.update(codigosEmail).set({ tentativas }).where(onde);
  return 'errado';
}

// A mensagem de cada resultado errado, para a pessoa.
export const ERRO_DO_CODIGO: Record<Exclude<Conferencia, 'certo'>, string> = {
  errado: 'código errado: confira o e-mail e tente de novo',
  vencido: 'esse código venceu: peça outro',
  esgotado: 'tentativas demais com esse código: peça outro',
  nenhum: 'peça um código novo',
};

// Faxina de quando o servidor sobe: códigos vencidos e cadastros que nunca confirmaram o e-mail
// depois de uma semana (liberam o nome e o e-mail para outra pessoa).
export async function apagarCodigosEcadastrosVencidos(banco: Banco): Promise<{ codigos: number; cadastros: number }> {
  const codigos = await banco.delete(codigosEmail).where(lt(codigosEmail.expiraEm, new Date())).returning({ id: codigosEmail.jogadorId });
  const limite = new Date(Date.now() - DIAS_CADASTRO_ABANDONADO * 24 * 60 * 60 * 1000);
  const cadastros = await banco
    .delete(jogadores)
    .where(and(isNull(jogadores.emailConfirmadoEm), lt(jogadores.criadoEm, limite)))
    .returning({ id: jogadores.id });
  return { codigos: codigos.length, cadastros: cadastros.length };
}
