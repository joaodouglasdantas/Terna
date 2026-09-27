// Uma partida: você e o outro no mapa, com o tempo correndo, cada um com o personagem que
// escolheu. Sozinho, o outro é a CPU (com um personagem sorteado entre os liberados, diferente do
// seu, quando há outro) e o tempo é
// daqui — o menu pausa tudo. Online, o outro é o personagem de quem entrou na sala: cada um
// simula o próprio e manda botões + posição; aqui o corpo dele anda com os mesmos botões (pula,
// troca de modo, vira anjo igual) e a posição é corrigida aos poucos. O tempo online é do
// servidor: o fim chega por mensagem, ao mesmo tempo para os dois.
//
// Antes de tudo, a contagem 3, 2, 1: os dois parados, sem poder nem arma, e o relógio esperando
// (online, o servidor também espera por ela). No fim por morte, quem venceu (`fim.vencedor`)
// ganha a luz do céu e quem caiu fica deitado no chão.
//
// Os poderes: o seu sai do clique (o botão direito troca o escolhido), o da CPU do cérebro dela
// e o do outro online chega pela rede e é lançado no corpo dele aqui. Cada um confere o dano que
// leva — online, a vida do outro chega com o estado dele. A vida de alguém chegando a 0 acaba a
// partida, com o outro de vencedor.
//
// As armas: o clique esquerdo ataca com a arma da mão (se tiver) quando não está com os poderes
// (a Leslie e o Grow no modo arma; o Anjo na forma base). Encostou numa arma no chão, pega —
// sozinho na hora; online pedindo ao servidor, que decide quem leva. Virando anjo ou golem com
// ela, ela cai no chão; o tempo dela acabando, quebra; a tecla E joga fora e ela some. Sozinho as
// quedas saem daqui; online, do servidor.
//
// O Vendaval do Grow sopra enquanto o botão esquerdo fica segurado: o seu para quando você
// solta; o da CPU quando o cérebro dela solta; o do outro online quando o estado dele chega sem
// ele soprando.

import {
  CARREGAMENTO_MS,
  CONTAGEM_MS,
  DURACAO_PARTIDA_MS,
  FURIA,
  HEROIS_LIBERADOS,
  MUNDO,
  VIDA_MAXIMA,
  type EstadoJogador,
  type Heroi,
  type Lado,
  type MotivoFim,
} from '@terna/compartilhado';
import {
  armaAoAlcance,
  armasNoChao,
  descartarArma,
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
  custoDeEnergia,
  formaDo,
  ganharEnergia,
  gesticular,
  maoDo,
  peitoDo,
  personagemLivre,
  podePegarArma,
  precisaLargarArma,
  trocarFormaNaMarra,
  usaPoderes,
  virarGolem,
  type Controles,
  type Personagem,
} from './entidades/personagem';
import {
  absorvidoDoQuePassou,
  ameacasPara,
  atualizarEfeitos,
  comecarRecarga,
  criarEfeitos,
  lancarPoder,
  avisar,
  mostrarCura,
  mostrarDano,
  pararVento,
  soprando,
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

const ENVIO_MS = 50; // manda o estado ~20 vezes por segundo enquanto se mexe…
const ENVIO_PARADO_MS = 200; // …~5 parado (nada a contar: economiza a banda do servidor)…
const ENVIO_MINIMO_MS = 33; // …e na hora em que um botão muda, mas nunca mais de ~30 por segundo
const CORRIGIR = 10; // quanto maior, mais rápido o corpo do outro alcança a posição recebida
const TELEPORTE = 64; // pixels de diferença a partir dos quais pula direto para lá
// Segundos: até quanto adivinha para onde ele andou desde que mandou o estado (a viagem pela
// rede, que o servidor mede, mais o tempo desde que chegou).
const EXTRAPOLAR_ATE = 0.3;
const FORMA_DIVERGE = 0.6; // segundos numa forma diferente da recebida até trocar
const REPEDIR_ARMA = 0.5; // segundos: pediu uma arma e o servidor não deu, pede de novo depois disso

const PARADO: Controles = { esquerda: false, direita: false, pular: false, transformar: false };

export type FimDaPartida = MotivoFim | 'conexao';

// O que o mouse fez desde o último quadro: quantas vezes o botão direito trocou o poder e, se o
// esquerdo foi clicado, onde (no mapa); se o esquerdo continua segurado (o Vendaval sopra enquanto
// isso). E se a tecla E foi apertada (jogar a arma fora).
export interface AcoesMouse {
  trocar: number;
  usar: { x: number; y: number } | null;
  segurando: boolean;
  descartar: boolean;
}

export const SEM_ACOES: AcoesMouse = { trocar: 0, usar: null, segurando: false, descartar: false };

interface Remoto {
  conexao: ConexaoPartida;
  controles: Controles;
  alvo: EstadoJogador | null;
  idadeAlvo: number; // segundos desde que o último estado chegou
  atraso: number; // segundos que o último estado levou de lá até aqui (medido pelo servidor)
  formaDiverge: number;
  ultimoEnvio: number; // performance.now() do último estado mandado
  enviados: Controles;
  vidaEnviada: number; // a vida no último estado mandado (mudou: manda sem esperar o intervalo parado)
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
  contagem: number; // segundos que faltam da contagem 3, 2, 1 (0 = já valendo)
  contagemInicial: number; // quanto dela havia quando a partida apareceu
  relogio: number; // segundos desde que a partida apareceu (a contagem inclusa)
  acabou: boolean;
  // No fim: quem venceu (null: sem vencedor, como no fim do tempo) e há quantos segundos acabou.
  fim: { vencedor: Personagem | null; ha: number } | null;
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
  const heroiDele = escolha.modo === 'online' ? escolha.heroiOponente : heroiDaCpu(escolha.heroi);
  // Online, o relógio conta do aviso de que começou (o carregamento e a contagem vêm antes): os
  // dois lados terminam a contagem juntos, mesmo se um abriu o mapa um pouco depois.
  const agora = performance.now();
  const valendo = escolha.modo === 'online' ? escolha.comecouEm + CARREGAMENTO_MS + CONTAGEM_MS : agora + CONTAGEM_MS;
  const p: Partida = {
    online: escolha.modo === 'online',
    jogador: criarPersonagem(escolha.heroi, meuX, meuLado),
    outro: criarPersonagem(heroiDele, dele, ladoDele),
    eu: { texto: escolha.nome, ...AZUL },
    ele: { texto: escolha.modo === 'online' ? escolha.oponente : 'CPU', ...VERMELHO },
    efeitos: criarEfeitos(),
    arsenal: criarArsenal(escolha.modo === 'solo'),
    restanteMs: escolha.modo === 'online' ? escolha.restanteMs : DURACAO_PARTIDA_MS,
    // Online, o fim do servidor vem depois da contagem.
    fimEm: valendo + (escolha.modo === 'online' ? escolha.restanteMs : DURACAO_PARTIDA_MS),
    menuAberto: false,
    contagem: Math.max(0, Math.min(CONTAGEM_MS, valendo - agora)) / 1000,
    contagemInicial: Math.max(0, Math.min(CONTAGEM_MS, valendo - agora)) / 1000,
    relogio: 0,
    acabou: false,
    fim: null,
    cpu: escolha.modo === 'solo' ? criarCerebroSosia(AO_LADO) : null,
    remoto: null,
    aoFim,
  };

  if (escolha.modo === 'online') {
    p.outro.daRede = true;
    const remoto: Remoto = {
      conexao: escolha.conexao,
      controles: { ...PARADO },
      alvo: null,
      idadeAlvo: 0,
      atraso: 0,
      formaDiverge: 0,
      ultimoEnvio: 0,
      enviados: { ...PARADO },
      vidaEnviada: VIDA_MAXIMA,
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
          remoto.atraso = (m.atraso ?? 0) / 1000;
          // Os dois toques de um dash podem ser rápidos demais para chegar como botões; a
          // velocidade dele chega, e aí o dash (com o rastro) começa aqui também.
          if (Math.abs(m.estado.vx) >= VELOCIDADE_DASH) comecarDash(p.outro, m.estado.vx > 0 ? 1 : -1);
          // A vida dele é ele quem decide: caiu, mostra o dano aqui — e o dano é seu (só você
          // bate nele), então é daqui que sai a sua energia pixy. A dele vem pronta.
          if (m.estado.vida < p.outro.vida) {
            const dano = p.outro.vida - m.estado.vida;
            // De golem, a pele de pedra dele segurou uma parte: mostra quanto.
            mostrarDano(p.efeitos, p.outro, dano, undefined, absorvidoDoQuePassou(p.outro, dano));
            ganharEnergia(p.jogador, dano);
          } else if (m.estado.vida > p.outro.vida && p.outro.vida > 0) {
            mostrarCura(p.efeitos, p.outro, m.estado.vida - p.outro.vida); // a Fúria da Floresta
          }
          p.outro.vida = m.estado.vida;
          p.outro.energia = m.estado.energia;
          p.outro.modo = m.estado.modo;
          p.outro.poderes.selecionado = m.estado.selecionado;
          // O encanto e as raízes dele também é ele quem decide; enfeitiçado, só pode ter sido
          // por você.
          p.outro.encanto = m.estado.encanto > 0 ? { resta: m.estado.encanto, dono: p.jogador } : null;
          p.outro.preso = m.estado.preso;
          p.outro.veneno = m.estado.veneno;
          p.outro.levado = m.estado.levado;
          p.outro.empurrao = m.estado.empurrao;
          if (!m.estado.canalizando) pararVento(p.efeitos, p.outro);
        }
        if (m.tipo === 'poder' && !p.acabou) {
          comecarRecarga(p.outro.poderes, m.uso.poder);
          if (m.uso.poder === 'golem') {
            virarGolem(p.outro);
          } else {
            gesticular(p.outro, { x: m.uso.alvoX, y: m.uso.alvoY }, m.uso.poder === 'julgamento');
            lancarPoder(p.efeitos, p.outro, m.uso);
            if (m.uso.poder === 'vento') p.outro.canalizando = true;
          }
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
        if (m.tipo === 'arma-descartada' && m.lado !== remoto.lado) descartarArma(p.arsenal, p.outro);
        if (m.tipo === 'fim') terminar(p, m.motivo, m.vencedor ? m.vencedor === remoto.lado : null);
      },
      // Caiu sem o servidor dizer que acabou: a rede de alguém caiu.
      () => terminar(p, 'conexao', null),
    );
  }
  return p;
}

// A CPU: um personagem sorteado entre os liberados que não é o seu (sobrando só o seu, o seu).
function heroiDaCpu(seu: Heroi): Heroi {
  const outros = HEROIS_LIBERADOS.filter((h) => h !== seu);
  return outros.length ? outros[Math.floor(Math.random() * outros.length)] : seu;
}

function terminar(p: Partida, motivo: FimDaPartida, venceu: boolean | null): void {
  if (p.acabou) return;
  p.acabou = true;
  p.fim = { vencedor: venceu === true ? p.jogador : venceu === false ? p.outro : null, ha: 0 };
  p.menuAberto = false;
  if (p.online) p.restanteMs = Math.max(0, p.fimEm - performance.now());
  p.aoFim(motivo, venceu);
}

// Saiu da partida (menu → Sair, ou voltou ao menu depois do fim).
// `fecharConexao`: online, sem ela a sala continua (a revanche usa a mesma conexão).
export function encerrarPartida(p: Partida, fecharConexao = true): void {
  p.acabou = true;
  if (fecharConexao) p.remoto?.conexao.fechar();
}

// Usa o poder escolhido de `corpo` mirando em `alvo`; saiu, vira para lá e volta o uso (para
// mandar pela rede).
function usarPoder(p: Partida, corpo: Personagem, alvo: { x: number; y: number }): void {
  const uso = tentarUsar(corpo.poderes, bloqueioDosPoderes(corpo), peitoDo(corpo), alvo);
  if (!uso) return;
  // Os poderes da Leslie e os do Grow de gente gastam energia (mais, quanto mais forte). A do
  // outro online chega pela rede, com a vida e a energia dele.
  if (!corpo.daRede) corpo.energia = Math.max(0, corpo.energia - custoDeEnergia(corpo, uso.poder));
  if (uso.poder === 'golem') {
    // O terceiro do Grow: vira golem (a pedra sobe do chão; nada sai da mão).
    virarGolem(corpo);
    if (corpo === p.jogador) p.remoto?.conexao.enviarPoder(uso);
    return;
  }
  // O braço estica na direção da mira e o poder sai da mão.
  gesticular(corpo, alvo, uso.poder === 'julgamento');
  const mao = maoDo(corpo);
  uso.x = Math.max(0, Math.min(MUNDO, mao.x));
  uso.y = mao.y;
  lancarPoder(p.efeitos, corpo, uso);
  if (uso.poder === 'vento') corpo.canalizando = true;
  // A Fúria da Floresta cura a Leslie.
  if (corpo.heroi === 'leslie' && !corpo.daRede) {
    if (uso.poder === 'furia') {
      const cura = Math.min(FURIA.cura, VIDA_MAXIMA - corpo.vida);
      corpo.vida += cura;
      if (cura > 0) mostrarCura(p.efeitos, corpo, cura);
    }
  }
  if (corpo === p.jogador) p.remoto?.conexao.enviarPoder(uso);
}

// O clique esquerdo: com os poderes na mão (a Leslie no modo poderes, o Anjo de anjo), o poder
// escolhido; senão, a arma da mão.
function usarAcao(p: Partida, corpo: Personagem, alvo: { x: number; y: number }): void {
  if (usaPoderes(corpo)) return usarPoder(p, corpo, alvo);
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
  p.relogio += dt;
  if (p.fim) p.fim.ha += dt;

  // A contagem: os dois parados (online, o estado segue indo e vindo), o relógio esperando.
  if (p.contagem > 0) {
    p.contagem = Math.max(0, p.contagem - dt);
    atualizarPersonagem(p.jogador, PARADO, dt, tempo);
    if (p.cpu) atualizarPersonagem(p.outro, PARADO, dt, tempo);
    if (p.remoto) {
      atualizarRemoto(p.remoto, p.outro, dt, tempo);
      enviarEstado(p.remoto, p.jogador, PARADO);
      p.restanteMs = Math.max(0, Math.min(p.restanteMs, p.fimEm - performance.now()));
    }
    return;
  }

  // A vida dos dois no começo do quadro: sozinho, o que cada um perdeu é energia pixy do outro.
  const vidas = [p.jogador.vida, p.outro.vida];
  const livre = !p.menuAberto && !p.acabou && p.jogador.vida > 0;
  if (livre) {
    for (let i = 0; i < mouse.trocar; i++) trocarPoder(p.jogador.poderes);
    if (mouse.usar) usarAcao(p, p.jogador, mouse.usar);
    if (mouse.descartar && descartarArma(p.arsenal, p.jogador)) p.remoto?.conexao.descartarArma();
  }
  // Soltou o botão (ou abriu o menu, ou caiu): o Vendaval para.
  if (p.jogador.canalizando && !(livre && mouse.segurando)) pararVento(p.efeitos, p.jogador);
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
    if (p.outro.canalizando && (!pode || decisao.soltar)) pararVento(p.efeitos, p.outro);
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
  // Sopra enquanto o Vendaval dele estiver no mapa.
  p.jogador.canalizando = soprando(p.efeitos, p.jogador);
  p.outro.canalizando = soprando(p.efeitos, p.outro);
  atualizarArsenal(p.arsenal, p.efeitos, dt, [p.jogador, p.outro], alvos);
  // Online, a energia do outro vem da rede e a sua sai da vida dele que chega (acima).
  if (!p.online) {
    ganharEnergia(p.outro, vidas[0] - p.jogador.vida);
    ganharEnergia(p.jogador, vidas[1] - p.outro.vida);
  }

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
  // No Salto e na Investida o corpo segue o caminho do golpe (o mesmo lá e aqui): sem correção.
  if (corpo.manobra) return;
  // Onde ele está agora: o estado é de quando saiu de lá; anda o que ele andou desde então.
  const adiantar = Math.min(r.idadeAlvo + r.atraso, EXTRAPOLAR_ATE);
  const alvoX = Math.max(0, Math.min(MUNDO, a.x + (a.vx + a.empurrao) * adiantar));
  if (corpo.levado > 0 || a.levado > 0) {
    // Carregado pela Revoada: a altura também vem de lá.
    const k = Math.min(1, dt * CORRIGIR * 1.5);
    corpo.x += (alvoX - corpo.x) * k;
    corpo.y += (a.y - corpo.y) * k;
    corpo.noChao = false;
  } else if (Math.abs(alvoX - corpo.x) > TELEPORTE || Math.abs(a.y - corpo.y) > TELEPORTE) {
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
  // Um toque rápido em R (ou o aviso do golem) pode se perder entre dois estados: se a forma dele
  // ficar diferente da recebida por um tempo, troca aqui também — mesmo com a recarga correndo
  // aqui, que pode estar um pouco atrás da dele.
  if (a.forma !== formaDo(corpo) && personagemLivre(corpo)) {
    r.formaDiverge += dt;
    if (r.formaDiverge > FORMA_DIVERGE) {
      trocarFormaNaMarra(corpo);
      r.formaDiverge = 0;
    }
  } else {
    r.formaDiverge = 0;
  }
}

const mudou = (a: Controles, b: Controles): boolean =>
  a.esquerda !== b.esquerda || a.direita !== b.direita || a.pular !== b.pular || a.transformar !== b.transformar;

// Os números vão arredondados: décimos de pixel e centésimos de segundo bastam, e a mensagem
// fica ~1/4 menor (é a banda do servidor que paga cada estado repassado).
const arredondar = (v: number, por: number): number => Math.round(v * por) / por;

// Parado no chão, sem botão nem empurrão e sem ter apanhado desde o último: nada de novo a contar.
const quieto = (corpo: Personagem, controles: Controles, vidaEnviada: number): boolean =>
  corpo.noChao &&
  corpo.vx === 0 &&
  corpo.empurrao === 0 &&
  !corpo.manobra &&
  !corpo.canalizando &&
  !controles.esquerda &&
  !controles.direita &&
  !controles.pular &&
  !controles.transformar &&
  corpo.vida === vidaEnviada;

// `agora`: manda já, sem esperar o intervalo (a vida chegou a 0 e vai junto com o aviso).
function enviarEstado(r: Remoto, corpo: Personagem, segurados: Controles, agora = false): void {
  r.apertados.pular ||= segurados.pular;
  r.apertados.transformar ||= segurados.transformar;
  const controles = { ...segurados, ...r.apertados };
  const instante = performance.now();
  const passou = instante - r.ultimoEnvio;
  const intervalo = quieto(corpo, controles, r.vidaEnviada) ? ENVIO_PARADO_MS : ENVIO_MS;
  if (!agora && passou < intervalo && !(mudou(controles, r.enviados) && passou >= ENVIO_MINIMO_MS)) return;
  r.ultimoEnvio = instante;
  r.enviados = controles;
  r.vidaEnviada = corpo.vida;
  r.apertados = { pular: false, transformar: false };
  r.conexao.enviar({
    x: arredondar(Math.max(0, Math.min(MUNDO, corpo.x)), 10),
    y: arredondar(corpo.y, 10),
    vx: arredondar(corpo.vx, 10),
    vy: arredondar(Math.max(-3000, Math.min(3000, corpo.vy)), 10),
    direcao: corpo.direcao,
    noChao: corpo.noChao,
    forma: formaDo(corpo),
    modo: corpo.modo,
    ...controles,
    vida: corpo.vida,
    selecionado: corpo.poderes.selecionado,
    encanto: arredondar(Math.min(10, corpo.encanto?.resta ?? 0), 100),
    preso: arredondar(Math.min(10, corpo.preso), 100),
    veneno: arredondar(Math.min(10, corpo.veneno), 100),
    levado: arredondar(Math.min(10, corpo.levado), 100),
    empurrao: arredondar(Math.max(-1000, Math.min(1000, corpo.empurrao)), 10),
    canalizando: corpo.canalizando,
    energia: arredondar(corpo.energia, 10),
  });
}
