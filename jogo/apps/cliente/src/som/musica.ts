// A música do jogo: uma para as telas (o carregamento, a inicial, a seleção, as salas) e outra
// para o combate, as duas em loop. Trocar de uma para a outra é um cruzamento: a que sai abaixa
// enquanto a que entra sobe.
//
// O navegador não deixa tocar som antes de a pessoa mexer na página: pedida antes disso, a música
// fica esperando o primeiro clique ou tecla e começa aí. Dá para desligar (a nota no canto da tela
// inicial e o menu da partida); a escolha fica guardada neste navegador.

import urlCombate from '../assets/musica/combate.mp3';
import urlTelas from '../assets/musica/telas.mp3';

export type Faixa = 'telas' | 'combate';

const VOLUME: Record<Faixa, number> = { telas: 0.45, combate: 0.4 };
const CRUZAMENTO_MS = 1200;
const CHAVE = 'terna:musica';

const faixas: Partial<Record<Faixa, HTMLAudioElement>> = {};
let atual: Faixa | null = null;
let ligada = lerLigada();
let esperandoGesto = false;
// O volume de cada faixa agora (0 a 1 do VOLUME dela) e para onde ele vai.
const nivel: Record<Faixa, number> = { telas: 0, combate: 0 };
let animando = false;

function lerLigada(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== 'desligada';
  } catch {
    return true;
  }
}

function audio(faixa: Faixa): HTMLAudioElement {
  let a = faixas[faixa];
  if (!a) {
    a = new Audio(faixa === 'telas' ? urlTelas : urlCombate);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    faixas[faixa] = a;
  }
  return a;
}

// Sobe a faixa de agora e abaixa as outras, aos poucos; pausa a que chegou a zero.
function animar(): void {
  if (animando) return;
  animando = true;
  let antes = performance.now();
  const passo = (agora: number): void => {
    const dt = Math.max(0, Math.min(100, agora - antes)); // o do quadro pode vir antes do performance.now()
    antes = agora;
    let mexendo = false;
    for (const faixa of Object.keys(nivel) as Faixa[]) {
      const a = faixas[faixa];
      if (!a) continue;
      const alvo = ligada && faixa === atual ? 1 : 0;
      const n = nivel[faixa];
      const novo = alvo > n ? Math.min(alvo, n + dt / CRUZAMENTO_MS) : Math.max(alvo, n - dt / CRUZAMENTO_MS);
      nivel[faixa] = novo;
      a.volume = Math.max(0, Math.min(1, VOLUME[faixa] * novo));
      if (novo === 0 && alvo === 0 && !a.paused) a.pause();
      if (novo !== alvo) mexendo = true;
    }
    if (mexendo) requestAnimationFrame(passo);
    else animando = false;
  };
  requestAnimationFrame(passo);
}

function tocar(): void {
  if (!atual || !ligada) return;
  const a = audio(atual);
  if (!a.paused) return animar();
  a.play().then(animar, () => {
    // Bloqueado até a pessoa mexer na página: tenta de novo no primeiro gesto.
    if (esperandoGesto) return;
    esperandoGesto = true;
    const gesto = (): void => {
      esperandoGesto = false;
      window.removeEventListener('pointerdown', gesto, true);
      window.removeEventListener('keydown', gesto, true);
      tocar();
    };
    window.addEventListener('pointerdown', gesto, true);
    window.addEventListener('keydown', gesto, true);
  });
}

// A faixa que deve tocar agora. Pedir a que já toca não recomeça nada.
export function tocarMusica(faixa: Faixa): void {
  if (atual === faixa) return;
  // A que entra começa do início (a do combate, a cada partida).
  if (faixa === 'combate') audio(faixa).currentTime = 0;
  atual = faixa;
  tocar();
  animar();
}

export function musicaLigada(): boolean {
  return ligada;
}

export function ligarMusica(sim: boolean): void {
  ligada = sim;
  try {
    localStorage.setItem(CHAVE, sim ? 'ligada' : 'desligada');
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  if (sim) tocar();
  animar();
}
