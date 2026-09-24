// Tabelas do banco. Ao mudar algo aqui, rode `npm run db:gerar` para criar a migração.
// Só vai para o banco o que é do jogador; os dados do jogo (animais, itens...) ficam
// versionados em @terna/compartilhado.

import type { DadosSave } from '@terna/compartilhado';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const criadoEm = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const jogadores = pgTable('jogadores', {
  id: uuid().primaryKey().defaultRandom(),
  nome: text().notNull(),
  // Nome em minúsculas: "Joao" e "joao" não podem existir ao mesmo tempo.
  nomeNormalizado: text().notNull().unique(),
  email: text().unique(),
  senhaHash: text().notNull(),
  criadoEm: criadoEm(),
});

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
