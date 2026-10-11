import { z } from 'zod';
import { ARMAS, ATAQUES } from './conteudo/armas';
import { HEROIS } from './conteudo/herois';
import { ENERGIA_PIXY, PODERES, PODERES_POR_HEROI, VIDA_MAXIMA } from './conteudo/poderes';
import { MUNDO } from './mundo';

// Partida: uma rodada com tempo marcado, sozinho (contra a CPU) ou 1v1 numa sala com código.
// Na 1v1, com os dois na sala, cada um escolhe o personagem — um diferente do outro, e cada um vê
// a escolha do outro na hora; o cronômetro é do servidor e só começa com as duas escolhas feitas:
// ele manda o tempo que resta ao começar e avisa o fim.

export const DURACAO_PARTIDA_MS = 5 * 60 * 1000;
// Antes do relógio correr: a tela de carregamento da temporada (a mesma duração para os dois) e,
// já no mapa, a contagem 3, 2, 1 com todo mundo parado.
export const CARREGAMENTO_MS = 4500;
export const CONTAGEM_MS = 3000;

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

// Como abrir a conexão: /api/partida?acao=criar&nome=... (sala com código, pela internet),
// ?acao=hospedar&nome=... (partida na mesma rede: quem estiver nela a vê na lista, sem código) ou
// ?acao=entrar&codigo=...&nome=... (nas duas: da lista, o código vem junto).
// Um número sorteado por aba do jogo: quem hospeda manda o seu, e a lista da rede de quem manda
// o mesmo não mostra essa partida (ninguém vê a partida que ele mesmo hospedou).
export const IdDaAba = z.string().regex(/^[0-9a-f]{8,32}$/);

export const PedidoPartida = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('criar'), nome: Apelido }),
  z.object({ acao: z.literal('hospedar'), nome: Apelido, eu: IdDaAba.optional() }),
  z.object({ acao: z.literal('entrar'), nome: Apelido, codigo: CodigoSala }),
]);
export type PedidoPartida = z.infer<typeof PedidoPartida>;

// GET /api/partida/rede?eu=...: as partidas hospedadas na mesma rede de quem pergunta, esperando
// alguém — menos as que a própria aba (`eu`) hospedou.
export const PartidaNaRede = z.object({ codigo: CodigoSala, anfitriao: z.string() });
export type PartidaNaRede = z.infer<typeof PartidaNaRede>;
export const PartidasNaRede = z.object({ partidas: z.array(PartidaNaRede) });

// Os dois computadores tentam se ligar direto (WebRTC) e o estado, os poderes e os golpes vão por
// essa ligação, sem passar pelo servidor: na mesma rede, pelos endereços dela; pela internet, com o
// endereço de fora que um servidor STUN mostra a cada um (a rede de quem está atrás de um NAT
// muito fechado não deixa, e aí segue pelo servidor). O servidor só leva os recados para ela abrir: a
// descrição da ligação (a oferta de quem hospeda, a resposta de quem entrou) e os caminhos
// possíveis de cada um (candidatos). Não abrindo, tudo continua pelo servidor.
export const Sinal = z.object({
  descricao: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(3000) }).optional(),
  candidato: z
    .object({
      candidate: z.string().max(500),
      sdpMid: z.string().max(32).nullish(),
      sdpMLineIndex: z.number().int().min(0).max(16).nullish(),
      usernameFragment: z.string().max(64).nullish(),
    })
    .optional(),
});
export type Sinal = z.infer<typeof Sinal>;

export const IdHeroi = z.enum(HEROIS);

// Os botões segurados e onde o corpo está. Quem recebe move o personagem do outro com os
// mesmos botões (pula, plana e vira anjo igualzinho) e corrige a posição aos poucos.
export const EstadoJogador = z.object({
  x: z.number().min(0).max(MUNDO),
  y: z.number().min(-1000).max(1000),
  vx: z.number().min(-1000).max(1000),
  vy: z.number().min(-3000).max(3000),
  direcao: z.union([z.literal(1), z.literal(-1)]),
  noChao: z.boolean(),
  forma: z.enum(['base', 'anjo', 'golem']), // o Anjo vira anjo, o Grow vira golem; a Leslie e a Margo estão sempre na base
  modo: z.enum(['arma', 'poderes']), // o que o clique esquerdo da Leslie e do Grow usa (a tecla R troca)
  esquerda: z.boolean(),
  direita: z.boolean(),
  pular: z.boolean(),
  transformar: z.boolean(),
  // Cada um decide o dano que leva (quem desviou na própria tela, desviou) e manda a vida.
  vida: z.number().min(0).max(VIDA_MAXIMA),
  selecionado: z.number().int().min(0).max(PODERES_POR_HEROI - 1), // o poder escolhido no painel
  encanto: z.number().min(0).max(10), // segundos que ainda faltam do encanto da Rajada (0 = livre)
  preso: z.number().min(0).max(10), // segundos que ainda faltam presos pelas Raízes (0 = livre)
  veneno: z.number().min(0).max(10), // segundos que ainda faltam do veneno do Chicote (0 = limpo)
  levado: z.number().min(0).max(10), // segundos que ainda faltam carregado pela Revoada do Grow
  lento: z.number().min(0).max(10).default(0), // segundos que ainda faltam enfarinhado (a Farinha da Margo)
  empurrao: z.number().min(-1000).max(1000), // px/s de empurrão (vento, trombada), que vai sumindo
  canalizando: z.boolean(), // o Grow segurando o Vendaval
  energia: z.number().min(0).max(ENERGIA_PIXY.maxima), // a energia pixy, para o painel dele aqui
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
  arma: z.enum(ATAQUES), // a arma da mão, 'soco' (sem arma) ou 'rolo' (a rolada da Margo)
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
  // Com os dois na sala, antes de começar: o personagem escolhido (só os liberados valem, e não o
  // que o outro já escolheu: cada personagem é de um só na partida).
  z.object({ tipo: z.literal('heroi'), heroi: IdHeroi }),
  z.object({ tipo: z.literal('estado'), estado: EstadoJogador }),
  z.object({ tipo: z.literal('poder'), uso: PoderUsado }),
  z.object({ tipo: z.literal('golpe'), uso: AtaqueUsado }),
  // Encostou numa arma: quem decide se leva é o servidor (os dois juntos, só o primeiro leva).
  z.object({ tipo: z.literal('pegar-arma'), id: z.number().int().nonnegative() }),
  // Virou anjo com a arma na mão: ela cai no chão, em `x`, com o tempo que ainda tinha.
  z.object({ tipo: z.literal('largar-arma'), x: z.number().min(0).max(MUNDO), durabilidade: DURABILIDADE }),
  z.object({ tipo: z.literal('arma-quebrou') }),
  // Apertou E: jogou fora a arma da mão, que some (ninguém mais pega).
  z.object({ tipo: z.literal('descartar-arma') }),
  // A vida de quem manda chegou a 0: a partida acaba e o outro vence.
  z.object({ tipo: z.literal('morri') }),
  // A própria vida, quando muda (no máximo umas vezes por segundo, e sempre direto ao servidor,
  // mesmo ligados pela rede local): no fim por tempo, ganha quem tiver mais.
  z.object({ tipo: z.literal('vida'), vida: z.number().min(0).max(VIDA_MAXIMA) }),
  // Depois do fim: quer jogar de novo com o mesmo oponente (os dois pedindo, voltam à escolha).
  z.object({ tipo: z.literal('revanche') }),
  // Um recado para a ligação direta com o outro (mesma rede).
  z.object({ tipo: z.literal('sinal'), sinal: Sinal }),
]);
export type MensagemPartidaDoCliente = z.infer<typeof MensagemPartidaDoCliente>;

// `morte`: a vida de alguém chegou a 0; o fim diz quem venceu. `tempo`: o relógio zerou — vence
// quem tiver mais vida (o fim diz quem; sem `vencedor`, empate).
export const MotivoFim = z.enum(['tempo', 'oponente-saiu', 'morte']);
export type MotivoFim = z.infer<typeof MotivoFim>;

// Um servidor de retransmissão (TURN) para a ligação direta, com as credenciais do momento (o
// servidor do jogo as pede ao Cloudflare e elas vencem sozinhas). O mesmo formato do
// RTCIceServer do navegador.
export const ServidorIce = z.object({
  urls: z.union([z.string(), z.array(z.string()).max(8)]),
  username: z.string().max(256).optional(),
  credential: z.string().max(256).optional(),
});
export type ServidorIce = z.infer<typeof ServidorIce>;

export const MensagemPartidaDoServidor = z.discriminatedUnion('tipo', [
  // Para quem criou: o código para passar ao outro jogador.
  z.object({ tipo: z.literal('sala-criada'), codigo: CodigoSala }),
  // Os dois estão na sala: cada um escolhe o personagem (e manda `heroi`; até o outro escolher,
  // pode mandar de novo e trocar). `prazoMs`: o tempo para os dois escolherem; acabando antes,
  // ninguém entra no jogo e a sala cai. `direto`: tentem a ligação direta — na mesma rede, ou,
  // com `internet`, pela internet (com o STUN). `ice`: os servidores de retransmissão (TURN),
  // para quando a ligação direta não abre (o NAT da operadora não deixa): o jogo passa por um
  // servidor do Cloudflare perto dos dois, em vez de ir até o servidor do jogo nos EUA.
  z.object({
    tipo: z.literal('escolher'),
    lado: Lado,
    oponente: z.string(),
    prazoMs: z.number().int().positive(),
    direto: z.boolean().optional(),
    internet: z.boolean().optional(),
    ice: z.array(ServidorIce).max(8).optional(),
  }),
  // O personagem que o outro escolheu (a cada escolha e troca dele): fica bloqueado para quem
  // recebe. Volta também para quem pediu um personagem que o outro já tinha (os dois clicaram
  // juntos e o dele chegou antes): essa escolha não valeu.
  z.object({ tipo: z.literal('oponente-escolheu'), heroi: IdHeroi }),
  // Os dois escolheram: a partida começou e termina em `restanteMs`.
  z.object({
    tipo: z.literal('comecou'),
    lado: Lado,
    oponente: z.string(),
    restanteMs: z.number(),
    heroi: IdHeroi,
    heroiOponente: IdHeroi,
  }),
  // O estado do outro. `atraso`: ms que ele levou de lá até aqui (a ida dele até o servidor mais
  // a sua, medidas pelo ping): o boneco do outro é adiantado por isso.
  z.object({ tipo: z.literal('estado'), estado: EstadoJogador, atraso: z.number().min(0).max(5000).optional() }),
  z.object({ tipo: z.literal('poder'), uso: PoderUsado }),
  z.object({ tipo: z.literal('golpe'), uso: AtaqueUsado }),
  // Para os dois: uma arma apareceu no mapa (do céu, ou largada por alguém), alguém pegou uma.
  z.object({ tipo: z.literal('arma-caiu'), arma: ArmaNoMapa }),
  z.object({ tipo: z.literal('arma-pega'), id: z.number().int().nonnegative(), lado: Lado }),
  // Só para o outro: a arma de `lado` quebrou na mão.
  z.object({ tipo: z.literal('arma-quebrou'), lado: Lado }),
  // Só para o outro: `lado` jogou fora a arma da mão.
  z.object({ tipo: z.literal('arma-descartada'), lado: Lado }),
  // A partida acabou. Por tempo ou morte a sala continua aberta para a revanche; o outro saindo,
  // ela fecha.
  z.object({ tipo: z.literal('fim'), motivo: MotivoFim, vencedor: Lado.optional() }),
  // Só para o outro: quem mandou quer jogar de novo. Os dois querendo, chega `escolher` de novo.
  z.object({ tipo: z.literal('revanche') }),
  // Só para o outro: um recado de quem mandou para a ligação direta.
  z.object({ tipo: z.literal('sinal'), sinal: Sinal }),
  // A cada medida do batimento (uma por segundo), com os dois na sala: a ida e volta de quem recebe
  // até o servidor (`ping`, ms) e a do outro (`pingOponente`; 0 ainda sem medida). Pelo servidor,
  // um estado leva a metade da soma dos dois de um jogador ao outro.
  z.object({ tipo: z.literal('rede'), ping: z.number().min(0).max(10_000), pingOponente: z.number().min(0).max(10_000) }),
  z.object({ tipo: z.literal('erro'), erro: z.string() }),
]);
export type MensagemPartidaDoServidor = z.infer<typeof MensagemPartidaDoServidor>;
