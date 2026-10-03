import { z } from 'zod';

// Nome que aparece para os outros jogadores: letras, números, _ e -. Até 12 caracteres, o mesmo
// limite do apelido das partidas (partida.ts): o nome da conta é o que vai em cima da cabeça.
export const NomeJogador = z
  .string()
  .trim()
  .min(3, 'o nome precisa de pelo menos 3 caracteres')
  .max(12, 'o nome pode ter no máximo 12 caracteres')
  .regex(/^[\p{L}\p{N}_-]+$/u, 'use só letras, números, _ e -');

export const Senha = z.string().min(8, 'a senha precisa de pelo menos 8 caracteres').max(200);

export const Email = z.string().trim().toLowerCase().pipe(z.email('e-mail inválido').max(254, 'e-mail longo demais'));

// O código que chega no e-mail: 6 números.
export const TAMANHO_CODIGO_EMAIL = 6;
export const CodigoEmail = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${TAMANHO_CODIGO_EMAIL}}$`), `o código tem ${TAMANHO_CODIGO_EMAIL} números`);

// Criar conta: a conta nasce esperando a confirmação do e-mail (chega um código nele).
export const CriarConta = z.object({
  nome: NomeJogador,
  email: Email,
  senha: Senha,
});
export type CriarConta = z.infer<typeof CriarConta>;

// Entra com o e-mail (ou o nome, das contas antigas) e a senha.
export const Entrar = z.object({
  login: z.string().trim().min(1).max(254),
  senha: z.string().min(1).max(200),
});
export type Entrar = z.infer<typeof Entrar>;

export const ConfirmarEmail = z.object({ email: Email, codigo: CodigoEmail });
export type ConfirmarEmail = z.infer<typeof ConfirmarEmail>;

// Pedir outro código (cadastro) ou o da troca de senha.
export const PedirCodigo = z.object({ email: Email });
export type PedirCodigo = z.infer<typeof PedirCodigo>;

export const TrocarSenha = z.object({ email: Email, codigo: CodigoEmail, senha: Senha });
export type TrocarSenha = z.infer<typeof TrocarSenha>;

// Resposta de criar conta e de pedir código: para onde foi e em quantos segundos dá para pedir
// outro.
export const CodigoEnviado = z.object({
  email: z.string(),
  reenviarEm: z.number(),
});
export type CodigoEnviado = z.infer<typeof CodigoEnviado>;

// Entrar com a conta ainda sem o e-mail confirmado responde 403 com isto (e manda um código).
export const ERRO_EMAIL_NAO_CONFIRMADO = 'confirme seu e-mail para entrar: mandamos um código para ele';

// `mestre`: a conta oficial do jogo (EMAILS_MESTRE no servidor), com tudo liberado para testar.
export const Jogador = z.object({
  id: z.string(),
  nome: z.string(),
  criadoEm: z.string(),
  mestre: z.boolean().default(false),
});
export type Jogador = z.infer<typeof Jogador>;

// Resposta de confirmar o e-mail, de entrar e de trocar a senha: o token vai no cabeçalho
// `Authorization: Bearer <token>`.
export const Sessao = z.object({
  token: z.string(),
  expiraEm: z.string(),
  jogador: Jogador,
});
export type Sessao = z.infer<typeof Sessao>;

export const Erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof Erro>;
