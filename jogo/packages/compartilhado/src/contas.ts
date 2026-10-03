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

// Os ícones de perfil. `comum`: qualquer conta pode usar. A arte fica no jogo
// (apps/cliente/src/assets/icones/<id>.webp).
export const ICONES = [
  { id: 'flor-de-chapeu', nome: 'Flor de Chapéu', tipo: 'comum' },
  { id: 'golem-do-ninho', nome: 'Golem do Ninho', tipo: 'comum' },
] as const;
export type IdIcone = (typeof ICONES)[number]['id'];
export const IdIcone = z.enum(ICONES.map((i) => i.id) as [IdIcone, ...IdIcone[]], 'esse ícone não existe');
export const ICONE_PADRAO: IdIcone = 'flor-de-chapeu';

// A regra do nome: depois de trocar, só dá para trocar de novo depois destes dias (a conta mestre
// não tem prazo).
export const DIAS_ENTRE_TROCAS_DE_NOME = 30;

// `dono`: a conta oficial do jogo (EMAILS_MESTRE no servidor). `mestre`: o modo mestre ligado,
// com tudo liberado para testar — o dono pode desligar para jogar como uma conta comum.
// `nomeLivreEm`: quando o nome pode ser trocado de novo (null: já pode).
export const Jogador = z.object({
  id: z.string(),
  nome: z.string(),
  criadoEm: z.string(),
  mestre: z.boolean().default(false),
  dono: z.boolean().default(false),
  icone: IdIcone.catch(ICONE_PADRAO).default(ICONE_PADRAO),
  nomeLivreEm: z.string().nullable().default(null),
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

// O perfil: trocar o nome (respeitando o prazo), o ícone e ligar ou desligar o modo mestre (só o
// dono).
export const TrocarNome = z.object({ nome: NomeJogador });
export type TrocarNome = z.infer<typeof TrocarNome>;
export const TrocarIcone = z.object({ icone: IdIcone });
export type TrocarIcone = z.infer<typeof TrocarIcone>;
export const ModoMestre = z.object({ ligado: z.boolean() });
export type ModoMestre = z.infer<typeof ModoMestre>;

export const Erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof Erro>;
