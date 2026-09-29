// A tela dos personagens (o botão Personagens da tela inicial). Primeiro, um cartão alto para cada
// personagem liberado, com o retrato (terras.ts), o nome e o codinome. Clicando num, a ficha dele:
// o sprite correndo em pixel art, como no cartão da escolha, a descrição, o mapa de onde ele é e os
// poderes, com os ícones e as dicas do Tab (ajuda.ts).
//
// Na ficha, as setas (ou A/D) passam para o personagem ao lado; Esc (ou Voltar) volta aos cartões
// e, deles, à tela inicial.

import { HEROIS_LIBERADOS, SOBRE_HEROI, type Heroi } from '@terna/compartilhado';
import { spritesDo } from '../entidades/personagem';
import { contexto2d } from '../motor/imagens';
import { poderesDoHeroi } from './ajuda';
import { anexarCena } from './cena';
import { botao, elemento, mostrarTela } from './dom';
import { TEMPORADA } from './temporada';
import { RETRATO, biomaDo } from './terras';

const QUADRO_CORRENDO = 0.09; // segundos por quadro da corrida, como no cartão da escolha

// O cartão com o retrato: o nome e o codinome embaixo, por cima da arte.
function cartaoComRetrato(heroi: Heroi, aoAbrir: () => void): HTMLButtonElement {
  const { nome, codinome } = SOBRE_HEROI[heroi];
  const cartao = botao('', 'inicio-retrato', aoAbrir);
  cartao.setAttribute('aria-label', `${nome}, ${codinome}: ver os poderes`);
  const url = RETRATO[heroi];
  if (url) {
    const img = elemento('img', 'inicio-retrato-arte');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    cartao.append(img);
  }
  const rotulo = elemento('span', 'inicio-retrato-rotulo');
  rotulo.append(elemento('strong', 'inicio-retrato-nome', nome), elemento('span', 'inicio-retrato-codinome', codinome));
  cartao.append(rotulo);
  return cartao;
}

// O sprite correndo sem sair do lugar, num canvas do tamanho do maior quadro da corrida (o CSS
// amplia em pixels inteiros). `desenhar` recebe o tempo em segundos.
function spriteCorrendo(heroi: Heroi): { canvas: HTMLCanvasElement; desenhar: (tempo: number) => void } {
  const quadros = spritesDo(heroi).andando;
  const meia = Math.max(...quadros.map(({ imagem, eixo }) => Math.max(eixo, imagem.width - eixo)));
  const canvas = elemento('canvas', 'inicio-ficha-sprite');
  canvas.width = 2 * meia + 2;
  canvas.height = Math.max(...quadros.map(({ imagem }) => imagem.height)) + 2;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.setProperty('--px', String(canvas.width)); // o CSS amplia em pixels inteiros
  const ctx = contexto2d(canvas);
  return {
    canvas,
    desenhar(tempo) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { imagem, eixo } = quadros[Math.floor(tempo / QUADRO_CORRENDO) % quadros.length];
      ctx.drawImage(imagem, Math.round(canvas.width / 2 - eixo), canvas.height - 1 - imagem.height);
    },
  };
}

// Termina quando a pessoa volta para a tela inicial.
export function telaPersonagens(): Promise<void> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-personagens-tela');
    const caixa = elemento('div', 'inicio-personagens');
    tela.append(caixa);

    let quadro = 0; // o requestAnimationFrame do sprite da ficha aberta
    let voltar = (): void => sair();
    let passar: ((passo: number) => void) | null = null;

    const sair = (): void => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('keydown', aoTeclar);
      resolver();
    };

    // Os cartões de todos os liberados.
    const galeria = (foco?: Heroi): void => {
      cancelAnimationFrame(quadro);
      voltar = sair;
      passar = null;
      const grade = elemento('div', 'inicio-retratos');
      const cartoes = HEROIS_LIBERADOS.map((heroi) => {
        const c = cartaoComRetrato(heroi, () => ficha(heroi));
        grade.append(c);
        return { heroi, c };
      });
      caixa.replaceChildren(
        elemento('h1', 'inicio-titulo', 'Personagens'),
        elemento('p', 'inicio-sub', 'Escolha um personagem para ver os poderes dele'),
        grade,
        botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar()),
      );
      tela.scrollTop = 0;
      // Voltando de uma ficha, o foco fica no cartão dela.
      cartoes.find((x) => x.heroi === foco)?.c.focus();
    };

    // A ficha de um personagem.
    const ficha = (heroi: Heroi): void => {
      cancelAnimationFrame(quadro);
      voltar = () => galeria(heroi);
      const { nome, codinome, frase } = SOBRE_HEROI[heroi];
      const i = HEROIS_LIBERADOS.indexOf(heroi);
      passar = (passo) => ficha(HEROIS_LIBERADOS[(i + passo + HEROIS_LIBERADOS.length) % HEROIS_LIBERADOS.length]);

      const sprite = spriteCorrendo(heroi);
      const palcoSprite = elemento('div', 'inicio-ficha-palco');
      palcoSprite.append(sprite.canvas);
      const etiquetas = elemento('ul', 'inicio-ficha-etiquetas');
      const bioma = biomaDo(heroi);
      etiquetas.append(elemento('li', '', `Temporada ${TEMPORADA.numero}`));
      if (bioma) etiquetas.append(elemento('li', '', bioma.nome));
      const lado = elemento('div', 'inicio-ficha-lado');
      lado.append(palcoSprite, elemento('h1', 'inicio-ficha-nome', nome), elemento('p', 'inicio-ficha-codinome', codinome), etiquetas);

      const poderes = elemento('section', 'inicio-ajuda-secao inicio-ficha-poderes');
      poderes.append(elemento('h2', '', 'Poderes'), ...poderesDoHeroi(heroi));
      const texto = elemento('div', 'inicio-ficha-texto');
      texto.append(elemento('p', 'inicio-ficha-frase', frase), poderes);

      const corpo = elemento('div', 'inicio-ficha');
      corpo.append(lado, texto);
      const acoes = elemento('div', 'inicio-acoes');
      acoes.append(botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar()));
      if (HEROIS_LIBERADOS.length > 1) {
        const proximo = SOBRE_HEROI[HEROIS_LIBERADOS[(i + 1) % HEROIS_LIBERADOS.length]].nome;
        acoes.append(botao(`${proximo} ▸`, 'inicio-botao', () => passar?.(1)));
      }
      caixa.replaceChildren(corpo, acoes);
      tela.scrollTop = 0;

      const animar = (agora: number): void => {
        if (!sprite.canvas.isConnected) return;
        sprite.desenhar(agora / 1000);
        quadro = requestAnimationFrame(animar);
      };
      quadro = requestAnimationFrame(animar);
    };

    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Escape') {
        evento.preventDefault();
        voltar();
        return;
      }
      const passo = ['ArrowLeft', 'KeyA'].includes(evento.code) ? -1 : ['ArrowRight', 'KeyD'].includes(evento.code) ? 1 : 0;
      if (passo && passar) {
        evento.preventDefault();
        passar(passo);
      }
    };
    window.addEventListener('keydown', aoTeclar);

    galeria();
    anexarCena(tela);
    mostrarTela(tela);
  });
}
