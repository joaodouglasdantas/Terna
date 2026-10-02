// A ligação direta entre os dois computadores (WebRTC): por ela vão o estado, os poderes e os
// golpes, sem passar pelo servidor. Na mesma rede isso é quase instantâneo; pela internet, entre
// dois jogadores no Brasil, poupa a ida e a volta até o servidor nos Estados Unidos (que sozinha
// passa de 100 ms). Quem hospedou oferece a ligação e quem entrou responde; os recados (sinais)
// vão pelo servidor (rede/partida.ts). Na mesma rede, os caminhos são os endereços da própria
// rede; pela internet, cada um pergunta o seu endereço de fora a um servidor STUN. Se ela não
// abrir em ESPERA_MS (o NAT de alguém não deixa, a rede bloqueia) ou cair no meio, tudo continua
// pelo servidor, como antes.
//
// São dois canais: `jogo`, confiável e em ordem, para os poderes e os golpes (que não podem se
// perder); e `estado`, sem reenvio e fora de ordem, para o estado, que chega ~30 vezes por segundo:
// um pacote perdido não segura os de depois (o próximo já é mais novo), e um que chegue atrasado,
// depois de um mais novo, é jogado fora pelo número que vai na frente. O ping também vai por ele: a
// cada segundo um eco, que o outro devolve na hora — é o atraso que a partida usa e mostra.

import type { Sinal } from '@terna/compartilhado';

const ESPERA_MS = { local: 8000, internet: 12_000 };
// Os servidores STUN públicos (só dizem a cada um o próprio endereço de fora; nada do jogo passa
// por eles).
const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
// Bytes esperando para sair a partir dos quais o canal não recebe mais nada agora (o recado vai
// pelo servidor): engasgado, ele atrasaria em vez de adiantar.
const FILA_MAXIMA = 64 * 1024;
const FILA_MAXIMA_ESTADO = 16 * 1024;
const ECO_MS = 1000; // um eco por segundo
const PESO_DO_ECO = 0.3; // quanto cada medida nova pesa no ping guardado
// Os recados de controle do canal começam com '#' (o jogo manda JSON, que começa com '{').
const ECO = '#eco ';
const RESPOSTA = '#oce ';

export interface LigacaoDireta {
  receberSinal(sinal: Sinal): void;
  // Manda pelo canal confiável, se ele estiver aberto (false: mande pelo servidor).
  enviar(texto: string): boolean;
  // Manda o estado pelo canal rápido (sem reenvio), se ele estiver aberto (false: pelo servidor).
  enviarEstado(texto: string): boolean;
  aberta(): boolean;
  // Não abriu a tempo, ou caiu: não abre mais (uma nova pode ser tentada).
  morta(): boolean;
  // Ida e volta até o outro, em ms, suavizada (null: ainda sem medida).
  ping(): number | null;
  fechar(): void;
}

export function ligarDireto(
  oferece: boolean,
  internet: boolean,
  mandarSinal: (sinal: Sinal) => void,
  aoReceber: (texto: string) => void,
): LigacaoDireta | null {
  if (typeof RTCPeerConnection === 'undefined') return null;
  let pc: RTCPeerConnection;
  try {
    pc = new RTCPeerConnection({ iceServers: internet ? STUN : [] });
  } catch {
    return null;
  }
  let jogo: RTCDataChannel | null = null;
  let estado: RTCDataChannel | null = null;
  let morreu = false;
  let ping: number | null = null;
  let enviados = 0; // o número do último estado mandado
  let recebido = 0; // o do último estado aceito
  // Caminhos do outro que chegaram antes da descrição dele: entram depois dela.
  const pendentes: RTCIceCandidateInit[] = [];

  const morrer = (): void => {
    if (morreu) return;
    morreu = true;
    clearTimeout(espera);
    clearInterval(eco);
    pc.close();
  };
  const usar = (c: RTCDataChannel): void => {
    if (c.label === 'estado') {
      estado = c;
      c.onmessage = (evento) => {
        if (typeof evento.data !== 'string') return;
        const texto = evento.data;
        if (texto.startsWith(ECO)) {
          if (c.readyState === 'open') c.send(RESPOSTA + texto.slice(ECO.length));
          return;
        }
        if (texto.startsWith(RESPOSTA)) {
          const ida = performance.now() - Number(texto.slice(RESPOSTA.length));
          if (Number.isFinite(ida) && ida >= 0 && ida < 10_000) ping = ping === null ? ida : ping + (ida - ping) * PESO_DO_ECO;
          return;
        }
        // "número|estado": um mais velho que o último aceito chegou atrasado — fica de fora.
        const barra = texto.indexOf('|');
        const numero = Number(texto.slice(0, barra));
        if (barra < 0 || !Number.isFinite(numero) || numero <= recebido) return;
        recebido = numero;
        aoReceber(texto.slice(barra + 1));
      };
    } else {
      jogo = c;
      c.onmessage = (evento) => {
        if (typeof evento.data === 'string') aoReceber(evento.data);
      };
    }
    c.onclose = morrer;
  };
  pc.onicecandidate = (evento) => {
    const c = evento.candidate;
    if (c) mandarSinal({ candidato: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') morrer();
  };
  const espera = setTimeout(() => {
    if (jogo?.readyState !== 'open') morrer();
  }, internet ? ESPERA_MS.internet : ESPERA_MS.local);
  const eco = setInterval(() => {
    if (estado?.readyState === 'open' && estado.bufferedAmount < FILA_MAXIMA_ESTADO) estado.send(ECO + performance.now().toFixed(1));
  }, ECO_MS);

  if (oferece) {
    usar(pc.createDataChannel('jogo'));
    usar(pc.createDataChannel('estado', { ordered: false, maxRetransmits: 0 }));
    void (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        const d = pc.localDescription;
        if (d) mandarSinal({ descricao: { type: 'offer', sdp: d.sdp } });
      } catch {
        morrer();
      }
    })();
  } else {
    pc.ondatachannel = (evento) => usar(evento.channel);
  }

  // Os recados chegam em ordem (pelo servidor), mas cada um espera o anterior terminar.
  let fila = Promise.resolve();
  const receber = async (sinal: Sinal): Promise<void> => {
    if (morreu) return;
    if (sinal.descricao) {
      await pc.setRemoteDescription(sinal.descricao);
      for (const c of pendentes.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
      if (sinal.descricao.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        const d = pc.localDescription;
        if (d) mandarSinal({ descricao: { type: 'answer', sdp: d.sdp } });
      }
    }
    if (sinal.candidato) {
      if (pc.remoteDescription) await pc.addIceCandidate(sinal.candidato).catch(() => undefined);
      else pendentes.push(sinal.candidato);
    }
  };

  const enviar = (texto: string): boolean => {
    if (morreu || jogo?.readyState !== 'open' || jogo.bufferedAmount > FILA_MAXIMA) return false;
    jogo.send(texto);
    return true;
  };

  return {
    receberSinal(sinal) {
      fila = fila.then(() => receber(sinal)).catch(morrer);
    },
    enviar,
    enviarEstado(texto) {
      // Sem o canal rápido (um navegador que não abriu os dois), vai pelo confiável.
      if (morreu) return false;
      if (estado?.readyState !== 'open') return enviar(texto);
      if (estado.bufferedAmount > FILA_MAXIMA_ESTADO) return false;
      estado.send(`${++enviados}|${texto}`);
      return true;
    },
    aberta: () => !morreu && jogo?.readyState === 'open',
    morta: () => morreu,
    ping: () => (morreu ? null : ping),
    fechar: morrer,
  };
}
