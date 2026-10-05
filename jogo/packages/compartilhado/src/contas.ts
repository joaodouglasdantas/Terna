import { z } from 'zod';
import { PASSE_VAZIO, PasseDaConta } from './progresso';

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

// Entrar com o Google: `credencial` é o token que o botão do Google devolve (o servidor confere a
// assinatura). Conta nova pede o nome de jogador: a primeira resposta é `precisaDeNome` (com uma
// sugestão tirada do nome da conta Google) e o jogo manda de novo com o `nome`.
export const EntrarComGoogle = z.object({
  credencial: z.string().min(20).max(4096),
  nome: NomeJogador.optional(),
});
export type EntrarComGoogle = z.infer<typeof EntrarComGoogle>;

// O Client ID do "Entrar com o Google" do Terna (Google Cloud Console → Google Auth Platform →
// Clientes, projeto do ternaofcl@gmail.com). Não é segredo: vai no próprio botão, no navegador de
// todo jogador. O jogo e o servidor usam este; VITE_GOOGLE_CLIENT_ID (jogo) e GOOGLE_CLIENT_ID
// (servidor) trocam por outro, e GOOGLE_CLIENT_ID=desligado desliga o login pelo Google no servidor.
// (A "chave secreta do cliente" que o Google mostra junto não é usada pelo jogo e nunca vai aqui.)
export const GOOGLE_CLIENT_ID = '507398645212-p3ld577428bt8b6rlv5rj20hqtcl9r9l.apps.googleusercontent.com';

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
// `nomeLivreEm`: quando o nome pode ser trocado de novo (null: já pode). `primeiraTrocaDeNome`:
// a troca grátis de quem nunca trocou (a primeira não espera os 30 dias). `codigo`: o código único
// do jogador. `xp`: o XP do perfil no total (o nível sai dele: nivelDoPerfil). `azios`: a moeda do
// jogo. `passe`: o passe da temporada (progresso.ts).
export const Jogador = z.object({
  id: z.string(),
  codigo: z.string().default(''),
  nome: z.string(),
  criadoEm: z.string(),
  mestre: z.boolean().default(false),
  dono: z.boolean().default(false),
  icone: IdIcone.catch(ICONE_PADRAO).default(ICONE_PADRAO),
  nomeLivreEm: z.string().nullable().default(null),
  primeiraTrocaDeNome: z.boolean().default(false),
  xp: z.number().int().default(0),
  azios: z.number().int().default(0),
  passe: PasseDaConta.default(PASSE_VAZIO),
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

// O fim da partida da conta: a conta como ficou e o que a partida deu (zero quando não contou:
// curta demais, ou passou das partidas com ganho do dia). `subiuPara`: o nível novo do perfil.
export const FimDaPartidaDaConta = z.object({
  jogador: Jogador,
  ganho: z.object({ xp: z.number().int(), pontos: z.number().int() }),
  subiuPara: z.number().int().nullable(),
});
export type FimDaPartidaDaConta = z.infer<typeof FimDaPartidaDaConta>;

// Resgatou um nível do passe: a conta como ficou, o que veio e o nível novo do perfil (se subiu).
export const NivelResgatado = z.object({
  jogador: Jogador,
  recompensa: z.object({ xp: z.number().int(), azios: z.number().int() }),
  subiuPara: z.number().int().nullable(),
});
export type NivelResgatado = z.infer<typeof NivelResgatado>;

// A resposta de entrar com o Google: a sessão, ou o pedido do nome (a conta ainda não existe).
export const PrecisaDeNome = z.object({ precisaDeNome: z.literal(true), sugestao: z.string(), email: z.string() });
export type PrecisaDeNome = z.infer<typeof PrecisaDeNome>;
export const RespostaGoogle = z.union([Sessao, PrecisaDeNome]);
export type RespostaGoogle = z.infer<typeof RespostaGoogle>;

export const Erro = z.object({ erro: z.string() });
export type Erro = z.infer<typeof Erro>;
