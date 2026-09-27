// Tela de seleção de personagem. Vem depois do Singleplayer e, no Multiplayer, com os dois já
// na sala (os dois escolhem ao mesmo tempo; a partida começa quando os dois escolherem). Cada
// personagem é um cartão com o sprite grande — parado de frente e, escolhido, correndo —, o
// nome, uma frase e os três poderes. Os que ainda não foram liberados (o Anjo) aparecem
// apagados, com "Em breve", e não dá para escolher.
//
// Setas (ou A/D) passam de um cartão para o outro, Enter joga e Esc volta.

import {
  HEROIS,
  LIBERADO,
  NOME_PODER,
  PODERES_DO_HEROI,
  SOBRE_HEROI,
  type Heroi,
  type IdPoder,
  type Lado,
} from '@terna/compartilhado';
import { spritesDo } from '../entidades/personagem';
import { contexto2d } from '../motor/imagens';
import { iconeDoPoder } from '../interface/painel';
import type { ConexaoPartida } from '../rede/partida';
import { anexarCena } from './cena';
import { botao, elemento, palco, sairComEsmaecer } from './dom';

// Uma linha sobre cada poder, para o cartão.
const SOBRE_PODER: Record<IdPoder, string> = {
  chicote: 'uma vinha de espinhos que estala e envenena',
  raizes: 'uma fileira de raízes rompe a terra e prende; a última, por mais tempo',
  furia: 'com a energia cheia: trepadeiras rompem uma área grande, e ela se cura',
  impacto: 'uma fileira de explosões correndo pelo chão',
  rajada: 'dois corações que enfeitiçam quem acertam',
  julgamento: 'um pilar de luz desce do céu',
};

const QUADRO_CORRENDO = 0.09; // segundos por quadro da corrida no cartão

// O que chega da sala enquanto a tela está aberta.
export interface SalaNaSelecao {
  conexao: ConexaoPartida;
  oponente: string;
}

export interface ComecouOnline {
  lado: Lado;
  oponente: string;
  restanteMs: number;
  heroi: Heroi;
  heroiOponente: Heroi;
}

export type ResultadoSelecao =
  | { tipo: 'escolheu'; heroi: Heroi } // sozinho
  | { tipo: 'comecou'; partida: ComecouOnline } // online: os dois escolheram
  | { tipo: 'voltou' }
  | { tipo: 'caiu'; erro: string | null }; // online: a sala acabou (o outro saiu, a rede caiu)

interface Cartao {
  heroi: Heroi;
  elemento: HTMLButtonElement;
  sprite: HTMLCanvasElement;
}

function montarCartao(heroi: Heroi, aoEscolher: () => void): Cartao {
  const sobre = SOBRE_HEROI[heroi];
  const liberado = LIBERADO[heroi];
  const cartao = elemento('button', `inicio-cartao${liberado ? '' : ' inicio-cartao-bloqueado'}`);
  cartao.type = 'button';
  cartao.setAttribute('role', 'radio');
  cartao.setAttribute('aria-checked', 'false');
  if (!liberado) {
    cartao.setAttribute('aria-disabled', 'true');
    cartao.setAttribute('aria-label', `${sobre.nome}, em breve`);
  }
  cartao.addEventListener('click', aoEscolher);

  const palcoSprite = elemento('div', 'inicio-cartao-palco');
  const { imagem } = spritesDo(heroi).parado[0];
  const sprite = elemento('canvas', 'inicio-cartao-sprite');
  // Grande o bastante para o quadro mais largo da corrida.
  sprite.width = 40;
  sprite.height = imagem.height + 2; // o tamanho na tela vem do CSS (×3 ou ×4, em pixels inteiros)
  palcoSprite.append(sprite);
  if (!liberado) palcoSprite.append(elemento('span', 'inicio-cartao-selo', 'Em breve'));

  const nome = elemento('h2', 'inicio-cartao-nome', sobre.nome);
  const titulo = elemento('p', 'inicio-cartao-titulo', sobre.titulo);
  const frase = elemento('p', 'inicio-cartao-frase', sobre.frase);
  const poderes = elemento('ul', 'inicio-cartao-poderes');
  PODERES_DO_HEROI[heroi].forEach((poder, i) => {
    const item = elemento('li', 'inicio-cartao-poder');
    const icone = elemento('canvas', 'inicio-cartao-icone');
    const origem = iconeDoPoder(poder);
    icone.width = origem.width;
    icone.height = origem.height;
    contexto2d(icone).drawImage(origem, 0, 0);
    icone.setAttribute('aria-hidden', 'true');
    const texto = elemento('span', '');
    texto.append(elemento('strong', '', `${i + 1} · ${NOME_PODER[poder]}`), elemento('span', '', SOBRE_PODER[poder]));
    item.append(icone, texto);
    poderes.append(item);
  });
  cartao.append(palcoSprite, nome, titulo, frase, poderes);
  return { heroi, elemento: cartao, sprite };
}

// Desenha o sprite do cartão: parado de frente; o escolhido, correndo sem sair do lugar.
function desenharSprite(c: Cartao, escolhido: boolean, tempo: number): void {
  const ctx = contexto2d(c.sprite);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.sprite.width, c.sprite.height);
  const sprites = spritesDo(c.heroi);
  const quadros = escolhido && LIBERADO[c.heroi] ? sprites.andando : sprites.parado;
  const { imagem, eixo } = quadros[Math.floor(tempo / QUADRO_CORRENDO) % quadros.length];
  ctx.drawImage(imagem, Math.round(c.sprite.width / 2 - eixo), c.sprite.height - 1 - imagem.height);
}

export function telaSelecao(sala?: SalaNaSelecao): Promise<ResultadoSelecao> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-selecao-tela');
    const titulo = elemento('h1', 'inicio-titulo', 'Escolha o personagem');
    const sub = elemento('p', 'inicio-sub', sala ? `Partida contra ${sala.oponente}` : 'Sua CPU vai ser o mesmo personagem');
    const grade = elemento('div', 'inicio-cartoes');
    grade.setAttribute('role', 'radiogroup');
    grade.setAttribute('aria-label', 'Personagens');
    const estado = elemento('p', 'inicio-aguarde inicio-selecao-estado');
    estado.setAttribute('aria-live', 'polite');
    const acoes = elemento('div', 'inicio-acoes');

    const liberados = HEROIS.filter((h) => LIBERADO[h]);
    let escolhido: Heroi = liberados[0];
    let confirmado = false;
    let acabou = false;

    const cartoes = HEROIS.map((heroi) => montarCartao(heroi, () => escolher(heroi)));
    grade.append(...cartoes.map((c) => c.elemento));

    const escolher = (heroi: Heroi): void => {
      if (!LIBERADO[heroi] || confirmado) return;
      escolhido = heroi;
      for (const c of cartoes) {
        const ativo = c.heroi === heroi;
        c.elemento.classList.toggle('inicio-cartao-escolhido', ativo);
        c.elemento.setAttribute('aria-checked', String(ativo));
      }
    };

    const terminar = (resultado: ResultadoSelecao): void => {
      if (acabou) return;
      acabou = true;
      window.removeEventListener('keydown', aoTeclar);
      if (resultado.tipo === 'voltou' || resultado.tipo === 'caiu') resolver(resultado);
      else void sairComEsmaecer(tela).then(() => resolver(resultado));
    };

    const jogar = botao('Jogar', 'inicio-botao inicio-jogar', () => {
      if (confirmado) return;
      if (!sala) return terminar({ tipo: 'escolheu', heroi: escolhido });
      // Online: manda a escolha e espera o outro (a partida começa quando os dois escolherem).
      confirmado = true;
      sala.conexao.escolherHeroi(escolhido);
      jogar.disabled = true;
      jogar.textContent = 'Pronto!';
      for (const c of cartoes) c.elemento.classList.toggle('inicio-cartao-travado', c.heroi !== escolhido);
      if (!estado.dataset.oponente) estado.textContent = `Esperando ${sala.oponente} escolher…`;
    });
    const voltar = botao(sala ? 'Sair da sala' : 'Voltar', 'inicio-botao inicio-botao-claro', () => {
      sala?.conexao.fechar();
      terminar({ tipo: 'voltou' });
    });
    acoes.append(voltar, jogar);

    if (sala) {
      estado.textContent = `${sala.oponente} está escolhendo…`;
      sala.conexao.ouvir(
        (m) => {
          if (m.tipo === 'oponente-escolheu') {
            estado.dataset.oponente = m.heroi;
            estado.textContent = `${sala.oponente} escolheu ${SOBRE_HEROI[m.heroi].nome}${confirmado ? '' : ' e está esperando você'}.`;
          }
          if (m.tipo === 'comecou') {
            const { lado, oponente, restanteMs, heroi, heroiOponente } = m;
            terminar({ tipo: 'comecou', partida: { lado, oponente, restanteMs, heroi, heroiOponente } });
          }
          if (m.tipo === 'fim') terminar({ tipo: 'caiu', erro: `${sala.oponente} saiu da sala.` });
        },
        (erro) => terminar({ tipo: 'caiu', erro }),
      );
    }

    // Setas (ou A/D) andam entre os liberados; Enter joga; Esc volta.
    const aoTeclar = (evento: KeyboardEvent): void => {
      const passo = ['ArrowLeft', 'KeyA'].includes(evento.code) ? -1 : ['ArrowRight', 'KeyD'].includes(evento.code) ? 1 : 0;
      if (passo && !confirmado) {
        evento.preventDefault();
        const i = liberados.indexOf(escolhido);
        escolher(liberados[(i + passo + liberados.length) % liberados.length]);
        cartoes.find((c) => c.heroi === escolhido)?.elemento.focus();
      } else if (evento.code === 'Enter' && !(evento.target instanceof HTMLButtonElement && evento.target !== jogar)) {
        evento.preventDefault();
        jogar.click();
      } else if (evento.code === 'Escape') {
        evento.preventDefault();
        voltar.click();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    tela.append(titulo, sub, grade, estado, acoes);
    anexarCena(tela);
    palco().replaceChildren(tela);
    escolher(escolhido);

    // Os sprites dos cartões andam enquanto a tela estiver aberta.
    const animar = (agora: number): void => {
      if (!tela.isConnected) return;
      for (const c of cartoes) desenharSprite(c, c.heroi === escolhido, agora / 1000);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
    // Sem foco inicial em nenhum botão (o contorno do foco parecia uma escolha já feita): o Enter
    // joga do mesmo jeito.
  });
}
