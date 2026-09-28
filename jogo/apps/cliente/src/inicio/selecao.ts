// Tela de seleção de personagem. Vem depois do Singleplayer e, no Multiplayer, com os dois já
// na sala (os dois escolhem ao mesmo tempo; a partida começa quando os dois escolherem). No
// Multiplayer, depois de apertar Jogar, ainda dá para trocar de personagem até o outro escolher (a
// troca vai na hora); e ninguém vê o personagem do outro antes de a partida começar. Cada
// personagem é um cartão com o sprite grande — parado de frente e, escolhido, correndo —, o
// nome e os três poderes (a história de cada um fica para depois). Só aparecem os liberados: o
// Anjo, pronto mas guardado, não é mostrado.
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
  type MensagemPartidaDoServidor,
} from '@terna/compartilhado';
import { spritesDo } from '../entidades/personagem';
import { contexto2d } from '../motor/imagens';
import { iconeDoPoder } from '../interface/painel';
import type { ConexaoPartida } from '../rede/partida';
import { anexarCena } from './cena';
import { botao, elemento, palco, sairComEsmaecer } from './dom';

// Uma linha sobre cada poder, para o cartão.
export const SOBRE_PODER: Record<IdPoder, string> = {
  chicote: 'uma vinha de espinhos que envenena; o veneno cura você',
  raizes: 'uma fileira de raízes rompe a terra e prende; a última, por mais tempo',
  flor: 'com a energia cheia: uma flor carnívora brota, persegue e cospe veneno de longe',
  impacto: 'uma fileira de explosões correndo pelo chão',
  rajada: 'dois corações que enfeitiçam quem acertam',
  julgamento: 'um pilar de luz desce do céu',
  aves: 'três águias agarram, levam bem alto e para longe e largam lá de cima',
  vento: 'segurando o botão, uma ventania com folhas empurra para longe',
  golem: 'com a energia cheia: vira golem de pedra (Salto, Investida e Pedra) e segura parte do dano',
  salto: 'pula alto e esmaga quem está embaixo',
  investida: 'corre em linha reta atropelando quem estiver na frente',
  pedra: 'arremessa um pedregulho que estoura em lascas',
};

const QUADRO_CORRENDO = 0.09; // segundos por quadro da corrida no cartão

// O que chega da sala enquanto a tela está aberta.
// `pendentes`: o que a sala mandou antes de a tela abrir (na revanche, o outro pode escolher antes).
export interface SalaNaSelecao {
  conexao: ConexaoPartida;
  oponente: string;
  pendentes?: MensagemPartidaDoServidor[];
}

// `comecouEm`: performance.now() de quando chegou o aviso — dele contam o carregamento, a
// contagem e o relógio, iguais para os dois.
export interface ComecouOnline {
  lado: Lado;
  oponente: string;
  restanteMs: number;
  heroi: Heroi;
  heroiOponente: Heroi;
  comecouEm: number;
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
  cartao.append(palcoSprite, nome, poderes);
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

// `anterior`: jogando de novo, o personagem da rodada que acabou já vem escolhido.
export function telaSelecao(sala?: SalaNaSelecao, anterior?: Heroi): Promise<ResultadoSelecao> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-selecao-tela');
    const titulo = elemento('h1', 'inicio-titulo', 'Escolha o personagem');
    const sub = elemento('p', 'inicio-sub', sala ? `Partida contra ${sala.oponente}` : 'A CPU vai ser outro personagem, sorteado');
    const grade = elemento('div', 'inicio-cartoes');
    grade.setAttribute('role', 'radiogroup');
    grade.setAttribute('aria-label', 'Personagens');
    const estado = elemento('p', 'inicio-aguarde inicio-selecao-estado');
    estado.setAttribute('aria-live', 'polite');
    const acoes = elemento('div', 'inicio-acoes');

    const liberados = HEROIS.filter((h) => LIBERADO[h]);
    let escolhido: Heroi = anterior && liberados.includes(anterior) ? anterior : liberados[0];
    let confirmado = false;
    let acabou = false;
    const podeTrocar = sala ? `Até ${sala.oponente} escolher, dá para trocar.` : '';

    const cartoes = liberados.map((heroi) => montarCartao(heroi, () => escolher(heroi)));
    grade.append(...cartoes.map((c) => c.elemento));

    const escolher = (heroi: Heroi): void => {
      if (!LIBERADO[heroi]) return;
      const trocou = heroi !== escolhido;
      escolhido = heroi;
      for (const c of cartoes) {
        const ativo = c.heroi === heroi;
        c.elemento.classList.toggle('inicio-cartao-escolhido', ativo);
        c.elemento.setAttribute('aria-checked', String(ativo));
      }
      // Online, já pronto: a troca vai para o servidor na hora (vale até o outro escolher).
      if (sala && confirmado && trocou) {
        sala.conexao.escolherHeroi(heroi);
        estado.textContent = `Trocado para ${SOBRE_HEROI[heroi].nome}. ${podeTrocar}`;
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
      // Online: manda a escolha e espera o outro (a partida começa quando os dois escolherem). Os
      // cartões continuam valendo: trocar manda a nova escolha.
      confirmado = true;
      sala.conexao.escolherHeroi(escolhido);
      jogar.disabled = true;
      jogar.textContent = 'Pronto!';
      estado.textContent = `Pronto! ${podeTrocar}`;
    });
    const voltar = botao(sala ? 'Sair da sala' : 'Voltar', 'inicio-botao inicio-botao-claro', () => {
      sala?.conexao.fechar();
      terminar({ tipo: 'voltou' });
    });
    acoes.append(voltar, jogar);

    if (sala) {
      estado.textContent = `${sala.oponente} está escolhendo…`;
      const ouvir = (m: MensagemPartidaDoServidor): void => {
          // Qual ele escolheu, só na partida.
          if (m.tipo === 'oponente-escolheu') estado.textContent = `${sala.oponente} já escolheu e está esperando você.`;
          if (m.tipo === 'comecou') {
            const { lado, oponente, restanteMs, heroi, heroiOponente } = m;
            terminar({ tipo: 'comecou', partida: { lado, oponente, restanteMs, heroi, heroiOponente, comecouEm: performance.now() } });
          }
          if (m.tipo === 'fim') terminar({ tipo: 'caiu', erro: `${sala.oponente} saiu da sala.` });
      };
      sala.conexao.ouvir(ouvir, (erro) => terminar({ tipo: 'caiu', erro }));
      for (const m of sala.pendentes ?? []) ouvir(m);
    }

    // Setas (ou A/D) andam entre os liberados; Enter joga; Esc volta.
    const aoTeclar = (evento: KeyboardEvent): void => {
      const passo = ['ArrowLeft', 'KeyA'].includes(evento.code) ? -1 : ['ArrowRight', 'KeyD'].includes(evento.code) ? 1 : 0;
      if (passo) {
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

    // Os sprites dos cartões andam enquanto a tela estiver aberta. Na mesma rede, avisa quando os
    // dois computadores se ligaram direto.
    let avisouLigacao = false;
    const animar = (agora: number): void => {
      if (!tela.isConnected) return;
      if (sala && !avisouLigacao && sala.conexao.direta()) {
        avisouLigacao = true;
        sub.textContent = `Partida contra ${sala.oponente} · ligados direto pela rede`;
      }
      for (const c of cartoes) desenharSprite(c, c.heroi === escolhido, agora / 1000);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
    // Sem foco inicial em nenhum botão (o contorno do foco parecia uma escolha já feita): o Enter
    // joga do mesmo jeito.
  });
}
