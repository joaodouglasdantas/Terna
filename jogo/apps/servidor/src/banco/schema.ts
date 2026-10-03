// Tabelas do banco. Ao mudar algo aqui, rode `npm run db:gerar` para criar a migração.
// Só vai para o banco o que é do jogador; os dados do jogo (animais, itens...) ficam
// versionados em @terna/compartilhado.

import type { DadosSave } from '@terna/compartilhado';
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
  // O perfil: o ícone (um dos ICONES de @terna/compartilhado), quando o nome foi trocado pela
  // última vez (a regra dos DIAS_ENTRE_TROCAS_DE_NOME) e se o modo mestre está ligado (só vale
  // para a conta dona, a de EMAILS_MESTRE; ela pode desligar para jogar como uma conta comum).
  icone: text().notNull().default('flor-de-chapeu'),
  nomeTrocadoEm: timestamp({ withTimezone: true }),
  modoMestre: boolean().notNull().default(true),
  criadoEm: criadoEm(),
});

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
