import { z } from 'zod';

// Nome que aparece para os outros jogadores: letras, números, _ e -.
export const NomeJogador = z
  .string()
  .trim()
  .min(3, 'o nome precisa de pelo menos 3 caracteres')
  .max(20, 'o nome pode ter no máximo 20 caracteres')
  .regex(/^[\p{L}\p{N}_-]+$/u, 'use só letras, números, _ e -');

export const Senha = z.string().min(8, 'a senha precisa de pelo menos 8 caracteres').max(200);

export const CriarConta = z.object({
  nome: NomeJogador,
  senha: Senha,
  email: z.email().max(254).optional(),
});
export type CriarConta = z.infer<typeof CriarConta>;

// Entra com o nome ou o e-mail.
export const Entrar = z.object({
  login: z.string().trim().min(1).max(254),
  senha: z.string().min(1).max(200),
});
export type Entrar = z.infer<typeof Entrar>;

export const Jogador = z.object({
  id: z.string(),
  nome: z.string(),
  criadoEm: z.string(),
});
export type Jogador = z.infer<typeof Jogador>;

// Resposta de criar conta e de entrar: o token vai no cabeçalho `Authorization: Bearer <token>`.
export const Sessao = z.object({
  token: z.string(),
  expiraEm: z.string(),
  jogador: Jogador,
});
export type Sessao = z.infer<typeof Sessao>;

export const Erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof Erro>;
