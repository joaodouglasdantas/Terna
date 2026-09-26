import { randomInt } from 'node:crypto';
import {
  DADOS_ARMA,
  DURACAO_PARTIDA_MS,
  LETRAS_DO_CODIGO,
  MensagemPartidaDoCliente,
  QUEDA_DE_ARMAS,
  TAMANHO_CODIGO,
  cabeOutraArma,
  sortearArma,
  sortearIntervaloDeArma,
  type ArmaNoMapa,
  type Lado,
  type TipoArma,
  type MensagemPartidaDoServidor,
  type MotivoFim,
} from '@terna/compartilhado';
import type { Conexao } from '../tempo-real/sala';

// Salas de partida 1v1, sem conta: quem cria recebe um código; quem entra com ele começa a
// partida. O servidor marca o tempo (a partida acaba para os dois ao mesmo tempo) e só repassa
// o estado de um jogador para o outro — cada um simula o próprio personagem.
//
// As armas também são daqui: o servidor sorteia quando e onde cada uma cai (as mesmas para os
// dois) e decide quem pega — os dois encostando juntos numa, só o primeiro pedido leva.

// Mensagens por segundo que um jogador pode mandar; o excesso é ignorado. O cliente manda ~10
// estados (até 15, com botões mudando), uns poucos golpes de arma e, raramente, um poder ou um
// pedido de arma — a folga é para ele não se perder.
const LIMITE_POR_SEGUNDO = 30;

export interface OpcoesSalas {
  duracaoMs: number;
  // Quanto tempo uma sala espera o segundo jogador antes de fechar.
  esperaMaxMs: number;
  // Salas abertas ao mesmo tempo (protege a memória do servidor grátis).
  maxSalas: number;
  gerarCodigo: () => string;
  // Das quedas de arma: até a primeira tentativa e o sorteio (de 0 a 1) de qual, onde e quando.
  primeiraArmaMs: number;
  aleatorio: () => number;
}

export function codigoAleatorio(): string {
  return Array.from({ length: TAMANHO_CODIGO }, () => LETRAS_DO_CODIGO[randomInt(LETRAS_DO_CODIGO.length)]).join('');
}

const PADRAO: OpcoesSalas = {
  duracaoMs: DURACAO_PARTIDA_MS,
  esperaMaxMs: 10 * 60 * 1000,
  maxSalas: 500,
  gerarCodigo: codigoAleatorio,
  primeiraArmaMs: QUEDA_DE_ARMAS.primeira * 1000,
  aleatorio: Math.random,
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
  anfitriao: Participante;
  convidado: Participante | null;
  timer: ReturnType<typeof setTimeout>; // espera o convidado; depois, o fim do tempo
  armas: ArmasDaSala;
}

// Uma conexão dentro de uma sala. A rota guarda e devolve em `receber` e `sair`.
export interface Participante {
  nome: string;
  conexao: Conexao;
  sala: SalaPartida;
  janela: number; // segundo atual (para o limite)
  mensagens: number; // mensagens neste segundo
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

  criar(nome: string, conexao: Conexao): Participante | null {
    if (this.salas.size >= this.opcoes.maxSalas) {
      return this.recusar(conexao, 'o servidor está cheio agora; tente de novo daqui a pouco');
    }
    let codigo = this.opcoes.gerarCodigo();
    for (let tentativa = 0; this.salas.has(codigo) && tentativa < 20; tentativa++) codigo = this.opcoes.gerarCodigo();
    if (this.salas.has(codigo)) return this.recusar(conexao, 'não consegui criar a sala; tente de novo');

    const sala = {
      codigo,
      convidado: null,
      armas: { chao: new Map(), mao: { anfitriao: null, convidado: null }, proximoId: 1, timer: null },
    } as SalaPartida;
    sala.anfitriao = { nome, conexao, sala, janela: 0, mensagens: 0 };
    sala.timer = setTimeout(() => this.fechar(sala, 'ninguém entrou na sala a tempo'), this.opcoes.esperaMaxMs);
    this.salas.set(codigo, sala);
    this.mandar(conexao, { tipo: 'sala-criada', codigo });
    return sala.anfitriao;
  }

  entrar(codigo: string, nome: string, conexao: Conexao): Participante | null {
    const sala = this.salas.get(codigo);
    if (!sala) return this.recusar(conexao, 'não achei essa sala; confira o código');
    if (sala.convidado) return this.recusar(conexao, 'essa sala já está cheia');

    const convidado: Participante = { nome, conexao, sala, janela: 0, mensagens: 0 };
    sala.convidado = convidado;
    clearTimeout(sala.timer);
    sala.timer = setTimeout(() => this.encerrar(sala, 'tempo'), this.opcoes.duracaoMs);
    const restanteMs = this.opcoes.duracaoMs;
    this.mandar(sala.anfitriao.conexao, { tipo: 'comecou', lado: 'anfitriao', oponente: nome, restanteMs });
    this.mandar(conexao, { tipo: 'comecou', lado: 'convidado', oponente: sala.anfitriao.nome, restanteMs });
    this.agendarArma(sala, this.opcoes.primeiraArmaMs);
    return convidado;
  }

  receber(p: Participante, texto: string): void {
    const { sala } = p;
    if (this.salas.get(sala.codigo) !== sala || !sala.convidado) return;
    const segundo = Math.floor(Date.now() / 1000);
    if (segundo !== p.janela) {
      p.janela = segundo;
      p.mensagens = 0;
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
    switch (m.tipo) {
      case 'estado':
        return this.mandar(outro.conexao, { tipo: 'estado', estado: m.estado });
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

  // Termina a partida: avisa quem ainda está nela e fecha as conexões.
  private encerrar(sala: SalaPartida, motivo: MotivoFim, quemSaiu?: Participante, vencedor?: Lado): void {
    clearTimeout(sala.timer);
    if (sala.armas.timer) clearTimeout(sala.armas.timer);
    this.salas.delete(sala.codigo);
    for (const p of [sala.anfitriao, sala.convidado]) {
      if (!p || p === quemSaiu) continue;
      this.mandar(p.conexao, vencedor ? { tipo: 'fim', motivo, vencedor } : { tipo: 'fim', motivo });
      p.conexao.close(1000, 'fim da partida');
    }
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
