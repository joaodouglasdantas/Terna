// Uma partida: você e o outro no mapa, com o tempo correndo. Sozinho, o outro é a CPU (o sósia
// de sempre) e o tempo é daqui — o menu pausa tudo. Online, o outro é o personagem de quem
// entrou na sala: cada um simula o próprio e manda botões + posição; aqui o corpo dele anda com
// os mesmos botões (pula, plana, vira anjo igual) e a posição é corrigida aos poucos. O tempo
// online é do servidor: o fim chega por mensagem, ao mesmo tempo para os dois.
//
// Os poderes do anjo: o seu sai do clique (o botão direito troca o escolhido), o da CPU do
// cérebro dela e o do outro online chega pela rede e é lançado no corpo dele aqui. Cada um
// confere o dano que leva — online, a vida do outro chega com o estado dele. A vida de alguém
// chegando a 0 acaba a partida, com o outro de vencedor.
//
// As armas: na forma base o clique esquerdo ataca com a arma da mão (se tiver). Encostou numa
// arma no chão, pega — sozinho na hora; online pedindo ao servidor, que decide quem leva. Virando
// anjo com ela, ela cai no chão; o tempo dela acabando, quebra. Sozinho as quedas saem daqui;
// online, do servidor.

import { DURACAO_PARTIDA_MS, MUNDO, type EstadoJogador, type Lado, type MotivoFim } from '@terna/compartilhado';
import { alternarForma, transformando } from './entidades/anjo';
import {
  armaAoAlcance,
  armasNoChao,
  atualizarArsenal,
  atualizarQuedas,
  criarArsenal,
  gastarArma,
  lancarAtaque,
  pegarArma,
  quebrarArma,
  soltarNoMapa,
  tentarAtacar,
  tirarDaMao,
  type Arsenal,
} from './entidades/armas';
import {
  VELOCIDADE_DASH,
  atualizarPersonagem,
  bloqueioDaArma,
  bloqueioDosPoderes,
  comecarDash,
  criarPersonagem,
  formaDo,
  gesticular,
  maoDo,
  peitoDo,
  podePegarArma,
  precisaLargarArma,
  type Controles,
  type Personagem,
} from './entidades/personagem';
import {
  ameacasPara,
  atualizarEfeitos,
  comecarRecarga,
  criarEfeitos,
  lancarPoder,
  avisar,
  mostrarDano,
  tentarUsar,
  trocarPoder,
  type Alvo,
  type Efeitos,
} from './entidades/poderes';
import { criarCerebroSosia, pensarSosia, type CerebroSosia } from './entidades/sosia';
import type { Escolha } from './inicio/inicio';
import type { Etiqueta } from './interface/etiqueta';
import type { CorDoJogador } from './interface/painel';
import type { ConexaoPartida } from './rede/partida';

export type Identidade = Etiqueta & CorDoJogador;
// Você sempre em azul, no painel da esquerda; o outro em vermelho, no da direita.
const AZUL = { cor: '#5fb2ff', clara: '#d3e9ff' };
const VERMELHO = { cor: '#ff5a67', clara: '#ffd8dc' };

// Um começa no meio do mapa olhando para a direita; o outro um pouco à direita, olhando para ele.
const MEIO = MUNDO / 2;
const AO_LADO = MUNDO / 2 + 70;

const ENVIO_MS = 100; // manda o estado ~10 vezes por segundo…
const ENVIO_MINIMO_MS = 67; // …e na hora em que um botão muda, mas nunca mais de ~15 por segundo
const CORRIGIR = 8; // quanto maior, mais rápido o corpo do outro alcança a posição recebida
const TELEPORTE = 64; // pixels de diferença a partir dos quais pula direto para lá
const EXTRAPOLAR_ATE = 0.25; // segundos: até quanto adivinha para onde ele andou depois do estado
const FORMA_DIVERGE = 0.6; // segundos numa forma diferente da recebida até trocar
const REPEDIR_ARMA = 0.5; // segundos: pediu uma arma e o servidor não deu, pede de novo depois disso

const PARADO: Controles = { esquerda: false, direita: false, pular: false, transformar: false };

export type FimDaPartida = MotivoFim | 'conexao';

// O que o mouse fez desde o último quadro: quantas vezes o botão direito trocou o poder e, se o
// esquerdo foi clicado, onde (no mapa).
export interface AcoesMouse {
  trocar: number;
  usar: { x: number; y: number } | null;
}

export const SEM_ACOES: AcoesMouse = { trocar: 0, usar: null };

interface Remoto {
  conexao: ConexaoPartida;
  controles: Controles;
  alvo: EstadoJogador | null;
  idadeAlvo: number; // segundos desde que o último estado chegou
  formaDiverge: number;
  ultimoEnvio: number; // performance.now() do último estado mandado
  enviados: Controles;
  // Pulo e R apertados desde o último envio: um toque mais rápido que o intervalo entre dois
  // estados não se perde — vai como apertado no próximo.
  apertados: { pular: boolean; transformar: boolean };
  lado: Lado;
  morteEnviada: boolean;
  pediuArma: number; // segundos desde o último pedido de arma (esperando a resposta)
}

export interface Partida {
  online: boolean;
  jogador: Personagem;
  outro: Personagem;
  eu: Identidade;
  ele: Identidade;
  efeitos: Efeitos; // os poderes no mapa, dos dois
  arsenal: Arsenal; // as armas no mapa e as flechas
  // Sozinho: ms que faltam (para no menu). Online: quando acaba, em performance.now().
  restanteMs: number;
  fimEm: number;
  menuAberto: boolean;
  acabou: boolean;
  cpu: CerebroSosia | null;
  remoto: Remoto | null;
  // `venceu`: no fim por morte, se foi você quem ficou de pé; nos outros fins, null.
  aoFim: (motivo: FimDaPartida, venceu: boolean | null) => void;
}

export function criarPartida(
  escolha: Escolha,
  aoFim: (motivo: FimDaPartida, venceu: boolean | null) => void,
): Partida {
  const convidado = escolha.modo === 'online' && escolha.lado === 'convidado';
  const [meuX, meuLado, dele, ladoDele] = convidado ? [AO_LADO, -1, MEIO, 1] as const : [MEIO, 1, AO_LADO, -1] as const;
  const p: Partida = {
    online: escolha.modo === 'online',
    jogador: criarPersonagem(meuX, meuLado),
    outro: criarPersonagem(dele, ladoDele),
    eu: { texto: escolha.nome, ...AZUL },
    ele: { texto: escolha.modo === 'online' ? escolha.oponente : 'CPU', ...VERMELHO },
    efeitos: criarEfeitos(),
    arsenal: criarArsenal(escolha.modo === 'solo'),
    restanteMs: escolha.modo === 'online' ? escolha.restanteMs : DURACAO_PARTIDA_MS,
    fimEm: performance.now() + (escolha.modo === 'online' ? escolha.restanteMs : DURACAO_PARTIDA_MS),
    menuAberto: false,
    acabou: false,
    cpu: escolha.modo === 'solo' ? criarCerebroSosia(AO_LADO) : null,
    remoto: null,
    aoFim,
  };

  if (escolha.modo === 'online') {
    const remoto: Remoto = {
      conexao: escolha.conexao,
      controles: { ...PARADO },
      alvo: null,
      idadeAlvo: 0,
      formaDiverge: 0,
      ultimoEnvio: 0,
      enviados: { ...PARADO },
      apertados: { pular: false, transformar: false },
      lado: escolha.lado,
      morteEnviada: false,
      pediuArma: REPEDIR_ARMA,
    };
    p.remoto = remoto;
    escolha.conexao.ouvir(
      (m) => {
        if (m.tipo === 'estado') {
          const { esquerda, direita, pular, transformar } = m.estado;
          remoto.controles = { esquerda, direita, pular, transformar };
          remoto.alvo = m.estado;
          remoto.idadeAlvo = 0;
          // Os dois toques de um dash podem ser rápidos demais para chegar como botões; a
          // velocidade dele chega, e aí o dash (com o rastro) começa aqui também.
          if (Math.abs(m.estado.vx) >= VELOCIDADE_DASH) comecarDash(p.outro, m.estado.vx > 0 ? 1 : -1);
          // A vida dele é ele quem decide: caiu, mostra o dano aqui.
          if (m.estado.vida < p.outro.vida) mostrarDano(p.efeitos, p.outro, p.outro.vida - m.estado.vida);
          p.outro.vida = m.estado.vida;
          p.outro.poderes.selecionado = m.estado.selecionado;
          // O encanto dele também é ele quem decide; enfeitiçado, só pode ter sido por você.
          p.outro.encanto = m.estado.encanto > 0 ? { resta: m.estado.encanto, dono: p.jogador } : null;
        }
        if (m.tipo === 'poder' && !p.acabou) {
          gesticular(p.outro, { x: m.uso.alvoX, y: m.uso.alvoY }, m.uso.poder === 'julgamento');
          comecarRecarga(p.outro.poderes, m.uso.poder);
          lancarPoder(p.efeitos, p.outro, m.uso);
        }
        if (m.tipo === 'golpe' && !p.acabou) lancarAtaque(p.arsenal, p.outro, m.uso);
        if (m.tipo === 'arma-caiu') {
          // Largada pelo outro (virou anjo): sai da mão dele e cai no chão.
          if (m.arma.de && m.arma.de !== remoto.lado) tirarDaMao(p.outro);
          soltarNoMapa(p.arsenal, m.arma);
        }
        if (m.tipo === 'arma-pega') {
          const meu = m.lado === remoto.lado;
          pegarArma(p.arsenal, meu ? p.jogador : p.outro, m.id);
          if (meu) remoto.pediuArma = REPEDIR_ARMA;
        }
        if (m.tipo === 'arma-quebrou' && m.lado !== remoto.lado) quebrarArma(p.arsenal, p.outro);
        if (m.tipo === 'fim') terminar(p, m.motivo, m.vencedor ? m.vencedor === remoto.lado : null);
      },
      // Caiu sem o servidor dizer que acabou: a rede de alguém caiu.
      () => terminar(p, 'conexao', null),
    );
  }
  return p;
}

function terminar(p: Partida, motivo: FimDaPartida, venceu: boolean | null): void {
  if (p.acabou) return;
  p.acabou = true;
  p.menuAberto = false;
  if (p.online) p.restanteMs = Math.max(0, p.fimEm - performance.now());
  p.aoFim(motivo, venceu);
}

// Saiu da partida (menu → Sair, ou voltou ao menu depois do fim).
export function encerrarPartida(p: Partida): void {
  p.acabou = true;
  p.remoto?.conexao.fechar();
}

// Usa o poder escolhido de `corpo` mirando em `alvo`; saiu, vira para lá e volta o uso (para
// mandar pela rede).
function usarPoder(p: Partida, corpo: Personagem, alvo: { x: number; y: number }): void {
  const uso = tentarUsar(corpo.poderes, bloqueioDosPoderes(corpo), peitoDo(corpo), alvo);
  if (!uso) return;
  // O braço estica na direção da mira e o poder sai da mão.
  gesticular(corpo, alvo, uso.poder === 'julgamento');
  const mao = maoDo(corpo);
  uso.x = Math.max(0, Math.min(MUNDO, mao.x));
  uso.y = mao.y;
  lancarPoder(p.efeitos, corpo, uso);
  if (corpo === p.jogador) p.remoto?.conexao.enviarPoder(uso);
}

// O clique esquerdo: na forma base, a arma da mão; de anjo, o poder escolhido.
function usarAcao(p: Partida, corpo: Personagem, alvo: { x: number; y: number }): void {
  if (formaDo(corpo) === 'anjo') return usarPoder(p, corpo, alvo);
  const bloqueio = bloqueioDaArma(corpo);
  if (bloqueio) return avisar(corpo.poderes, bloqueio);
  const uso = tentarAtacar(corpo, alvo);
  if (!uso) return;
  lancarAtaque(p.arsenal, corpo, uso);
  if (corpo === p.jogador) p.remoto?.conexao.enviarGolpe(uso);
}

// A arma de um corpo que manda em si (o seu, ou a CPU): larga ao virar anjo, pega a que alcança
// com a mão livre e gasta o tempo dela, quebrando no fim. Online, largar, pegar e quebrar passam
// pelo servidor, que avisa os dois.
function cuidarDaArma(p: Partida, corpo: Personagem, dt: number): void {
  const conexao = corpo === p.jogador ? p.remoto?.conexao : undefined;
  if (precisaLargarArma(corpo)) {
    const largada = tirarDaMao(corpo);
    if (!largada) return;
    if (conexao) conexao.largarArma(largada.x, largada.durabilidade);
    else soltarNoMapa(p.arsenal, { id: p.arsenal.proximoId++, ...largada }, true);
    return;
  }
  if (podePegarArma(corpo)) {
    const arma = armaAoAlcance(p.arsenal, corpo);
    if (arma && !conexao) pegarArma(p.arsenal, corpo, arma.id);
    else if (arma && p.remoto && p.remoto.pediuArma >= REPEDIR_ARMA) {
      p.remoto.pediuArma = 0;
      conexao?.pedirArma(arma.id);
    }
  }
  if (gastarArma(p.arsenal, corpo, dt, true)) conexao?.avisarArmaQuebrou();
}

export function atualizarPartida(p: Partida, teclado: Controles, mouse: AcoesMouse, dt: number, tempo: number): void {
  // Sozinho com o menu aberto: tudo parado, inclusive o tempo.
  if (!p.online && p.menuAberto) return;

  const livre = !p.menuAberto && !p.acabou && p.jogador.vida > 0;
  if (livre) {
    for (let i = 0; i < mouse.trocar; i++) trocarPoder(p.jogador.poderes);
    if (mouse.usar) usarAcao(p, p.jogador, mouse.usar);
  }
  atualizarPersonagem(p.jogador, livre ? teclado : PARADO, dt, tempo);
  if (p.cpu) {
    const pode = !p.acabou && p.outro.vida > 0;
    const decisao = pensarSosia(p.cpu, p.outro, dt, p.jogador, ameacasPara(p.efeitos, p.outro), armasNoChao(p.arsenal));
    atualizarPersonagem(p.outro, pode ? decisao.controles : PARADO, dt, tempo);
    if (pode && decisao.mira) {
      p.outro.poderes.selecionado = decisao.mira.poder;
      usarPoder(p, p.outro, decisao.mira);
    }
    if (pode && decisao.golpe) usarAcao(p, p.outro, decisao.golpe);
  }
  if (p.remoto) {
    atualizarRemoto(p.remoto, p.outro, dt, tempo);
    if (!p.acabou) enviarEstado(p.remoto, p.jogador, livre ? teclado : PARADO);
  }

  if (!p.acabou) {
    cuidarDaArma(p, p.jogador, dt);
    // A arma do outro online: só passa o tempo aqui; largar, pegar e quebrar chegam pela rede.
    if (p.remoto) gastarArma(p.arsenal, p.outro, dt, false);
    else cuidarDaArma(p, p.outro, dt);
    if (p.remoto) p.remoto.pediuArma += dt;
    else atualizarQuedas(p.arsenal, dt, Number(Boolean(p.jogador.arma)) + Number(Boolean(p.outro.arma)));
  }

  // Sozinho, os dois apanham de verdade; online, só o seu personagem (a vida do outro vem dele).
  const alvos: Alvo[] = p.acabou
    ? []
    : [
        { corpo: p.jogador, ferir: true },
        { corpo: p.outro, ferir: !p.online },
      ];
  atualizarEfeitos(p.efeitos, dt, alvos);
  atualizarArsenal(p.arsenal, p.efeitos, dt, [p.jogador, p.outro], alvos);

  if (p.acabou) return;
  if (p.remoto) {
    // Caiu: avisa o servidor, que acaba a partida para os dois.
    if (p.jogador.vida <= 0 && !p.remoto.morteEnviada) {
      p.remoto.morteEnviada = true;
      enviarEstado(p.remoto, p.jogador, PARADO, true);
      p.remoto.conexao.enviarMorte();
    }
  } else if (p.jogador.vida <= 0) {
    return terminar(p, 'morte', false);
  } else if (p.outro.vida <= 0) {
    return terminar(p, 'morte', true);
  }
  if (p.online) {
    // O fim chega do servidor; aqui o relógio só mostra quanto falta.
    p.restanteMs = Math.max(0, p.fimEm - performance.now());
  } else {
    p.restanteMs = Math.max(0, p.restanteMs - dt * 1000);
    if (p.restanteMs === 0) terminar(p, 'tempo', null);
  }
}

function atualizarRemoto(r: Remoto, corpo: Personagem, dt: number, tempo: number): void {
  atualizarPersonagem(corpo, corpo.vida > 0 ? r.controles : PARADO, dt, tempo);
  const a = r.alvo;
  if (!a) return;
  r.idadeAlvo += dt;
  const alvoX = Math.max(0, Math.min(MUNDO, a.x + a.vx * Math.min(r.idadeAlvo, EXTRAPOLAR_ATE)));
  if (Math.abs(alvoX - corpo.x) > TELEPORTE || Math.abs(a.y - corpo.y) > TELEPORTE) {
    Object.assign(corpo, { x: alvoX, y: a.y, vx: a.vx, vy: a.vy, noChao: a.noChao });
  } else if (!a.noChao && corpo.noChao && r.idadeAlvo < 0.2) {
    // Ele pulou e aqui o corpo ficou no chão (o botão foi rápido demais): sai do chão junto.
    Object.assign(corpo, { y: a.y, vy: a.vy, noChao: false });
  } else {
    const k = Math.min(1, dt * CORRIGIR);
    corpo.x += (alvoX - corpo.x) * k;
    // No ar os dois, a altura também se acerta; no chão ela já é a mesma.
    if (!a.noChao && !corpo.noChao) corpo.y += (a.y - corpo.y) * k;
  }
  // Um toque rápido em R pode se perder entre dois estados: se a forma dele ficar diferente da
  // recebida por um tempo, troca aqui também — mesmo com a recarga do anjo correndo aqui, que
  // pode estar um pouco atrás da dele.
  if (a.forma !== formaDo(corpo) && !transformando(corpo.anjo)) {
    r.formaDiverge += dt;
    if (r.formaDiverge > FORMA_DIVERGE) {
      alternarForma(corpo.anjo, true);
      r.formaDiverge = 0;
    }
  } else {
    r.formaDiverge = 0;
  }
}

const mudou = (a: Controles, b: Controles): boolean =>
  a.esquerda !== b.esquerda || a.direita !== b.direita || a.pular !== b.pular || a.transformar !== b.transformar;

// `agora`: manda já, sem esperar o intervalo (a vida chegou a 0 e vai junto com o aviso).
function enviarEstado(r: Remoto, corpo: Personagem, segurados: Controles, agora = false): void {
  r.apertados.pular ||= segurados.pular;
  r.apertados.transformar ||= segurados.transformar;
  const controles = { ...segurados, ...r.apertados };
  const instante = performance.now();
  const passou = instante - r.ultimoEnvio;
  if (!agora && passou < ENVIO_MS && !(mudou(controles, r.enviados) && passou >= ENVIO_MINIMO_MS)) return;
  r.ultimoEnvio = instante;
  r.enviados = controles;
  r.apertados = { pular: false, transformar: false };
  r.conexao.enviar({
    x: Math.max(0, Math.min(MUNDO, corpo.x)),
    y: corpo.y,
    vx: corpo.vx,
    vy: Math.max(-3000, Math.min(3000, corpo.vy)),
    direcao: corpo.direcao,
    noChao: corpo.noChao,
    forma: formaDo(corpo),
    ...controles,
    vida: corpo.vida,
    selecionado: corpo.poderes.selecionado,
    encanto: Math.min(10, corpo.encanto?.resta ?? 0),
  });
}
