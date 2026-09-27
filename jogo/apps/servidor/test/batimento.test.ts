import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { vigiarConexao } from '../src/partida/batimento';

// Um WebSocket de mentira: conta os pings e as derrubadas; `responder` faz o pong chegar.
function socketFalso() {
  const eventos = new EventEmitter();
  const socket = {
    pings: 0,
    derrubado: false,
    ping() {
      this.pings++;
    },
    terminate() {
      this.derrubado = true;
    },
    on(evento: 'pong', ouvir: () => void) {
      eventos.on(evento, ouvir);
    },
    responder() {
      eventos.emit('pong');
    },
  };
  return socket;
}

describe('batimento da conexão', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('manda um ping por batida e mede a ida e volta de cada um', () => {
    vi.useFakeTimers();
    const socket = socketFalso();
    const medidas: number[] = [];
    const parar = vigiarConexao(socket, (ms) => medidas.push(ms), { batidaMs: 1000, semRespostaMs: 5000 });
    vi.advanceTimersByTime(1000);
    expect(socket.pings).toBe(1);
    vi.advanceTimersByTime(120);
    socket.responder();
    expect(medidas).toEqual([120]);
    // Sem resposta, não manda outro por cima: espera a do primeiro.
    vi.advanceTimersByTime(880);
    expect(socket.pings).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(socket.pings).toBe(2);
    parar();
    vi.advanceTimersByTime(10_000);
    expect(socket.derrubado).toBe(false);
  });

  it('derruba a conexão que parou de responder', () => {
    vi.useFakeTimers();
    const socket = socketFalso();
    vigiarConexao(socket, () => undefined, { batidaMs: 1000, semRespostaMs: 5000 });
    vi.advanceTimersByTime(5000);
    expect(socket.derrubado).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(socket.derrubado).toBe(true);
  });
});
