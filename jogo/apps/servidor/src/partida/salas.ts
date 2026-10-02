import { randomInt } from 'node:crypto';
import {
  DADOS_ARMA,
  CARREGAMENTO_MS,
  CONTAGEM_MS,
  DURACAO_PARTIDA_MS,
  LETRAS_DO_CODIGO,
  LIBERADO,
  MensagemPartidaDoCliente,
  QUEDA_DE_ARMAS,
  TAMANHO_CODIGO,
  VIDA_MAXIMA,
  cabeOutraArma,
  sortearArma,
  sortearIntervaloDeArma,
  type ArmaNoMapa,
  type Heroi,
  type Lado,
  type TipoArma,
  type MensagemPartidaDoServidor,
  type MotivoFim,
  type PartidaNaRede,
  type ServidorIce,
} from '@terna/compartilhado';
import type { Conexao } from '../tempo-real/sala';

// Salas de partida 1v1, sem conta: quem cria recebe um código; quem entra com ele completa a
// sala. Hospedando na mesma rede, a sala guarda a rede de quem hospedou (rede.ts): ela aparece
// na lista de quem está nessa rede e só entra quem está nela. Em toda sala os dois tentam se ligar
// direto (WebRTC), com o servidor levando os recados (`sinal`) até a ligação abrir: na mesma rede
// pelos endereços da própria rede; pela internet (`internet`), descobrindo o endereço de fora com
// um servidor STUN. Ligados direto, o estado, os poderes e os golpes não fazem a volta pelo
// servidor (que fica nos Estados Unidos): de um jogador a outro no Brasil, o atraso cai muito.
// Com os dois lá, cada um escolhe o personagem (`escolher` → `heroi`), e cada personagem é de um
// só: o que um escolhe o outro vê na hora (`oponente-escolheu`) e não pode pegar — os dois pedindo
// o mesmo juntos, leva quem chegou primeiro. Até o outro escolher, dá para trocar (mandando de
// novo) por um que esteja livre. Com as duas escolhas a partida começa; acabando o tempo de
// escolher antes (`escolhaMaxMs`), ninguém entra no jogo e a sala cai. Alguém saindo da sala — na
// escolha ou na partida —, ela também cai para o outro. O
// servidor marca o tempo (a partida acaba para os dois ao mesmo tempo) e só repassa o estado de
// um jogador para o outro — cada um simula o próprio personagem —, dizendo quanto ele demorou
// para chegar (o ping de cada um vem do batimento: batimento.ts).
//
// As armas também são daqui: o servidor sorteia quando e onde cada uma cai (as mesmas para os
// dois) e decide quem pega — os dois encostando juntos numa, só o primeiro pedido leva.

// Estados por segundo que um jogador pode mandar; o excesso é ignorado (o próximo estado já é mais
// novo). O cliente manda até ~30 andando (5 parado) e uns a mais quando um botão muda.
const LIMITE_DE_ESTADOS = 60;
// Tudo o mais (poderes, golpes, armas, a vida, a morte) nunca é jogado fora pelo limite dos estados:
// perder um golpe era o dano que não contava. Só um teto bem alto, contra quem manda lixo sem parar.
// Depois de um engasgo da rede, o que ficou preso chega de uma vez: a folga é para isso.
const LIMITE_POR_SEGUNDO = 300;

// Bytes esperando para sair na conexão de quem recebe a partir dos quais um estado novo não entra
// na fila: a conexão dele está engasgada, e o próximo estado (50 ms depois) já é mais novo que
// este. Poderes, golpes e armas sempre entram: esses não se repetem.
const FILA_MAXIMA = 16 * 1024;

// Quanto cada medida nova do ping pesa no atraso guardado (o resto é o que já se sabia): um ping
// mais lento de vez em quando não sacode o boneco do outro.
const PESO_DO_PING = 0.3;

export interface OpcoesSalas {
  duracaoMs: number;
  // O que vem antes do relógio: a tela de carregamento da temporada e a contagem 3, 2, 1 (as
  // armas e o fim esperam por elas).
  contagemMs: number;
  // Depois do fim, quanto tempo a sala espera os dois pedirem a revanche antes de fechar.
  revancheMaxMs: number;
  // Quanto tempo uma sala espera o segundo jogador antes de fechar.
  esperaMaxMs: number;
  // Quanto tempo os dois têm para escolher o personagem (acabou sem os dois escolherem, a sala cai).
  escolhaMaxMs: number;
  // Salas abertas ao mesmo tempo (protege a memória do servidor grátis).
  maxSalas: number;
  gerarCodigo: () => string;
  // Das quedas de arma: até a primeira tentativa e o sorteio (de 0 a 1) de qual, onde e quando.
  primeiraArmaMs: number;
  aleatorio: () => number;
  // Os servidores de retransmissão (TURN) do momento, para a ligação direta que não abre
  // (turn.ts); null: sem eles, só o STUN.
  ice: () => ServidorIce[] | null;
}

export function codigoAleatorio(): string {
  return Array.from({ length: TAMANHO_CODIGO }, () => LETRAS_DO_CODIGO[randomInt(LETRAS_DO_CODIGO.length)]).join('');
}

const PADRAO: OpcoesSalas = {
  duracaoMs: DURACAO_PARTIDA_MS,
  contagemMs: CARREGAMENTO_MS + CONTAGEM_MS,
  revancheMaxMs: 3 * 60 * 1000,
  esperaMaxMs: 10 * 60 * 1000,
  escolhaMaxMs: 90 * 1000,
  maxSalas: 500,
  gerarCodigo: codigoAleatorio,
  primeiraArmaMs: QUEDA_DE_ARMAS.primeira * 1000,
  aleatorio: Math.random,
  ice: () => null,
};

// As armas da sala: as que estão no chão (pelo número) e a que cada um tem na mão.
interface ArmasDaSala {
  chao: Map<number, ArmaNoMapa>;
  mao: Record<Lado, TipoArma | null>;
  proximoId: number;
  timer: ReturnType<typeof setTimeout> | null; // a próxima tentativa de queda
}

interface SalaPartida {
  codigo: string;
  rede: string | null; // hospedada na mesma rede: a de quem hospedou (null: sala com código)
  dono: string | null; // a aba do jogo de quem hospedou (IdDaAba): a lista dela não mostra esta
  anfitriao: Participante;
  convidado: Participante | null;
  timer: ReturnType<typeof setTimeout>; // espera o convidado; depois, a escolha; depois, o fim do tempo
  armas: ArmasDaSala;
  herois: Record<Lado, Heroi | null>; // a escolha de cada um, antes de começar
  // esperando o convidado → escolhendo os personagens → jogando → no fim (a revanche volta para a
  // escolha).
  fase: 'esperando' | 'escolher' | 'jogando' | 'fim';
  revanche: Record<Lado, boolean>; // no fim: quem já pediu para jogar de novo
  vidas: Record<Lado, number>; // a última vida que cada um avisou (no fim por tempo, ganha a maior)
}

// Uma conexão dentro de uma sala. A rota guarda e devolve em `receber` e `sair`.
export interface Participante {
  nome: string;
  conexao: Conexao;
  sala: SalaPartida;
  janela: number; // segundo atual (para o limite)
  mensagens: number; // mensagens neste segundo
  estados: number; // estados neste segundo
  latencia: number; // ms daqui até ele: metade da ida e volta do ping, suavizada (0 = sem medida ainda)
  idaEVolta: number; // ms da última ida e volta medida (o ping que ele vê na tela)
}

function novoParticipante(nome: string, conexao: Conexao, sala: SalaPartida): Participante {
  return { nome, conexao, sala, janela: 0, mensagens: 0, estados: 0, latencia: 0, idaEVolta: 0 };
}

export class Salas {
  private salas = new Map<string, SalaPartida>();
  private opcoes: OpcoesSalas;

  constructor(opcoes: Partial<OpcoesSalas> = {}) {
    this.opcoes = { ...PADRAO, ...opcoes };
  }

  get quantidade(): number {
    return this.salas.size;
  }

  // `rede`: hospedando na mesma rede (a sala aparece em naRede e só entra quem está nela).
  // `dono`: a aba de quem hospedou (a lista dela não mostra esta sala).
  criar(nome: string, conexao: Conexao, rede: string | null = null, dono: string | null = null): Participante | null {
    if (this.salas.size >= this.opcoes.maxSalas) {
      return this.recusar(conexao, 'o servidor está cheio agora; tente de novo daqui a pouco');
    }
    let codigo = this.opcoes.gerarCodigo();
    for (let tentativa = 0; this.salas.has(codigo) && tentativa < 20; tentativa++) codigo = this.opcoes.gerarCodigo();
    if (this.salas.has(codigo)) return this.recusar(conexao, 'não consegui criar a sala; tente de novo');

    const sala = {
      codigo,
      rede,
      dono,
      convidado: null,
      armas: { chao: new Map(), mao: { anfitriao: null, convidado: null }, proximoId: 1, timer: null },
      herois: { anfitriao: null, convidado: null },
      fase: 'esperando',
      revanche: { anfitriao: false, convidado: false },
      vidas: { anfitriao: VIDA_MAXIMA, convidado: VIDA_MAXIMA },
    } as SalaPartida;
    sala.anfitriao = novoParticipante(nome, conexao, sala);
    sala.timer = setTimeout(() => this.fechar(sala, 'ninguém entrou na sala a tempo'), this.opcoes.esperaMaxMs);
    this.salas.set(codigo, sala);
    this.mandar(conexao, { tipo: 'sala-criada', codigo });
    return sala.anfitriao;
  }

  // `rede`: a de quem entra. A partida hospedada numa rede só aceita quem está nela (de fora, ela
  // nem existe: a mesma resposta de código errado).
  entrar(codigo: string, nome: string, conexao: Conexao, rede: string | null = null): Participante | null {
    const sala = this.salas.get(codigo);
    if (!sala || (sala.rede !== null && sala.rede !== rede)) return this.recusar(conexao, 'não achei essa sala; confira o código');
    if (sala.convidado) return this.recusar(conexao, 'essa sala já está cheia');

    const convidado = novoParticipante(nome, conexao, sala);
    sala.convidado = convidado;
    this.abrirEscolha(sala);
    return convidado;
  }

  // As partidas hospedadas em `rede` esperando alguém entrar, menos as da aba `eu`: quem
  // hospedou não vê a própria (nem logo depois de cancelar, antes de a sala fechar aqui).
  naRede(rede: string, eu?: string): PartidaNaRede[] {
    const partidas: PartidaNaRede[] = [];
    for (const sala of this.salas.values()) {
      if (sala.rede !== rede || sala.fase !== 'esperando' || sala.convidado) continue;
      if (eu && sala.dono === eu) continue;
      partidas.push({ codigo: sala.codigo, anfitriao: sala.anfitriao.nome });
    }
    return partidas;
  }

  // Com os dois na sala (ao entrar, ou os dois pedindo a revanche): cada um escolhe o personagem.
  private abrirEscolha(sala: SalaPartida): void {
    const convidado = sala.convidado;
    if (!convidado) return;
    sala.fase = 'escolher';
    sala.herois = { anfitriao: null, convidado: null };
    sala.revanche = { anfitriao: false, convidado: false };
    clearTimeout(sala.timer);
    sala.timer = setTimeout(() => this.acabouAEscolha(sala), this.opcoes.escolhaMaxMs);
    // Os dois tentam a ligação direta (quem hospedou começa); pela internet, com o STUN. Com o
    // TURN, se ela não abrir direto, passa pelo servidor de retransmissão perto dos dois.
    const ice = this.opcoes.ice();
    const direto = {
      direto: true,
      ...(sala.rede === null ? { internet: true } : {}),
      ...(ice ? { ice } : {}),
    };
    const prazoMs = this.opcoes.escolhaMaxMs;
    this.mandar(sala.anfitriao.conexao, { tipo: 'escolher', lado: 'anfitriao', oponente: convidado.nome, prazoMs, ...direto });
    this.mandar(convidado.conexao, { tipo: 'escolher', lado: 'convidado', oponente: sala.anfitriao.nome, prazoMs, ...direto });
  }

  // O tempo de escolher acabou sem os dois escolherem (os dois escolhendo, a partida já teria
  // começado): ninguém entra no jogo e a sala cai, dizendo a cada um quem não escolheu.
  private acabouAEscolha(sala: SalaPartida): void {
    const convidado = sala.convidado;
    if (sala.fase !== 'escolher' || !convidado || this.salas.get(sala.codigo) !== sala) return;
    this.salas.delete(sala.codigo);
    const faltou = (lado: Lado, outro: Participante): string =>
      sala.herois[lado] ? `${outro.nome} não escolheu o personagem a tempo` : 'você não escolheu o personagem a tempo';
    this.recusar(sala.anfitriao.conexao, faltou('anfitriao', convidado));
    this.recusar(convidado.conexao, faltou('convidado', sala.anfitriao));
  }

  // Os dois escolheram: a partida começa, com o relógio todo.
  private comecar(sala: SalaPartida): void {
    const convidado = sala.convidado;
    const { anfitriao: heroiAnfitriao, convidado: heroiConvidado } = sala.herois;
    if (sala.fase !== 'escolher' || !convidado || !heroiAnfitriao || !heroiConvidado || this.salas.get(sala.codigo) !== sala) return;
    sala.fase = 'jogando';
    // As armas da rodada anterior não passam para esta.
    sala.armas.chao.clear();
    sala.armas.mao = { anfitriao: null, convidado: null };
    sala.vidas = { anfitriao: VIDA_MAXIMA, convidado: VIDA_MAXIMA };
    const herois: Record<Lado, Heroi> = { anfitriao: heroiAnfitriao, convidado: heroiConvidado };
    clearTimeout(sala.timer);
    // O carregamento e a contagem 3, 2, 1 vêm antes do relógio: o fim é depois deles (`restanteMs`
    // é o relógio).
    sala.timer = setTimeout(() => this.acabouOTempo(sala), this.opcoes.contagemMs + this.opcoes.duracaoMs);
    const restanteMs = this.opcoes.duracaoMs;
    this.mandar(sala.anfitriao.conexao, {
      tipo: 'comecou',
      lado: 'anfitriao',
      oponente: convidado.nome,
      restanteMs,
      heroi: herois.anfitriao,
      heroiOponente: herois.convidado,
    });
    this.mandar(convidado.conexao, {
      tipo: 'comecou',
      lado: 'convidado',
      oponente: sala.anfitriao.nome,
      restanteMs,
      heroi: herois.convidado,
      heroiOponente: herois.anfitriao,
    });
    this.agendarArma(sala, this.opcoes.contagemMs + this.opcoes.primeiraArmaMs);
  }

  // O batimento (batimento.ts) mediu a ida e a volta até ele. Com os dois na sala, cada um fica
  // sabendo do próprio ping e do outro (`rede`): é o que a tela da partida mostra.
  medirPing(p: Participante, idaEVoltaMs: number): void {
    const ida = idaEVoltaMs / 2;
    p.latencia = p.latencia ? p.latencia + (ida - p.latencia) * PESO_DO_PING : ida;
    p.idaEVolta = idaEVoltaMs;
    const { sala } = p;
    const outro = p === sala.anfitriao ? sala.convidado : sala.anfitriao;
    if (!outro || this.salas.get(sala.codigo) !== sala) return;
    const ms = (v: number): number => Math.min(10_000, Math.round(v));
    this.mandar(p.conexao, { tipo: 'rede', ping: ms(p.idaEVolta), pingOponente: ms(outro.idaEVolta) });
  }

  receber(p: Participante, texto: string): void {
    const { sala } = p;
    if (this.salas.get(sala.codigo) !== sala || !sala.convidado) return;
    const segundo = Math.floor(Date.now() / 1000);
    if (segundo !== p.janela) {
      p.janela = segundo;
      p.mensagens = 0;
      p.estados = 0;
    }
    if (++p.mensagens > LIMITE_POR_SEGUNDO) return;

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return this.mandar(p.conexao, { tipo: 'erro', erro: 'mensagem não é JSON' });
    }
    const mensagem = MensagemPartidaDoCliente.safeParse(json);
    if (!mensagem.success) return this.mandar(p.conexao, { tipo: 'erro', erro: 'mensagem inválida' });
    const outro = p === sala.anfitriao ? sala.convidado : sala.anfitriao;
    const lado: Lado = p === sala.anfitriao ? 'anfitriao' : 'convidado';
    const { armas } = sala;
    const m = mensagem.data;
    // Os recados da ligação direta passam em qualquer fase.
    if (m.tipo === 'sinal') return this.mandar(outro.conexao, { tipo: 'sinal', sinal: m.sinal });
    // Na escolha, só vale o personagem; no fim, só o pedido de revanche; jogando, o resto.
    if (m.tipo === 'heroi') {
      if (sala.fase !== 'escolher') return;
      if (!LIBERADO[m.heroi]) return this.mandar(p.conexao, { tipo: 'erro', erro: 'esse personagem ainda não está liberado' });
      // Já é do outro (os dois pediram juntos e o dele chegou antes): não vale, e quem pediu fica
      // sabendo de novo qual é o do outro, para escolher outro.
      const doOutro = sala.herois[lado === 'anfitriao' ? 'convidado' : 'anfitriao'];
      if (m.heroi === doOutro) return this.mandar(p.conexao, { tipo: 'oponente-escolheu', heroi: doOutro });
      if (m.heroi === sala.herois[lado]) return;
      // Mandando outro, troca (o outro ainda não escolheu: senão a partida já teria começado).
      sala.herois[lado] = m.heroi;
      if (sala.herois.anfitriao && sala.herois.convidado) return this.comecar(sala);
      // O outro vê na hora qual foi, e esse fica bloqueado para ele.
      return this.mandar(outro.conexao, { tipo: 'oponente-escolheu', heroi: m.heroi });
    }
    if (m.tipo === 'revanche') {
      if (sala.fase !== 'fim' || sala.revanche[lado]) return;
      sala.revanche[lado] = true;
      if (sala.revanche.anfitriao && sala.revanche.convidado) return this.abrirEscolha(sala);
      return this.mandar(outro.conexao, { tipo: 'revanche' });
    }
    if (sala.fase !== 'jogando') return;
    switch (m.tipo) {
      case 'estado':
        if (++p.estados > LIMITE_DE_ESTADOS || (outro.conexao.bufferedAmount ?? 0) > FILA_MAXIMA) return;
        // `atraso`: quanto tempo o estado levou de lá até o outro (a ida de quem mandou mais a de
        // quem recebe): o outro adianta a posição por isso.
        return this.mandar(outro.conexao, { tipo: 'estado', estado: m.estado, atraso: Math.min(5000, Math.round(p.latencia + outro.latencia)) });
      case 'poder':
        return this.mandar(outro.conexao, { tipo: 'poder', uso: m.uso });
      case 'golpe':
        return this.mandar(outro.conexao, { tipo: 'golpe', uso: m.uso });
      case 'pegar-arma': {
        // Já tem uma na mão, ou a arma já foi (o outro pegou antes): não leva.
        const arma = armas.chao.get(m.id);
        if (!arma || armas.mao[lado]) return;
        armas.chao.delete(m.id);
        armas.mao[lado] = arma.tipo;
        return this.mandarAosDois(sala, { tipo: 'arma-pega', id: m.id, lado });
      }
      case 'largar-arma': {
        const tipo = armas.mao[lado];
        if (!tipo) return;
        armas.mao[lado] = null;
        const arma: ArmaNoMapa = { id: armas.proximoId++, tipo, x: m.x, durabilidade: m.durabilidade, de: lado };
        armas.chao.set(arma.id, arma);
        return this.mandarAosDois(sala, { tipo: 'arma-caiu', arma });
      }
      case 'arma-quebrou':
        if (!armas.mao[lado]) return;
        armas.mao[lado] = null;
        return this.mandar(outro.conexao, { tipo: 'arma-quebrou', lado });
      case 'descartar-arma':
        if (!armas.mao[lado]) return;
        armas.mao[lado] = null;
        return this.mandar(outro.conexao, { tipo: 'arma-descartada', lado });
      case 'morri':
        return this.encerrar(sala, 'morte', undefined, outro === sala.anfitriao ? 'anfitriao' : 'convidado');
      case 'vida':
        sala.vidas[lado] = m.vida;
        return;
    }
  }

  // A próxima tentativa de queda. Na hora, só cai se couber (poucas no chão e no mapa); cabendo
  // ou não, agenda a seguinte.
  private agendarArma(sala: SalaPartida, emMs: number): void {
    sala.armas.timer = setTimeout(() => {
      const { armas } = sala;
      const naMao = Number(Boolean(armas.mao.anfitriao)) + Number(Boolean(armas.mao.convidado));
      if (cabeOutraArma(armas.chao.size, naMao)) {
        const { tipo, x } = sortearArma(this.opcoes.aleatorio);
        const arma: ArmaNoMapa = { id: armas.proximoId++, tipo, x, durabilidade: DADOS_ARMA[tipo].durabilidade };
        armas.chao.set(arma.id, arma);
        this.mandarAosDois(sala, { tipo: 'arma-caiu', arma });
      }
      this.agendarArma(sala, sortearIntervaloDeArma(this.opcoes.aleatorio) * 1000);
    }, emMs);
  }

  private mandarAosDois(sala: SalaPartida, mensagem: MensagemPartidaDoServidor): void {
    this.mandar(sala.anfitriao.conexao, mensagem);
    if (sala.convidado) this.mandar(sala.convidado.conexao, mensagem);
  }

  // A conexão fechou (saiu da partida, fechou a aba, caiu a rede).
  sair(p: Participante): void {
    const { sala } = p;
    if (this.salas.get(sala.codigo) !== sala) return; // a sala já acabou
    if (sala.convidado) return this.encerrar(sala, 'oponente-saiu', p);
    clearTimeout(sala.timer);
    this.salas.delete(sala.codigo);
  }

  // O relógio zerou: vence quem tiver mais vida (a última que cada um avisou); igual, empate.
  private acabouOTempo(sala: SalaPartida): void {
    const { anfitriao, convidado } = sala.vidas;
    const vencedor: Lado | undefined = anfitriao > convidado ? 'anfitriao' : convidado > anfitriao ? 'convidado' : undefined;
    this.encerrar(sala, 'tempo', undefined, vencedor);
  }

  // Termina a partida e avisa os dois. Por tempo ou morte a sala fica aberta um tempo, para a
  // revanche; alguém saindo, ela fecha junto com as conexões.
  private encerrar(sala: SalaPartida, motivo: MotivoFim, quemSaiu?: Participante, vencedor?: Lado): void {
    clearTimeout(sala.timer);
    if (sala.armas.timer) clearTimeout(sala.armas.timer);
    sala.armas.timer = null;
    if (motivo !== 'oponente-saiu') {
      sala.fase = 'fim';
      sala.revanche = { anfitriao: false, convidado: false };
      this.mandarAosDois(sala, vencedor ? { tipo: 'fim', motivo, vencedor } : { tipo: 'fim', motivo });
      sala.timer = setTimeout(() => this.fecharDepoisDoFim(sala), this.opcoes.revancheMaxMs);
      return;
    }
    this.salas.delete(sala.codigo);
    for (const p of [sala.anfitriao, sala.convidado]) {
      if (!p || p === quemSaiu) continue;
      this.mandar(p.conexao, vencedor ? { tipo: 'fim', motivo, vencedor } : { tipo: 'fim', motivo });
      p.conexao.close(1000, 'fim da partida');
    }
  }

  // Ninguém pediu a revanche a tempo: a sala fecha.
  private fecharDepoisDoFim(sala: SalaPartida): void {
    this.salas.delete(sala.codigo);
    for (const p of [sala.anfitriao, sala.convidado]) if (p) this.recusar(p.conexao, 'a sala fechou');
  }

  // Fecha uma sala que ainda não começou.
  private fechar(sala: SalaPartida, erro: string): void {
    clearTimeout(sala.timer);
    this.salas.delete(sala.codigo);
    this.recusar(sala.anfitriao.conexao, erro);
  }

  private recusar(conexao: Conexao, erro: string): null {
    this.mandar(conexao, { tipo: 'erro', erro });
    conexao.close(4000, erro);
    return null;
  }

  private mandar(conexao: Conexao, mensagem: MensagemPartidaDoServidor): void {
    conexao.send(JSON.stringify(mensagem));
  }
}
