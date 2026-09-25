import { randomInt } from 'node:crypto';
import {
  DURACAO_PARTIDA_MS,
  LETRAS_DO_CODIGO,
  MensagemPartidaDoCliente,
  TAMANHO_CODIGO,
  type MensagemPartidaDoServidor,
  type MotivoFim,
} from '@terna/compartilhado';
import type { Conexao } from '../tempo-real/sala';

// Salas de partida 1v1, sem conta: quem cria recebe um código; quem entra com ele começa a
// partida. O servidor marca o tempo (a partida acaba para os dois ao mesmo tempo) e só repassa
// o estado de um jogador para o outro — cada um simula o próprio personagem.

// Estados por segundo que um jogador pode mandar; o excesso é ignorado. O cliente manda ~10.
const LIMITE_POR_SEGUNDO = 15;

export interface OpcoesSalas {
  duracaoMs: number;
  // Quanto tempo uma sala espera o segundo jogador antes de fechar.
  esperaMaxMs: number;
  // Salas abertas ao mesmo tempo (protege a memória do servidor grátis).
  maxSalas: number;
  gerarCodigo: () => string;
}

export function codigoAleatorio(): string {
  return Array.from({ length: TAMANHO_CODIGO }, () => LETRAS_DO_CODIGO[randomInt(LETRAS_DO_CODIGO.length)]).join('');
}

const PADRAO: OpcoesSalas = {
  duracaoMs: DURACAO_PARTIDA_MS,
  esperaMaxMs: 10 * 60 * 1000,
  maxSalas: 500,
  gerarCodigo: codigoAleatorio,
};

interface SalaPartida {
  codigo: string;
  anfitriao: Participante;
  convidado: Participante | null;
  timer: ReturnType<typeof setTimeout>; // espera o convidado; depois, o fim do tempo
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

    const sala = { codigo, convidado: null } as SalaPartida;
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
    this.mandar(outro.conexao, { tipo: 'estado', estado: mensagem.data.estado });
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
  private encerrar(sala: SalaPartida, motivo: MotivoFim, quemSaiu?: Participante): void {
    clearTimeout(sala.timer);
    this.salas.delete(sala.codigo);
    for (const p of [sala.anfitriao, sala.convidado]) {
      if (!p || p === quemSaiu) continue;
      this.mandar(p.conexao, { tipo: 'fim', motivo });
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
