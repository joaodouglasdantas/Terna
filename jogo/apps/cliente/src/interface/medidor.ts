// O medidor de desempenho, como nos outros jogos: os quadros por segundo e, online, o ping até o
// outro jogador (a ida e a volta, em ms). Liga e desliga no menu da partida (a engrenagem: "FPS e
// ping"), e a escolha fica guardada neste navegador. Fica no canto de baixo, à esquerda, em cima
// da terra, só com os números e a cor dizendo como está: verde, bom; amarelo, aceitável; vermelho,
// ruim. Online, um pontinho depois do ping diz por onde a partida passa: cheio, os dois
// computadores ligados direto; vazado, pelo servidor.

import { ALTURA_FONTE, textoEmPixels } from '../motor/fonte';

const CHAVE = 'terna:medidor';
const MARGEM = 4; // px da borda da tela
const ESPACO = 6; // px entre os números
const SOMBRA = '#120c10';
const BOM = '#7ee07a';
const MEDIO = '#ffd34d';
const RUIM = '#ff5f5f';
const APAGADO = '#c9bfae';

// A partir de quantos quadros por segundo fica verde e amarelo; o ping (ms) até onde é verde e amarelo.
const FPS = { bom: 55, medio: 30 };
const PING = { bom: 90, medio: 170 };

let ligado = ((): boolean => {
  try {
    return localStorage.getItem(CHAVE) === 'ligado';
  } catch {
    return false;
  }
})();

export const medidorLigado = (): boolean => ligado;

export function ligarMedidor(sim: boolean): void {
  ligado = sim;
  try {
    localStorage.setItem(CHAVE, sim ? 'ligado' : 'desligado');
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export interface Medidas {
  fps: number | null;
  online: { ping: number | null; direto: boolean } | null;
}

// Conta os quadros e diz os quadros por segundo de meio em meio segundo (o número não tremula).
export function criarContadorDeQuadros(): { quadro(agora: number): void; fps(): number | null } {
  let inicio = -1;
  let quadros = 0;
  let fps: number | null = null;
  return {
    quadro(agora) {
      if (inicio < 0) inicio = agora;
      quadros++;
      const passou = agora - inicio;
      if (passou >= 500) {
        fps = Math.round((quadros * 1000) / passou);
        inicio = agora;
        quadros = 0;
      }
    },
    fps: () => fps,
  };
}

const cor = (bom: boolean, medio: boolean): string => (bom ? BOM : medio ? MEDIO : RUIM);

export function desenharMedidor(ctx: CanvasRenderingContext2D, medidas: Medidas, altura: number): void {
  if (!ligado) return;
  const pedacos: { texto: string; cor: string }[] = [];
  const { fps, online } = medidas;
  if (fps !== null) pedacos.push({ texto: `${fps} FPS`, cor: cor(fps >= FPS.bom, fps >= FPS.medio) });
  let ponto: { direto: boolean; cor: string } | null = null;
  if (online) {
    const { ping, direto } = online;
    const c = ping === null ? APAGADO : cor(ping <= PING.bom, ping <= PING.medio);
    pedacos.push({ texto: ping === null ? '-- MS' : `${Math.min(999, ping)} MS`, cor: c });
    ponto = { direto, cor: c };
  }
  const y = altura - MARGEM - ALTURA_FONTE;
  let x = MARGEM;
  ctx.save();
  for (const p of pedacos) {
    const sombra = textoEmPixels(p.texto, SOMBRA);
    const imagem = textoEmPixels(p.texto, p.cor);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(sombra, x + 1, y + 1);
    ctx.globalAlpha = 1;
    ctx.drawImage(imagem, x, y);
    x += imagem.width + ESPACO;
  }
  if (ponto) {
    // O pontinho de 3×3: cheio (direto) ou só a borda (pelo servidor).
    const px = x - ESPACO + 3;
    const py = y + 1;
    ctx.fillStyle = SOMBRA;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(px + 1, py + 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ponto.cor;
    if (ponto.direto) ctx.fillRect(px, py, 3, 3);
    else {
      ctx.fillRect(px, py, 3, 1);
      ctx.fillRect(px, py + 2, 3, 1);
      ctx.fillRect(px, py + 1, 1, 1);
      ctx.fillRect(px + 2, py + 1, 1, 1);
    }
  }
  ctx.restore();
}
