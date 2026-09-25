// Uma partida: você e o outro no mapa, com o tempo correndo. Sozinho, o outro é a CPU (o sósia
// de sempre) e o tempo é daqui — o menu pausa tudo. Online, o outro é o personagem de quem
// entrou na sala: cada um simula o próprio e manda botões + posição; aqui o corpo dele anda com
// os mesmos botões (pula, plana, vira anjo igual) e a posição é corrigida aos poucos. O tempo
// online é do servidor: o fim chega por mensagem, ao mesmo tempo para os dois.

import { DURACAO_PARTIDA_MS, MUNDO, type EstadoJogador, type MotivoFim } from '@terna/compartilhado';
import { alternarForma, transformando } from './entidades/anjo';
import { atualizarPersonagem, criarPersonagem, formaDo, type Controles, type Personagem } from './entidades/personagem';
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

const PARADO: Controles = { esquerda: false, direita: false, pular: false, transformar: false };

export type FimDaPartida = MotivoFim | 'conexao';

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
}

export interface Partida {
  online: boolean;
  jogador: Personagem;
  outro: Personagem;
  eu: Identidade;
  ele: Identidade;
  // Sozinho: ms que faltam (para no menu). Online: quando acaba, em performance.now().
  restanteMs: number;
  fimEm: number;
  menuAberto: boolean;
  acabou: boolean;
  cpu: CerebroSosia | null;
  remoto: Remoto | null;
  aoFim: (motivo: FimDaPartida) => void;
}

export function criarPartida(escolha: Escolha, aoFim: (motivo: FimDaPartida) => void): Partida {
  const convidado = escolha.modo === 'online' && escolha.lado === 'convidado';
  const [meuX, meuLado, dele, ladoDele] = convidado ? [AO_LADO, -1, MEIO, 1] as const : [MEIO, 1, AO_LADO, -1] as const;
  const p: Partida = {
    online: escolha.modo === 'online',
    jogador: criarPersonagem(meuX, meuLado),
    outro: criarPersonagem(dele, ladoDele),
    eu: { texto: escolha.nome, ...AZUL },
    ele: { texto: escolha.modo === 'online' ? escolha.oponente : 'CPU', ...VERMELHO },
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
    };
    p.remoto = remoto;
    escolha.conexao.ouvir(
      (m) => {
        if (m.tipo === 'estado') {
          const { esquerda, direita, pular, transformar } = m.estado;
          remoto.controles = { esquerda, direita, pular, transformar };
          remoto.alvo = m.estado;
          remoto.idadeAlvo = 0;
        }
        if (m.tipo === 'fim') terminar(p, m.motivo);
      },
      // Caiu sem o servidor dizer que acabou: a rede de alguém caiu.
      () => terminar(p, 'conexao'),
    );
  }
  return p;
}

function terminar(p: Partida, motivo: FimDaPartida): void {
  if (p.acabou) return;
  p.acabou = true;
  p.menuAberto = false;
  if (p.online) p.restanteMs = Math.max(0, p.fimEm - performance.now());
  p.aoFim(motivo);
}

// Saiu da partida (menu → Sair, ou voltou ao menu depois do fim).
export function encerrarPartida(p: Partida): void {
  p.acabou = true;
  p.remoto?.conexao.fechar();
}

export function atualizarPartida(p: Partida, teclado: Controles, dt: number, tempo: number): void {
  // Sozinho com o menu aberto: tudo parado, inclusive o tempo.
  if (!p.online && p.menuAberto) return;

  const meus = p.menuAberto || p.acabou ? PARADO : teclado;
  atualizarPersonagem(p.jogador, meus, dt, tempo);
  if (p.cpu) atualizarPersonagem(p.outro, p.acabou ? PARADO : pensarSosia(p.cpu, p.outro, dt), dt, tempo);
  if (p.remoto) {
    atualizarRemoto(p.remoto, p.outro, dt, tempo);
    if (!p.acabou) enviarEstado(p.remoto, p.jogador, meus);
  }

  if (p.acabou) return;
  if (p.online) {
    // O fim chega do servidor; aqui o relógio só mostra quanto falta.
    p.restanteMs = Math.max(0, p.fimEm - performance.now());
  } else {
    p.restanteMs = Math.max(0, p.restanteMs - dt * 1000);
    if (p.restanteMs === 0) terminar(p, 'tempo');
  }
}

function atualizarRemoto(r: Remoto, corpo: Personagem, dt: number, tempo: number): void {
  atualizarPersonagem(corpo, r.controles, dt, tempo);
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
  // recebida por um tempo, troca aqui também.
  if (a.forma !== formaDo(corpo) && !transformando(corpo.anjo)) {
    r.formaDiverge += dt;
    if (r.formaDiverge > FORMA_DIVERGE) {
      alternarForma(corpo.anjo);
      r.formaDiverge = 0;
    }
  } else {
    r.formaDiverge = 0;
  }
}

const mudou = (a: Controles, b: Controles): boolean =>
  a.esquerda !== b.esquerda || a.direita !== b.direita || a.pular !== b.pular || a.transformar !== b.transformar;

function enviarEstado(r: Remoto, corpo: Personagem, segurados: Controles): void {
  r.apertados.pular ||= segurados.pular;
  r.apertados.transformar ||= segurados.transformar;
  const controles = { ...segurados, ...r.apertados };
  const agora = performance.now();
  const passou = agora - r.ultimoEnvio;
  if (passou < ENVIO_MS && !(mudou(controles, r.enviados) && passou >= ENVIO_MINIMO_MS)) return;
  r.ultimoEnvio = agora;
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
  });
}
