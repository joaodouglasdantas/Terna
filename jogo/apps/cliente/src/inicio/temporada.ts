// A tela de carregamento antes do combate: confere as imagens, espera uns segundos e divulga a
// temporada atual, "Chamado da Floresta". No meio, um outdoor de madeira com lâmpadas em cima
// mostra a arte da temporada — a imagem se aproxima devagar, um reflexo passa pelo vidro, faíscas
// douradas e vaga-lumes sobem na frente —; embaixo, os nomes dos personagens e do mapa da
// temporada, uma dica e a barra, como a do começo do jogo.
//
// Dura até `ate` (CARREGAMENTO_MS depois de começar; online, contado de quando a partida começou no
// servidor, então termina no mesmo instante para os dois). Se o outro sair da sala enquanto isso,
// avisa e volta ao menu.

import urlTemporada from '../assets/temporada-chamado-da-floresta.webp';
import { carregarImagem, contexto2d } from '../motor/imagens';
import type { ConexaoPartida } from '../rede/partida';
import { botao, elemento, mostrarTela, sairComEsmaecer, TELA_OPACA } from './dom';

export const TEMPORADA = {
  numero: 1,
  nome: 'Chamado da Floresta',
  personagens: ['Leslie', 'Grow'],
  mapa: 'Floresta da Divisa',
};

const DICAS = [
  'Dica: na partida, a tecla Tab mostra todos os controles.',
  'Dica: a tecla R troca a arma da mão pelos poderes.',
  'Dica: o botão direito do mouse passa para o próximo poder.',
  'Dica: dar dano enche a energia pixy; cada poder gasta a dele.',
  'Dica: dois toques rápidos para um lado dão um arranco.',
  'Dica: o golem do Grow segura parte do dano com a pele de pedra.',
  'Dica: a última roda das Raízes da Leslie prende por mais tempo.',
  'Dica: a tecla E joga fora a arma da mão.',
];

// As frases da barra, na ordem, conforme ela enche.
const ETAPAS = ['Conferindo as imagens', 'Enchendo o rio', 'Acordando os vaga-lumes', 'Chamando os lutadores'];

let arte: Promise<HTMLImageElement> | null = null;

// Carrega (e decodifica) a arte da temporada uma vez: o carregamento do começo do jogo já chama.
export function carregarArteDaTemporada(): Promise<HTMLImageElement> {
  arte ??= carregarImagem(urlTemporada).then(async (img) => {
    await img.decode().catch(() => undefined);
    return img;
  });
  return arte;
}

export interface OpcoesTemporada {
  ate: number; // performance.now() em que a tela termina
  online?: { conexao: ConexaoPartida; oponente: string };
}

// Faíscas douradas e vaga-lumes subindo na frente da arte, num canvas pequeno ampliado em pixels.
function particulas(canvas: HTMLCanvasElement): () => void {
  const ctx = contexto2d(canvas);
  const { width: w, height: h } = canvas;
  const pontos = Array.from({ length: 34 }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    v: 4 + Math.random() * 10,
    fase: Math.random() * Math.PI * 2,
    vaga: i % 3 === 0, // vaga-lume (verde) ou faísca (dourada)
  }));
  let anterior = performance.now();
  let rodando = true;
  const quadro = (agora: number): void => {
    if (!rodando || !canvas.isConnected) return;
    const dt = Math.min(0.05, (agora - anterior) / 1000);
    anterior = agora;
    ctx.clearRect(0, 0, w, h);
    for (const p of pontos) {
      p.y -= p.v * dt;
      p.fase += dt * 2;
      if (p.y < -2) {
        p.y = h + 2;
        p.x = Math.random() * w;
      }
      const x = Math.round(p.x + Math.sin(p.fase) * 3);
      const y = Math.round(p.y);
      const brilho = 0.45 + 0.55 * Math.abs(Math.sin(p.fase * (p.vaga ? 1.3 : 2.4)));
      ctx.globalAlpha = brilho;
      ctx.fillStyle = p.vaga ? '#c8f5b0' : '#ffe08a';
      ctx.fillRect(x, y, 1, 1);
      if (brilho > 0.85) {
        ctx.globalAlpha = brilho * 0.5;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);
  return () => {
    rodando = false;
  };
}

// Termina com `saiu`: online, o outro saiu da sala durante o carregamento (volta ao menu).
export function telaTemporada(opcoes: OpcoesTemporada): Promise<{ saiu: boolean }> {
  return new Promise((resolver) => {
    const tela = elemento('section', `inicio-tela ${TELA_OPACA} inicio-temporada`);

    const cabeca = elemento('p', 'inicio-temporada-selo');
    cabeca.append(elemento('span', 'inicio-temporada-numero', `Temporada ${TEMPORADA.numero}`), elemento('span', '', TEMPORADA.nome));

    // O outdoor: as lâmpadas em cima, o quadro de madeira com a arte e os dois pés.
    const outdoor = elemento('div', 'inicio-outdoor');
    const lampadas = elemento('div', 'inicio-outdoor-lampadas');
    for (let i = 0; i < 3; i++) lampadas.append(elemento('span', 'inicio-outdoor-lampada'));
    const quadro = elemento('div', 'inicio-outdoor-quadro');
    const vidro = elemento('div', 'inicio-outdoor-tela');
    const img = elemento('img', 'inicio-outdoor-arte');
    img.src = urlTemporada;
    img.alt = `Temporada ${TEMPORADA.numero}: ${TEMPORADA.nome} — a dríade e o Grow estendem a mão um para o outro diante da montanha, do rio e das águias`;
    img.draggable = false;
    const brilhos = elemento('canvas', 'inicio-outdoor-brilhos');
    brilhos.width = 240;
    brilhos.height = 160;
    brilhos.setAttribute('aria-hidden', 'true');
    vidro.append(img, brilhos, elemento('div', 'inicio-outdoor-reluz'), elemento('div', 'inicio-outdoor-luz'));
    quadro.append(vidro);
    const pes = elemento('div', 'inicio-outdoor-pes');
    pes.append(elemento('span', ''), elemento('span', ''));
    outdoor.append(lampadas, quadro, pes);

    const novidades = elemento('ul', 'inicio-temporada-novidades');
    for (const nome of TEMPORADA.personagens) novidades.append(elemento('li', '', nome));
    const mapa = elemento('li', 'inicio-temporada-mapa');
    mapa.append(elemento('span', '', 'Mapa'), ` ${TEMPORADA.mapa}`);
    novidades.append(mapa);
    const dica = elemento('p', 'inicio-temporada-dica', DICAS[Math.floor(Math.random() * DICAS.length)]);

    const barra = elemento('div', 'inicio-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-label', 'Carregando a partida');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    const cheia = elemento('div', 'inicio-barra-cheia');
    barra.append(cheia);
    const frase = elemento('p', 'inicio-frase');
    frase.setAttribute('aria-live', 'polite');

    tela.append(cabeca, outdoor, novidades, dica, barra, frase);
    mostrarTela(tela);
    const pararBrilhos = particulas(brilhos);

    let acabou = false;
    const terminar = (saiu: boolean): void => {
      if (acabou) return;
      acabou = true;
      pararBrilhos();
      void sairComEsmaecer(tela).then(() => resolver({ saiu }));
    };

    // Online: o outro saindo agora, avisa e oferece a volta ao menu.
    if (opcoes.online) {
      const { conexao, oponente } = opcoes.online;
      const saiu = (): void => {
        if (acabou) return;
        acabou = true;
        pararBrilhos();
        tela.dataset.estado = 'falhou';
        frase.textContent = `${oponente} saiu da sala.`;
        const voltar = botao('Voltar ao menu', 'inicio-botao', () => {
          conexao.fechar();
          void sairComEsmaecer(tela).then(() => resolver({ saiu: true }));
        });
        tela.append(voltar);
        voltar.focus();
      };
      conexao.ouvir((m) => {
        if (m.tipo === 'fim') saiu();
      }, saiu);
    }

    // A barra: anda com o tempo até o fim, mas só enche de vez com as imagens conferidas.
    const inicio = performance.now();
    const duracao = Math.max(1, opcoes.ate - inicio);
    let conferido = false;
    void Promise.all([carregarArteDaTemporada(), document.fonts.ready]).then(
      () => (conferido = true),
      () => (conferido = true), // sem a arte, a partida segue do mesmo jeito
    );
    const animar = (agora: number): void => {
      if (acabou) return;
      const p = Math.min(conferido ? 1 : 0.9, (agora - inicio) / duracao);
      cheia.style.width = `${(p * 100).toFixed(1)}%`;
      barra.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      frase.textContent = p >= 1 ? 'Tudo pronto!' : `${ETAPAS[Math.min(ETAPAS.length - 1, Math.floor(p * ETAPAS.length))]}…`;
      if (agora >= opcoes.ate && conferido) return terminar(false);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
  });
}
