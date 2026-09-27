// A ligação direta entre os dois computadores na mesma rede (WebRTC): um canal de dados por onde
// vão o estado, os poderes e os golpes, sem passar pelo servidor — na rede de casa, isso é quase
// instantâneo. Quem hospedou oferece a ligação e quem entrou responde; os recados (sinais) vão
// pelo servidor (rede/partida.ts). Sem servidor STUN: os caminhos são os endereços da própria
// rede. Se ela não abrir em ESPERA_MS (ou cair no meio), tudo continua pelo servidor, como numa
// sala com código.

import type { Sinal } from '@terna/compartilhado';

const ESPERA_MS = 8000;
// Bytes esperando para sair a partir dos quais o canal não recebe mais nada agora (o recado vai
// pelo servidor): engasgado, ele atrasaria em vez de adiantar.
const FILA_MAXIMA = 64 * 1024;

export interface LigacaoDireta {
  receberSinal(sinal: Sinal): void;
  // Manda pelo canal, se ele estiver aberto (false: mande pelo servidor).
  enviar(texto: string): boolean;
  aberta(): boolean;
  // Não abriu a tempo, ou caiu: não abre mais (uma nova pode ser tentada).
  morta(): boolean;
  fechar(): void;
}

export function ligarDireto(
  oferece: boolean,
  mandarSinal: (sinal: Sinal) => void,
  aoReceber: (texto: string) => void,
): LigacaoDireta | null {
  if (typeof RTCPeerConnection === 'undefined') return null;
  const pc = new RTCPeerConnection({ iceServers: [] });
  let canal: RTCDataChannel | null = null;
  let morreu = false;
  // Caminhos do outro que chegaram antes da descrição dele: entram depois dela.
  const pendentes: RTCIceCandidateInit[] = [];

  const morrer = (): void => {
    morreu = true;
    pc.close();
  };
  const usar = (c: RTCDataChannel): void => {
    canal = c;
    c.onmessage = (evento) => {
      if (typeof evento.data === 'string') aoReceber(evento.data);
    };
    c.onclose = morrer;
  };
  pc.onicecandidate = (evento) => {
    const c = evento.candidate;
    if (c) mandarSinal({ candidato: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') morrer();
  };
  const espera = setTimeout(() => {
    if (canal?.readyState !== 'open') morrer();
  }, ESPERA_MS);

  if (oferece) {
    usar(pc.createDataChannel('jogo'));
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

  return {
    receberSinal(sinal) {
      fila = fila.then(() => receber(sinal)).catch(morrer);
    },
    enviar(texto) {
      if (canal?.readyState !== 'open' || canal.bufferedAmount > FILA_MAXIMA) return false;
      canal.send(texto);
      return true;
    },
    aberta: () => canal?.readyState === 'open',
    morta: () => morreu,
    fechar() {
      clearTimeout(espera);
      morreu = true;
      pc.close();
    },
  };
}
