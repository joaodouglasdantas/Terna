// Tabelas do banco. Ao mudar algo aqui, rode `npm run db:gerar` para criar a migração.
// Só vai para o banco o que é do jogador; os dados do jogo (animais, itens...) ficam
// versionados em @terna/compartilhado.

// O código do jogador: 8 letras e números (sem os que se confundem: 0/O, 1/I/L), mostrado como
// XXXX-XXXX. Sorteado ao criar a conta; a coluna é única.
const LETRAS_DO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function gerarCodigoDoJogador(): string {
  const letras = Array.from({ length: 8 }, () => LETRAS_DO_CODIGO[randomInt(LETRAS_DO_CODIGO.length)]).join('');
  return `${letras.slice(0, 4)}-${letras.slice(4)}`;
}

import { TEMPORADA_DO_PASSE, type DadosSave, type ModoDaPartidaDaConta, type ResultadoDaPartida } from '@terna/compartilhado';
import { randomInt } from 'node:crypto';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const jogadores = pgTable('jogadores', {
  id: uuid().primaryKey().defaultRandom(),
  nome: text().notNull(),
  // Nome em minúsculas: "Joao" e "joao" não podem existir ao mesmo tempo.
  nomeNormalizado: text().notNull().unique(),
  email: text().unique(),
  senhaHash: text().notNull(),
  // Quando o código do e-mail foi conferido. Sem isso a conta não entra (o cadastro ficou pela
  // metade). As contas de antes da confirmação valem como confirmadas (migração 0001).
  emailConfirmadoEm: timestamp({ withTimezone: true }),
  // A conta Google ligada (o `sub` do token do Google, que não muda nem se o e-mail mudar). Quem
  // entra com o Google tem isto; a conta de e-mail e senha ganha na primeira vez que entrar com o
  // Google o mesmo e-mail.
  googleId: text().unique(),
  // O perfil: o ícone (um dos ICONES de @terna/compartilhado), quando o nome foi trocado pela
  // última vez (a regra dos DIAS_ENTRE_TROCAS_DE_NOME) e se o modo mestre está ligado (só vale
  // para a conta dona, a de EMAILS_MESTRE; ela pode desligar para jogar como uma conta comum).
  icone: text().notNull().default('flor-de-chapeu'),
  // O código do jogador: único, para identificar a conta (aparece no perfil). As contas de antes
  // dele ganharam um na migração 0003.
  codigo: text().notNull().unique().$defaultFn(gerarCodigoDoJogador),
  nomeTrocadoEm: timestamp({ withTimezone: true }),
  modoMestre: boolean().notNull().default(true),
  // O progresso (progresso.ts de @terna/compartilhado): o XP do perfil no total, os azios (a moeda
  // do jogo) e o passe da temporada — de que temporada é, os pontos juntados e os níveis já
  // resgatados. Virando a temporada (TEMPORADA_DO_PASSE), o passe recomeça na próxima vez que a
  // conta aparecer.
  xp: integer().notNull().default(0),
  azios: integer().notNull().default(0),
  passeTemporada: integer().notNull().default(TEMPORADA_DO_PASSE),
  passePontos: integer().notNull().default(0),
  passeResgatados: jsonb().$type<number[]>().notNull().default([]),
  criadoEm: criadoEm(),
});

// As partidas de cada conta (sozinho ou online), para o XP e os pontos do passe: o jogo abre a
// partida quando ela começa e fecha no fim, com o resultado. Só fecha uma vez, e só dá ganho a que
// durou o bastante (DURACAO_MINIMA_DA_PARTIDA_S) e até PARTIDAS_COM_GANHO_POR_DIA por dia.
export const partidasDaConta = pgTable(
  'partidas_da_conta',
  {
    id: uuid().primaryKey().defaultRandom(),
    jogadorId: uuid()
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    modo: text().$type<ModoDaPartidaDaConta>().notNull(),
    comecouEm: criadoEm(),
    terminouEm: timestamp({ withTimezone: true }),
    resultado: text().$type<ResultadoDaPartida>(),
    xp: integer().notNull().default(0),
    pontos: integer().notNull().default(0),
  },
  (t) => [index('partidas_da_conta_jogador_idx').on(t.jogadorId, t.comecouEm)],
);

// Os códigos que vão por e-mail: um por conta e por motivo ('confirmar' o cadastro ou trocar a
// 'senha'), trocado a cada pedido. Só o hash fica aqui; erros demais apagam o código.
export const codigosEmail = pgTable(
  'codigos_email',
  {
    jogadorId: uuid()
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    motivo: text().$type<'confirmar' | 'senha'>().notNull(),
    codigoHash: text().notNull(),
    tentativas: integer().notNull().default(0),
    criadoEm: criadoEm(),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.jogadorId, t.motivo] })],
);

// Cada login é uma sessão; o token só existe com o jogador, aqui fica o hash dele.
export const sessoes = pgTable(
  'sessoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    jogadorId: uuid()
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull().unique(),
    criadaEm: criadoEm(),
    expiraEm: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index('sessoes_jogador_idx').on(t.jogadorId)],
);

export const saves = pgTable(
  'saves',
  {
    jogadorId: uuid()
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    slot: integer().notNull(),
    versao: integer().notNull(), // versão do formato de DadosSave
    dados: jsonb().$type<DadosSave>().notNull(),
    atualizadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.jogadorId, t.slot] })],
);

// Melhor marca de cada jogador em cada categoria de ranking.
export const recordes = pgTable(
  'recordes',
  {
    jogadorId: uuid()
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    categoria: text().notNull(),
    valor: integer().notNull(),
    atualizadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.jogadorId, t.categoria] }), index('recordes_categoria_valor_idx').on(t.categoria, t.valor)],
);
