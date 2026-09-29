// Tela de seleção de personagem. Vem depois do Singleplayer e, no Multiplayer, com os dois já
// na sala (os dois escolhem ao mesmo tempo; a partida começa quando os dois escolherem). Cada
// personagem é de um jogador só na partida: sozinho, a CPU espera a sua escolha e fica com outro;
// no Multiplayer, o que um escolhe (apertando Jogar) aparece na hora para o outro, com o nome de
// quem pegou, e fica bloqueado para ele — os dois apertando juntos no mesmo, leva quem chegou
// primeiro ao servidor, e o outro volta a escolher. Depois de apertar Jogar, ainda dá para trocar
// por um livre até o outro escolher (a troca vai na hora).
//
// No Multiplayer, a escolha tem prazo (a contagem fica em cima dos cartões): acabando antes de os
// dois escolherem, ninguém entra no jogo e a sala cai. Caindo a sala — o prazo, o outro saindo, a
// rede —, a tela termina com o aviso para a tela inicial.
//
// Cada personagem é um cartão pequeno com o retrato (o mesmo da tela dos personagens) — e, o
// escolhido, o sprite correndo no lugar dele —, o nome e o codinome. O que cada um faz não aparece
// aqui (os poderes do seu estão no Tab, na partida). Só aparecem os liberados: o Anjo, pronto mas
// guardado, não é mostrado. Nenhum começa escolhido (nem jogando de novo): o Jogar só acende
// depois de a pessoa clicar num.
//
// Setas (ou A/D) passam de um cartão para o outro (pulando o do outro), Enter joga e Esc volta.

import { HEROIS, LIBERADO, SOBRE_HEROI, type Heroi, type Lado, type MensagemPartidaDoServidor } from '@terna/compartilhado';
import { spritesDo } from '../entidades/personagem';
import { contexto2d } from '../motor/imagens';
import type { ConexaoPartida } from '../rede/partida';
import { anexarCena } from './cena';
import { botao, elemento, mostrarTela, sairComEsmaecer } from './dom';
import { RETRATO, enquadrarRetrato } from './terras';

const QUADRO_CORRENDO = 0.09; // segundos por quadro da corrida no cartão
// O retrato no cartão: quantos pixels da arte cabem de largura e a altura dos olhos (fração do
// palco): a cabeça inteira, do cabelo ao ombro.
const JANELA_DO_RETRATO = 380;
const OLHOS_DO_RETRATO = 0.56;

// O que chega da sala enquanto a tela está aberta.
// `prazoAte`: performance.now() em que acaba o tempo de escolher (do `escolher` da sala).
// `pendentes`: o que a sala mandou antes de a tela abrir (na revanche, o outro pode escolher antes).
export interface SalaNaSelecao {
  conexao: ConexaoPartida;
  oponente: string;
  prazoAte: number;
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
  | { tipo: 'caiu'; aviso: string }; // online: a sala caiu (o outro saiu, o prazo acabou, a rede caiu)

// O que o servidor disse ao fechar a sala, pronto para a tela inicial (com maiúscula e ponto).
function avisoDaQueda(erro: string | null): string {
  const texto = erro ?? 'a conexão com o servidor caiu';
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}${/[.!?]$/.test(texto) ? '' : '.'}`;
}

// O que falta do prazo, como no relógio: 1:05, 0:09.
function relogio(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface Cartao {
  heroi: Heroi;
  elemento: HTMLButtonElement;
  sprite: HTMLCanvasElement;
  dono: HTMLSpanElement; // a etiqueta de quem está com ele: "Você" ou o nome do outro
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
  const dono = elemento('span', 'inicio-cartao-dono');
  dono.hidden = true;
  // Antes de escolher, o retrato (enquadrado pelo rosto, como na tela dos personagens); o
  // escolhido troca para o sprite correndo (o CSS troca um pelo outro).
  if (RETRATO[heroi]) {
    const retrato = elemento('span', 'inicio-cartao-retrato');
    const img = elemento('img', '');
    img.alt = '';
    img.draggable = false;
    retrato.append(img);
    palcoSprite.append(retrato);
    cartao.classList.add('inicio-cartao-com-retrato');
    // O palco muda de tamanho com o quadro: o enquadramento acompanha.
    new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = palcoSprite;
      if (w && h) enquadrarRetrato(img, heroi, JANELA_DO_RETRATO, OLHOS_DO_RETRATO, h / w);
    }).observe(palcoSprite);
  }
  palcoSprite.append(sprite, dono);
  if (!liberado) palcoSprite.append(elemento('span', 'inicio-cartao-selo', 'Em breve'));

  cartao.append(palcoSprite, elemento('h2', 'inicio-cartao-nome', sobre.nome), elemento('p', 'inicio-cartao-codinome', sobre.codinome));
  return { heroi, elemento: cartao, sprite, dono };
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
    const sub = elemento('p', 'inicio-sub', sala ? `Partida contra ${sala.oponente}` : 'A CPU espera a sua escolha e fica com outro personagem');
    const grade = elemento('div', 'inicio-cartoes');
    grade.setAttribute('role', 'radiogroup');
    grade.setAttribute('aria-label', 'Personagens');
    // Online: quanto falta para acabar o tempo de escolher (a contagem anda em `animar`).
    const prazo = elemento('p', 'inicio-selecao-prazo');
    prazo.hidden = !sala;
    if (sala) prazo.textContent = `Tempo para escolher: ${relogio(sala.prazoAte - performance.now())}`;
    const estado = elemento('p', 'inicio-aguarde inicio-selecao-estado');
    estado.setAttribute('aria-live', 'polite');
    const acoes = elemento('div', 'inicio-acoes');

    const liberados = HEROIS.filter((h) => LIBERADO[h]);
    let escolhido: Heroi | null = null; // nenhum até a pessoa clicar num
    let confirmado = false;
    let doOutro: Heroi | null = null; // o que o outro escolheu: bloqueado para você
    let acabou = false;
    const podeTrocar = sala ? `Até ${sala.oponente} escolher, dá para trocar.` : '';
    const nome = (heroi: Heroi): string => SOBRE_HEROI[heroi].nome;
    const livres = (): Heroi[] => liberados.filter((h) => h !== doOutro);

    const cartoes = liberados.map((heroi) => montarCartao(heroi, () => escolher(heroi, true)));
    grade.append(...cartoes.map((c) => c.elemento));

    // Pinta os cartões: o seu destacado (com "Você" depois de apertar Jogar) e o do outro com o
    // nome dele, bloqueado. O Jogar só acende com um livre escolhido e ainda não confirmado.
    const pintar = (): void => {
      jogar.disabled = confirmado || !escolhido || escolhido === doOutro;
      jogar.classList.toggle('inicio-jogar-pronto', confirmado);
      for (const c of cartoes) {
        if (!LIBERADO[c.heroi]) continue;
        const meu = c.heroi === escolhido;
        const dele = c.heroi === doOutro;
        c.elemento.classList.toggle('inicio-cartao-escolhido', meu);
        c.elemento.classList.toggle('inicio-cartao-do-outro', dele);
        c.elemento.setAttribute('aria-checked', String(meu));
        if (dele) c.elemento.setAttribute('aria-disabled', 'true');
        else c.elemento.removeAttribute('aria-disabled');
        const rotulo = dele ? `${nome(c.heroi)}, escolhido por ${sala?.oponente}` : `${nome(c.heroi)}, ${SOBRE_HEROI[c.heroi].codinome}`;
        c.elemento.setAttribute('aria-label', rotulo);
        const dono = dele ? (sala?.oponente ?? '') : meu && confirmado ? 'Você' : '';
        c.dono.textContent = dono;
        c.dono.hidden = !dono;
        c.dono.classList.toggle('inicio-cartao-dono-outro', dele);
      }
    };

    // `clicou`: foi a pessoa (e não a tela se ajeitando): o do outro avisa por que não dá.
    const escolher = (heroi: Heroi, clicou = false): void => {
      if (!LIBERADO[heroi]) return;
      if (heroi === doOutro) {
        if (clicou && sala) estado.textContent = `${nome(heroi)} já é de ${sala.oponente} nesta partida.`;
        return;
      }
      const trocou = heroi !== escolhido;
      escolhido = heroi;
      pintar();
      // Online, já pronto: a troca vai para o servidor na hora (vale até o outro escolher).
      if (sala && confirmado && trocou) {
        sala.conexao.escolherHeroi(heroi);
        estado.textContent = `Trocado para ${nome(heroi)}. ${podeTrocar}`;
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
      if (confirmado || !escolhido || escolhido === doOutro) return;
      if (!sala) return terminar({ tipo: 'escolheu', heroi: escolhido });
      // Online: manda a escolha, que o outro vê na hora, e espera ele (a partida começa quando os
      // dois escolherem). Os cartões continuam valendo: trocar manda a nova escolha.
      confirmado = true;
      sala.conexao.escolherHeroi(escolhido);
      jogar.textContent = 'Pronto!';
      estado.textContent = `Pronto! ${podeTrocar}`;
      pintar();
    });
    const voltar = botao(sala ? 'Sair da sala' : 'Voltar', 'inicio-botao inicio-botao-claro', () => {
      sala?.conexao.fechar();
      terminar({ tipo: 'voltou' });
    });
    acoes.append(voltar, jogar);

    if (sala) {
      estado.textContent = `${sala.oponente} está escolhendo… Quem apertar Jogar primeiro fica com o personagem.`;
      // O outro escolheu (ou trocou): esse fica bloqueado. Se era o seu, você fica sem nenhum e
      // escolhe de novo — e, se já tinha apertado Jogar, o dele chegou antes: o seu não valeu.
      const outroEscolheu = (heroi: Heroi): void => {
        doOutro = heroi;
        if (escolhido === heroi) {
          const perdeu = confirmado;
          confirmado = false;
          escolhido = null;
          jogar.textContent = 'Jogar';
          estado.textContent = perdeu
            ? `${sala.oponente} pegou ${nome(heroi)} primeiro. Escolha outro personagem.`
            : `${sala.oponente} escolheu ${nome(heroi)} e está esperando você.`;
        } else {
          estado.textContent = confirmado ? `${sala.oponente} escolheu ${nome(heroi)}.` : `${sala.oponente} escolheu ${nome(heroi)} e está esperando você.`;
        }
        pintar();
      };
      const ouvir = (m: MensagemPartidaDoServidor): void => {
        if (m.tipo === 'oponente-escolheu') outroEscolheu(m.heroi);
        if (m.tipo === 'comecou') {
          const { lado, oponente, restanteMs, heroi, heroiOponente } = m;
          terminar({ tipo: 'comecou', partida: { lado, oponente, restanteMs, heroi, heroiOponente, comecouEm: performance.now() } });
        }
        if (m.tipo === 'fim') terminar({ tipo: 'caiu', aviso: `${sala.oponente} saiu da sala.` });
      };
      sala.conexao.ouvir(ouvir, (erro) => terminar({ tipo: 'caiu', aviso: avisoDaQueda(erro) }));
      for (const m of sala.pendentes ?? []) ouvir(m);
    }

    // Setas (ou A/D) andam entre os livres; Enter joga; Esc volta.
    const aoTeclar = (evento: KeyboardEvent): void => {
      const passo = ['ArrowLeft', 'KeyA'].includes(evento.code) ? -1 : ['ArrowRight', 'KeyD'].includes(evento.code) ? 1 : 0;
      if (passo) {
        evento.preventDefault();
        const opcoes = livres();
        const i = escolhido ? opcoes.indexOf(escolhido) : -1;
        // Sem nenhum escolhido, a seta para a direita pega o primeiro; para a esquerda, o último.
        escolher(opcoes[i < 0 ? (passo > 0 ? 0 : opcoes.length - 1) : (i + passo + opcoes.length) % opcoes.length]);
        cartoes.find((c) => c.heroi === escolhido)?.elemento.focus();
      } else if (evento.code === 'Enter' && !(evento.target instanceof HTMLButtonElement && evento.target !== jogar && !grade.contains(evento.target))) {
        // Com o foco num cartão (as setas o põem lá), o Enter também joga; no Voltar, volta.
        evento.preventDefault();
        jogar.click();
      } else if (evento.code === 'Escape') {
        evento.preventDefault();
        voltar.click();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    tela.append(titulo, sub, prazo, grade, estado, acoes);
    anexarCena(tela);
    mostrarTela(tela);
    pintar();

    // Os sprites dos cartões andam enquanto a tela estiver aberta, e a contagem do prazo corre
    // (vermelha no fim). Na mesma rede, avisa quando os dois computadores se ligaram direto.
    let avisouLigacao = false;
    const animar = (agora: number): void => {
      if (!tela.isConnected) return;
      if (sala && !avisouLigacao && sala.conexao.direta()) {
        avisouLigacao = true;
        sub.textContent = `Partida contra ${sala.oponente} · ligados direto pela rede`;
      }
      if (sala) {
        const falta = sala.prazoAte - agora;
        const texto = `Tempo para escolher: ${relogio(falta)}`;
        if (prazo.textContent !== texto) prazo.textContent = texto;
        prazo.classList.toggle('inicio-selecao-prazo-fim', falta <= 10_000);
      }
      for (const c of cartoes) desenharSprite(c, c.heroi === escolhido, agora / 1000);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);
    // Sem foco inicial em nenhum botão (o contorno do foco parecia uma escolha já feita): o Enter
    // joga do mesmo jeito.
  });
}
