import { z } from 'zod';
import { ARMAS } from './conteudo/armas';
import { PODERES, VIDA_MAXIMA } from './conteudo/poderes';
import { MUNDO } from './mundo';

// Partida: uma rodada com tempo marcado, sozinho (contra a CPU) ou 1v1 numa sala com código.
// Na 1v1 o cronômetro é do servidor: ele manda o tempo que resta ao começar e avisa o fim.

export const DURACAO_PARTIDA_MS = 5 * 60 * 1000;

// Nome que a pessoa escolhe para aparecer em cima da cabeça (sem conta: só um apelido).
// A fonte do jogo não tem acento: o nome é mostrado em maiúsculas e sem acento.
export const Apelido = z
  .string()
  .trim()
  .min(2, 'o nome precisa de pelo menos 2 letras')
  .max(12, 'o nome pode ter no máximo 12 caracteres')
  .regex(/^[\p{L}\p{N}_ -]+$/u, 'use só letras, números, espaço, _ e -');

// Código da sala: 5 caracteres, sem os que se confundem ao ditar ou ler (0/O, 1/I/L).
export const LETRAS_DO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO = 5;
export const CodigoSala = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${LETRAS_DO_CODIGO}]{${TAMANHO_CODIGO}}$`), 'código inválido');

// Como abrir a conexão: /api/partida?acao=criar&nome=... ou ?acao=entrar&codigo=...&nome=...
export const PedidoPartida = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('criar'), nome: Apelido }),
  z.object({ acao: z.literal('entrar'), nome: Apelido, codigo: CodigoSala }),
]);
export type PedidoPartida = z.infer<typeof PedidoPartida>;

// Os botões segurados e onde o corpo está. Quem recebe move o personagem do outro com os
// mesmos botões (pula, plana e vira anjo igualzinho) e corrige a posição aos poucos.
export const EstadoJogador = z.object({
  x: z.number().min(0).max(MUNDO),
  y: z.number().min(-1000).max(1000),
  vx: z.number().min(-1000).max(1000),
  vy: z.number().min(-3000).max(3000),
  direcao: z.union([z.literal(1), z.literal(-1)]),
  noChao: z.boolean(),
  forma: z.enum(['base', 'anjo']),
  esquerda: z.boolean(),
  direita: z.boolean(),
  pular: z.boolean(),
  transformar: z.boolean(),
  // Cada um decide o dano que leva (quem desviou na própria tela, desviou) e manda a vida.
  vida: z.number().min(0).max(VIDA_MAXIMA),
  selecionado: z.number().int().min(0).max(PODERES.length - 1), // o poder escolhido no painel
  encanto: z.number().min(0).max(10), // segundos que ainda faltam do encanto da Rajada (0 = livre)
});
export type EstadoJogador = z.infer<typeof EstadoJogador>;

// Um poder usado: de onde saiu (o peito do anjo) e para onde o cursor apontava. Quem recebe
// lança o mesmo poder no corpo do outro e confere se ele acerta o seu personagem.
export const PoderUsado = z.object({
  poder: z.enum(PODERES),
  x: z.number().min(0).max(MUNDO),
  y: z.number().min(-1000).max(1000),
  alvoX: z.number().min(-MUNDO).max(2 * MUNDO),
  alvoY: z.number().min(-2000).max(2000),
});
export type PoderUsado = z.infer<typeof PoderUsado>;

// Um ataque com a arma da mão (um golpe de espada ou uma flecha do arco), como o poder: de onde
// saiu (a mão) e para onde o cursor apontava. Quem recebe faz o golpe no corpo do outro e confere
// se ele acerta o seu personagem.
export const AtaqueUsado = z.object({
  arma: z.enum(ARMAS),
  x: z.number().min(0).max(MUNDO),
  y: z.number().min(-1000).max(1000),
  alvoX: z.number().min(-MUNDO).max(2 * MUNDO),
  alvoY: z.number().min(-2000).max(2000),
});
export type AtaqueUsado = z.infer<typeof AtaqueUsado>;

// `anfitriao` começa no meio do mapa olhando para a direita; `convidado`, um pouco à direita,
// olhando para ele.
export const Lado = z.enum(['anfitriao', 'convidado']);
export type Lado = z.infer<typeof Lado>;

// Uma arma no chão (ou ainda caindo), com o número que o servidor deu a ela. `durabilidade`:
// segundos que ela ainda dura na mão. `de`: quem a largou (virou anjo com ela na mão); sem isso,
// ela caiu do céu.
const DURABILIDADE = z.number().min(0).max(60);
export const ArmaNoMapa = z.object({
  id: z.number().int().nonnegative(),
  tipo: z.enum(ARMAS),
  x: z.number().min(0).max(MUNDO),
  durabilidade: DURABILIDADE,
  de: Lado.optional(),
});
export type ArmaNoMapa = z.infer<typeof ArmaNoMapa>;

export const MensagemPartidaDoCliente = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('estado'), estado: EstadoJogador }),
  z.object({ tipo: z.literal('poder'), uso: PoderUsado }),
  z.object({ tipo: z.literal('golpe'), uso: AtaqueUsado }),
  // Encostou numa arma: quem decide se leva é o servidor (os dois juntos, só o primeiro leva).
  z.object({ tipo: z.literal('pegar-arma'), id: z.number().int().nonnegative() }),
  // Virou anjo com a arma na mão: ela cai no chão, em `x`, com o tempo que ainda tinha.
  z.object({ tipo: z.literal('largar-arma'), x: z.number().min(0).max(MUNDO), durabilidade: DURABILIDADE }),
  z.object({ tipo: z.literal('arma-quebrou') }),
  // A vida de quem manda chegou a 0: a partida acaba e o outro vence.
  z.object({ tipo: z.literal('morri') }),
]);
export type MensagemPartidaDoCliente = z.infer<typeof MensagemPartidaDoCliente>;

// `morte`: a vida de alguém chegou a 0; o fim diz quem venceu.
export const MotivoFim = z.enum(['tempo', 'oponente-saiu', 'morte']);
export type MotivoFim = z.infer<typeof MotivoFim>;

export const MensagemPartidaDoServidor = z.discriminatedUnion('tipo', [
  // Para quem criou: o código para passar ao outro jogador.
  z.object({ tipo: z.literal('sala-criada'), codigo: CodigoSala }),
  // Os dois estão na sala: a partida começou e termina em `restanteMs`.
  z.object({ tipo: z.literal('comecou'), lado: Lado, oponente: z.string(), restanteMs: z.number() }),
  z.object({ tipo: z.literal('estado'), estado: EstadoJogador }),
  z.object({ tipo: z.literal('poder'), uso: PoderUsado }),
  z.object({ tipo: z.literal('golpe'), uso: AtaqueUsado }),
  // Para os dois: uma arma apareceu no mapa (do céu, ou largada por alguém), alguém pegou uma.
  z.object({ tipo: z.literal('arma-caiu'), arma: ArmaNoMapa }),
  z.object({ tipo: z.literal('arma-pega'), id: z.number().int().nonnegative(), lado: Lado }),
  // Só para o outro: a arma de `lado` quebrou na mão.
  z.object({ tipo: z.literal('arma-quebrou'), lado: Lado }),
  z.object({ tipo: z.literal('fim'), motivo: MotivoFim, vencedor: Lado.optional() }),
  z.object({ tipo: z.literal('erro'), erro: z.string() }),
]);
export type MensagemPartidaDoServidor = z.infer<typeof MensagemPartidaDoServidor>;
