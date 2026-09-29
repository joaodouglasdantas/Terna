import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MensagemPartidaDoServidor } from '@terna/compartilhado';

// Um WebSocket de mentira: o teste faz chegar mensagens e fecha a conexão como o servidor faria.
class SocketFalso extends EventTarget {
  static OPEN = 1;
  static ultimo: SocketFalso;
  readyState = 1;
  bufferedAmount = 0;
  constructor(public url: URL) {
    super();
    SocketFalso.ultimo = this;
  }
  send(): void {}
  close(): void {}
  chegar(mensagem: MensagemPartidaDoServidor): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(mensagem) }));
  }
  cair(): void {
    this.dispatchEvent(new Event('close'));
  }
}

let conectarPartida: typeof import('../src/rede/partida').conectarPartida;

beforeAll(async () => {
  vi.stubGlobal('WebSocket', SocketFalso);
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
  ({ conectarPartida } = await import('../src/rede/partida'));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const microtarefas = (): Promise<void> => new Promise((resolver) => setTimeout(resolver, 0));

describe('conexão da partida: segurar entre uma tela e a próxima', () => {
  it('guarda o que chega e a queda, e entrega para quem ouvir depois', async () => {
    const conexao = conectarPartida({ acao: 'criar', nome: 'Ana' });
    const daTelaQueSaiu: MensagemPartidaDoServidor[] = [];
    conexao.ouvir((m) => daTelaQueSaiu.push(m), () => daTelaQueSaiu.push({ tipo: 'erro', erro: 'caiu na tela errada' }));

    conexao.segurar();
    SocketFalso.ultimo.chegar({ tipo: 'fim', motivo: 'oponente-saiu' });
    SocketFalso.ultimo.cair();
    expect(daTelaQueSaiu).toEqual([]);

    const recebidas: MensagemPartidaDoServidor[] = [];
    let caiu = false;
    conexao.ouvir(
      (m) => recebidas.push(m),
      () => (caiu = true),
    );
    // Só depois de quem chamou `ouvir` terminar de se montar.
    expect(recebidas).toEqual([]);
    await microtarefas();
    expect(recebidas).toEqual([{ tipo: 'fim', motivo: 'oponente-saiu' }]);
    expect(caiu).toBe(true);
    expect(daTelaQueSaiu).toEqual([]);
  });

  it('sem segurar, entrega na hora para quem está ouvindo', () => {
    const conexao = conectarPartida({ acao: 'criar', nome: 'Ana' });
    const recebidas: MensagemPartidaDoServidor[] = [];
    conexao.ouvir((m) => recebidas.push(m));
    SocketFalso.ultimo.chegar({ tipo: 'revanche' });
    expect(recebidas).toEqual([{ tipo: 'revanche' }]);
  });

  it('fechada por quem saiu, a queda guardada não chega', async () => {
    const conexao = conectarPartida({ acao: 'criar', nome: 'Ana' });
    conexao.segurar();
    conexao.fechar();
    SocketFalso.ultimo.cair();
    let caiu = false;
    conexao.ouvir(
      () => undefined,
      () => (caiu = true),
    );
    await microtarefas();
    expect(caiu).toBe(false);
  });
});
