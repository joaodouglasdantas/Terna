// Ponto de entrada do jogo: carrega as folhas de sprite, monta o mundo e roda o laço
// principal (atualizar → desenhar) a cada quadro do navegador. Por cima, o ciclo das telas:
// carregamento → tela inicial → partida → fim → tela inicial de novo.

import { CARREGAMENTO_MS, MUNDO } from '@terna/compartilhado';
import { atualizarAnimais, desenharAnimais, desenharAnimaisNoAr, prepararAnimais } from './entidades/animais';
import { desenharArmasNaFrente, desenharArmasNoChao, desenharPreviaDoArco, prepararArmas } from './entidades/armas';
import {
  acimaDaCabeca,
  armaPronta,
  carregarHerois,
  desenharPersonagem,
  desenharSombraDoPersonagem,
  peitoDo,
  podeUsarPoderes,
  prepararPersonagens,
  usaPoderes,
  type Controles,
  type Personagem,
} from './entidades/personagem';
import {
  desenharBordaDoEncanto,
  desenharEfeitosNaFrente,
  desenharEfeitosNoChao,
  desenharNumerosDeDano,
  desenharPreviaDoPoder,
  poderEscolhido,
  prepararPoderes,
} from './entidades/poderes';
import { desenharLuzAtras, desenharLuzNaFrente } from './entidades/luz-da-vitoria';
import { esconderCena, prepararCena } from './inicio/cena';
import { abrirCortina, fecharCortina } from './inicio/dom';
import { aparelhoMovel, telaSoNoComputador } from './inicio/aparelho';
import { carregar, escolherModo, type Escolha } from './inicio/inicio';
import { ouvirRevanche } from './inicio/revanche';
import { telaSelecao, type SalaNaSelecao } from './inicio/selecao';
import { telaTemporada } from './inicio/temporada';
import { vigiarJanela } from './inicio/janela';
import { montarMenus, type MenusDaPartida } from './inicio/na-partida';
import { criarBordas, desenharBordas, sentirBordas } from './interface/bordas';
import { desenharContagem } from './interface/contagem';
import { desenharCronometro } from './interface/cronometro';
import { desenharEtiquetas } from './interface/etiqueta';
import { aplicarMira } from './interface/mira';
import { desenharPainel } from './interface/painel';
import { contexto2d } from './motor/imagens';
import { suavizar } from './motor/matematica';
import type { Luz, Vista } from './motor/tipos';
import {
  atualizarPassaros,
  carregarFolhaCenario,
  desenharFundo,
  desenharLuz,
  desenharVegetacao,
  luzDoSol,
} from './mundo/cenario';
import { TILE, criarChao } from './mundo/chao';
import { atualizarMinhocas, desenharMinhocas, prepararMinhocas } from './mundo/minhocas';
import {
  atualizarPartida,
  criarPartida,
  encerrarPartida,
  type AcoesMouse,
  type FimDaPartida,
  type Partida,
} from './partida';
import { tocarMusica } from './som/musica';

const canvas = document.getElementById('jogo');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('faltou o <canvas id="jogo"> na página');
const ctx = contexto2d(canvas);
ctx.imageSmoothingEnabled = false;

const LARGURA = canvas.width;
const ALTURA = canvas.height;
const ALTURA_CHAO = 3 * TILE;
const Y_CHAO = ALTURA - ALTURA_CHAO;

const FOLGA_TUFOS = 4;
const chao = criarChao(MUNDO, ALTURA_CHAO, FOLGA_TUFOS);

const SEGUIR_CAMERA = 5; // quanto maior, mais rápido a câmera alcança o personagem

let folhaCenario: HTMLImageElement;
// A partida em andamento. Sem ela (nas telas de menu), só o cenário roda ao fundo: sem
// personagens, nomes, painéis nem cronômetro.
let partida: Partida | null = null;
// Os menus por cima dela (a engrenagem, o Esc): a janela ficando pequena demais abre o menu.
let menusDaPartida: MenusDaPartida | null = null;

// ---- Câmera e tela dividida ----
// Cada metade da tela é uma janela sobre uma tela inteira com câmera própria: a da esquerda
// mostra a parte de 0 a METADE da vista da câmera `esquerda`; a da direita, a parte de METADE
// a LARGURA da vista da câmera `direita`. Com as duas câmeras no mesmo lugar as metades se
// encaixam e a tela é uma só. Enquanto os dois cabem juntos na tela, as duas câmeras seguem o
// ponto do meio entre eles. Passando disso, a tela se divide — quem está mais à esquerda fica
// na metade da esquerda — e, ao longo de SEPARANDO pixels de afastamento, cada câmera vai
// centralizar o seu personagem na sua metade. A divisão nasce sem tranco (no começo as metades
// mostram a mesma imagem de antes) e some do mesmo jeito quando eles se reaproximam.
// Céu, sol e luz são da tela, não do mapa: ficam no mesmo lugar nas duas metades.
const METADE = LARGURA / 2;
const MARGEM_JUNTOS = 40; // pixels da borda: mais perto disso, um sairia da vista do outro
const JUNTOS = LARGURA - 2 * MARGEM_JUNTOS; // maior distância entre os dois com a tela inteira
const SEPARANDO = 120; // pixels de afastamento para cada metade centralizar o seu personagem
const DIVISAO_APARECE = 12; // pixels de diferença entre as câmeras até a linha ficar inteira

// `esquerda` e `direita`: borda esquerda da tela inteira de cada câmera, no mapa (0 a MUNDO - LARGURA).
// `dividida` só liga com as câmeras a 1 px uma da outra e só desliga abaixo de meio pixel: com
// menos que isso, o arredondamento fazia a tela piscar entre inteira e dividida.
const CAMERA_NO_MEIO = (MUNDO - LARGURA) / 2;
const camera = { esquerda: CAMERA_NO_MEIO, direita: CAMERA_NO_MEIO, dividida: false };

const limitarCamera = (x: number): number => Math.max(0, Math.min(MUNDO - LARGURA, x));

function atualizarCamera(p: Partida, dt: number): void {
  const [a, b] = p.jogador.x <= p.outro.x ? [p.jogador.x, p.outro.x] : [p.outro.x, p.jogador.x];
  const juntos = (a + b) / 2 - METADE;
  const separar = suavizar(JUNTOS, JUNTOS + SEPARANDO, b - a);
  // Separados: `a` no meio da metade da esquerda (x = METADE / 2), `b` no meio da da direita.
  const alvoEsquerda = limitarCamera(juntos + (a - METADE / 2 - juntos) * separar);
  const alvoDireita = limitarCamera(juntos + (b - (METADE + METADE / 2) - juntos) * separar);
  // As câmeras perseguem o alvo com suavidade e param nas bordas do mapa: ali quem anda até a
  // beirada é o personagem.
  const k = Math.min(1, dt * SEGUIR_CAMERA);
  camera.esquerda += (alvoEsquerda - camera.esquerda) * k;
  camera.direita += (alvoDireita - camera.direita) * k;
  const diferenca = Math.abs(camera.direita - camera.esquerda);
  camera.dividida = diferenca >= (camera.dividida ? 0.5 : 1);
}

// Onde cada câmera está, em pixels inteiros. Sem divisão, a tela inteira usa a da esquerda.
function camerasNaTela(): { esquerda: number; direita: number; dividida: boolean } {
  const esquerda = Math.round(camera.esquerda);
  const direita = camera.dividida ? Math.round(camera.direita) : esquerda;
  return { esquerda, direita, dividida: camera.dividida };
}

// Os trechos do mapa que aparecem: um com a tela inteira, dois com ela dividida.
function vistas(): Vista[] {
  const { esquerda, direita, dividida } = camerasNaTela();
  if (!dividida) return [{ x: esquerda, largura: LARGURA }];
  return [
    { x: esquerda, largura: METADE },
    { x: direita + METADE, largura: METADE },
  ];
}

const teclas: Record<string, boolean> = {};
window.addEventListener('keydown', (evento) => {
  teclas[evento.code] = true;
  // E joga fora a arma da mão: uma vez por toque (segurar não repete).
  if (evento.code === 'KeyE' && !evento.repeat && partida) mouse.descartar = true;
  // Um toque rápido em R (apertar e soltar entre dois quadros) não se perde.
  if (evento.code === 'KeyR' && !evento.repeat) toqueR = true;
});
window.addEventListener('keyup', (evento) => {
  teclas[evento.code] = false;
});
// Trocando de aba com uma tecla apertada, o keyup não chega: solta tudo.
window.addEventListener('blur', soltarTeclas);

function soltarTeclas(): void {
  for (const tecla of Object.keys(teclas)) teclas[tecla] = false;
}

let toqueR = false;

function lerTeclado(): Controles {
  const r = toqueR;
  toqueR = false;
  return {
    esquerda: Boolean(teclas['ArrowLeft'] || teclas['KeyA']),
    direita: Boolean(teclas['ArrowRight'] || teclas['KeyD']),
    pular: Boolean(teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW']),
    // R: a Leslie e o Grow trocam a arma pelos poderes (e voltam; o golem desfaz a pedra); o Anjo
    // alterna entre a forma base e a de anjo.
    transformar: Boolean(teclas['KeyR']) || r,
  };
}

// ---- Mouse ----
// Na partida, o botão direito passa para o próximo poder e o esquerdo usa o escolhido (na forma
// base, ataca com a arma da mão), mirando no ponto do mapa embaixo do cursor. Com a tela dividida, cada metade tem a sua câmera: o
// ponto sai da câmera da metade clicada. O menu do botão direito do navegador não abre no jogo.
// Em cima do jogo, no lugar da seta do sistema, o cursor vira a mira (interface/mira.ts). A
// posição guardada aqui serve às prévias do poder e do arco.
const mouse: AcoesMouse = { trocar: 0, usar: null, segurando: false, descartar: false };
const cursor = { x: 0, y: 0, dentro: false }; // em pixels da tela do jogo

function pontoNaTela(evento: PointerEvent): { x: number; y: number } {
  const caixa = ctx.canvas.getBoundingClientRect();
  return {
    x: ((evento.clientX - caixa.left) / caixa.width) * LARGURA,
    y: ((evento.clientY - caixa.top) / caixa.height) * ALTURA,
  };
}

function telaParaMapa({ x, y }: { x: number; y: number }): { x: number; y: number } {
  const { esquerda, direita, dividida } = camerasNaTela();
  const altos = olharNaTela();
  const naDireita = dividida && x >= METADE;
  return { x: (naDireita ? direita : esquerda) + x, y: y - (naDireita ? altos.direita : altos.esquerda) };
}

canvas.addEventListener('contextmenu', (evento) => evento.preventDefault());
canvas.addEventListener('pointerdown', (evento) => {
  if (!partida || evento.pointerType === 'touch') return;
  if (evento.button === 2) mouse.trocar++;
  else if (evento.button === 0) {
    mouse.usar = telaParaMapa(pontoNaTela(evento));
    mouse.segurando = true;
  }
});
// O botão esquerdo solto (em qualquer lugar da página): o Vendaval do Grow para.
window.addEventListener('pointerup', (evento) => {
  if (evento.button === 0) mouse.segurando = false;
});
window.addEventListener('blur', () => {
  mouse.segurando = false;
});
canvas.addEventListener('pointermove', (evento) => {
  if (evento.pointerType === 'touch') return;
  Object.assign(cursor, pontoNaTela(evento), { dentro: true });
});
canvas.addEventListener('pointerleave', () => {
  cursor.dentro = false;
});

// A mira aparece na partida, com o cursor em cima do jogo e fora do menu.
const mostrarMira = (p: Partida): boolean => cursor.dentro && !p.menuAberto && !p.acabou;

// O clique sai agora? Com os poderes na mão (a Leslie no modo poderes, o Anjo de anjo), o poder
// escolhido; senão, a arma da mão. (Pinta a mira de verde e mostra a prévia.)
function acaoPronta(p: Partida): boolean {
  if (!usaPoderes(p.jogador)) return armaPronta(p.jogador);
  const { poderes } = p.jogador;
  return podeUsarPoderes(p.jogador) && poderes.recarga[poderes.selecionado] <= 0;
}

// O que o mouse (e a tecla E) fez desde o último quadro, uma vez só.
function lerMouse(): AcoesMouse {
  const acoes = { ...mouse };
  mouse.trocar = 0;
  mouse.usar = null;
  mouse.descartar = false;
  // `segurando` continua até o botão ser solto.
  return acoes;
}

// As bordas da sua tela (apanhou, envenenado, preso…): interface/bordas.ts.
let bordas = criarBordas();
// A câmera na vertical: com o personagem no alto (pulando, voando, levado pelas águias), ela sobe
// um pouco atrás dele — a cena toda desce na tela: chão, árvores, bichos, efeitos e, com
// paralaxe (o longe mexe menos: desenharFundo), a paisagem, as nuvens, os pássaros e o sol. É só
// uma mexida leve: `porPixel` de cada pixel de altura, até `maxima`, e persegue o alvo devagar
// (`seguir`, por segundo), sem tranco. Com a tela dividida, cada metade olha o personagem dela.
const OLHAR = { porPixel: 0.16, maxima: 18, seguir: 2.2 };
const olhar = { esquerda: 0, direita: 0 };

function atualizarOlhar(dt: number): void {
  const altura = (quem: Personagem | undefined): number => (quem ? Math.max(0, Y_CHAO - quem.y) : 0);
  const p = partida;
  // Tela inteira: o seu personagem; dividida, o da esquerda e o da direita.
  let [esquerda, direita] = [p?.jogador, p?.jogador];
  if (p && camera.dividida) [esquerda, direita] = p.jogador.x <= p.outro.x ? [p.jogador, p.outro] : [p.outro, p.jogador];
  const k = Math.min(1, dt * OLHAR.seguir);
  olhar.esquerda += (Math.min(OLHAR.maxima, altura(esquerda) * OLHAR.porPixel) - olhar.esquerda) * k;
  olhar.direita += (Math.min(OLHAR.maxima, altura(direita) * OLHAR.porPixel) - olhar.direita) * k;
}

// Quanto a cena desce em cada metade, em pixels inteiros (inteira, a da esquerda vale para tudo).
function olharNaTela(): { esquerda: number; direita: number } {
  const esquerda = Math.round(olhar.esquerda);
  return { esquerda, direita: camera.dividida ? Math.round(olhar.direita) : esquerda };
}

function atualizar(dt: number, tempo: number): void {
  const acoes = lerMouse();
  if (partida) {
    atualizarPartida(partida, lerTeclado(), acoes, dt, tempo);
    atualizarCamera(partida, dt);
    sentirBordas(bordas, partida.jogador, dt);
  }
  atualizarOlhar(dt);
  const { esquerda, direita } = camerasNaTela();
  atualizarPassaros(dt, LARGURA, esquerda, direita);
  atualizarAnimais(dt, partida ? [partida.jogador, partida.outro] : [], vistas());
  atualizarMinhocas(dt);
}

// Uma tela inteira vista pela câmera `camX`, recortada na faixa de `x0` a `x0 + largura` da
// tela. O fundo é desenhado em coordenadas de tela, com paralaxe; chão, plantas da frente e os
// personagens em coordenadas do mapa, deslocados pela câmera (`olharY`: o quanto ela subiu, e a
// cena desce).
function desenharVista(tempo: number, luz: Luz, camX: number, olharY: number, x0: number, largura: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, largura, ALTURA);
  ctx.clip();
  desenharFundo(ctx, folhaCenario, tempo, luz, camX, LARGURA, ALTURA, Y_CHAO, olharY);

  ctx.translate(-camX, olharY);
  ctx.drawImage(chao, 0, Y_CHAO - FOLGA_TUFOS);
  desenharMinhocas(ctx, camX, LARGURA);
  desenharVegetacao(ctx, folhaCenario, tempo, luz, Y_CHAO, camX, LARGURA);
  desenharAnimais(ctx, luz, tempo, camX, LARGURA);

  if (partida) {
    // As marcas dos poderes no chão, embaixo de todos; o outro atrás e você na frente, quando um
    // passa pelo outro; os poderes voando e explodindo por cima dos dois.
    desenharEfeitosNoChao(ctx, partida.efeitos, tempo);
    desenharArmasNoChao(ctx, partida.arsenal, tempo);
    desenharSombraDoPersonagem(ctx, partida.outro, luz);
    desenharSombraDoPersonagem(ctx, partida.jogador, luz);
    // Quem venceu: o facho de luz do céu por trás e o brilho por cima.
    const vencedor = partida.fim?.vencedor;
    if (vencedor) desenharLuzAtras(ctx, vencedor.x, vencedor.y, partida.fim!.ha, tempo);
    desenharPersonagem(ctx, partida.outro, tempo);
    desenharPersonagem(ctx, partida.jogador, tempo);
    if (vencedor) desenharLuzNaFrente(ctx, vencedor.x, vencedor.y, vencedor.medida.altura, partida.fim!.ha, tempo);
    desenharEfeitosNaFrente(ctx, partida.efeitos, tempo);
    desenharArmasNaFrente(ctx, partida.arsenal);
    if (mostrarMira(partida) && acaoPronta(partida)) {
      const { jogador } = partida;
      if (usaPoderes(jogador)) {
        desenharPreviaDoPoder(ctx, poderEscolhido(jogador.poderes), peitoDo(jogador), telaParaMapa(cursor), tempo);
      } else if (jogador.arma?.tipo === 'arco') {
        desenharPreviaDoArco(ctx, jogador, telaParaMapa(cursor), tempo);
      }
    }
  }
  desenharAnimaisNoAr(ctx, luz, tempo, camX, LARGURA);
  ctx.restore();
}

// Os nomes em cima de cada um, na vista da câmera `camX` recortada como em desenharVista. O
// do outro vem primeiro: juntos, o nome dele é o que sobe. Os números de dano vêm por cima.
function desenharNomes(p: Partida, camX: number, olharY: number, x0: number, largura: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, largura, ALTURA);
  ctx.clip();
  ctx.translate(-camX, olharY);
  desenharEtiquetas(
    ctx,
    [
      { etiqueta: p.ele, x: p.outro.x, y: p.outro.y, acima: acimaDaCabeca(p.outro) },
      { etiqueta: p.eu, x: p.jogador.x, y: p.jogador.y, acima: acimaDaCabeca(p.jogador) },
    ],
    { x: camX + x0, largura },
  );
  desenharNumerosDeDano(ctx, p.efeitos);
  ctx.restore();
}

// A linha no meio da tela dividida: um vão escuro com um fio claro de cada lado. Vai
// aparecendo conforme as câmeras se afastam, junto com a diferença entre as metades.
function desenharDivisao(forca: number): void {
  ctx.fillStyle = `rgba(18, 22, 38, ${0.85 * forca})`;
  ctx.fillRect(METADE - 1, 0, 2, ALTURA);
  ctx.fillStyle = `rgba(255, 250, 235, ${0.45 * forca})`;
  ctx.fillRect(METADE - 2, 0, 1, ALTURA);
  ctx.fillRect(METADE + 1, 0, 1, ALTURA);
}

// `tempo` em segundos desde o início: move sol, nuvens, o balanço das árvores e a luz.
function desenhar(tempo: number): void {
  const luz = luzDoSol(tempo, LARGURA);
  const { esquerda, direita, dividida } = camerasNaTela();
  const altos = olharNaTela();
  if (dividida) {
    desenharVista(tempo, luz, esquerda, altos.esquerda, 0, METADE);
    desenharVista(tempo, luz, direita, altos.direita, METADE, METADE);
  } else {
    desenharVista(tempo, luz, esquerda, altos.esquerda, 0, LARGURA);
  }
  desenharLuz(ctx, luz, LARGURA, ALTURA);
  const p = partida;
  if (!p) return;
  // Os nomes vêm depois da luz, para o sol não tingir o azul e o vermelho.
  if (dividida) {
    desenharNomes(p, esquerda, altos.esquerda, 0, METADE);
    desenharNomes(p, direita, altos.direita, METADE, METADE);
  } else {
    desenharNomes(p, esquerda, altos.esquerda, 0, LARGURA);
  }
  if (dividida) desenharDivisao(Math.min(1, Math.abs(direita - esquerda) / DIVISAO_APARECE));
  // As bordas contam o que acontece com você (por baixo dos painéis): na tela toda, ou na sua
  // metade, com ela dividida. Enfeitiçado, a borda rosa.
  const minhaMetade = !dividida ? [0, LARGURA] : p.jogador.x <= p.outro.x ? [0, METADE] : [METADE, METADE];
  desenharBordas(ctx, bordas, p.jogador, minhaMetade[0], minhaMetade[1], ALTURA, tempo);
  if (p.jogador.encanto) desenharBordaDoEncanto(ctx, p.jogador.encanto, LARGURA, ALTURA, tempo);
  // Os painéis ficam sempre no mesmo canto: o seu à esquerda, o do outro à direita.
  desenharPainel(ctx, p.jogador, p.eu, 'esquerda', LARGURA, tempo, true);
  desenharPainel(ctx, p.outro, p.ele, 'direita', LARGURA, tempo);
  desenharCronometro(ctx, p.restanteMs, LARGURA, tempo);
  desenharContagem(ctx, p.contagem, p.relogio - p.contagemInicial, LARGURA, ALTURA);
}

// A mira é o cursor do sistema (interface/mira.ts): na partida, fora do menu e antes do fim.
function atualizarMira(): void {
  const p = partida;
  aplicarMira(ctx.canvas, p &&!p.menuAberto && !p.acabou ? (acaoPronta(p) ? 'pronta' : 'apagada') : null);
}

let ultimoTempo = 0;
function loop(tempoAtual: number): void {
  const dt = ultimoTempo ? Math.min((tempoAtual - ultimoTempo) / 1000, 1 / 30) : 0;
  ultimoTempo = tempoAtual;

  atualizar(dt, tempoAtual / 1000);
  desenhar(tempoAtual / 1000);
  atualizarMira();
  requestAnimationFrame(loop);
}

// Título e texto da tela de fim. `venceu` vale no fim por morte e no por tempo (quem tinha mais
// vida; null, empate).
function textoDoFim(motivo: FimDaPartida, venceu: boolean | null, oponente: string): { titulo: string; texto: string } {
  if (motivo === 'morte') {
    return venceu
      ? { titulo: 'Vitória', texto: `${oponente} caiu. Você venceu!` }
      : { titulo: 'Derrota', texto: `${oponente} venceu.` };
  }
  if (motivo === 'tempo' && venceu !== null) {
    return venceu
      ? { titulo: 'Vitória', texto: 'O tempo acabou, e você tinha mais vida!' }
      : { titulo: 'Derrota', texto: `O tempo acabou, e ${oponente === 'A CPU' ? 'a CPU' : oponente} tinha mais vida.` };
  }
  const texto = {
    tempo: 'O tempo acabou empatado.',
    'oponente-saiu': `${oponente} saiu da partida.`,
    conexao: 'A conexão com o servidor caiu.',
  }[motivo];
  return { titulo: 'Fim de partida', texto };
}

// No fim por morte, a tela espera um pouco: dá para ver o último golpe, quem caiu deitado no
// chão e a luz do céu em quem venceu.
const ESPERA_FIM_MORTE = 2800; // ms

// Uma partida inteira: começa, roda até o tempo acabar (ou alguém sair) e termina quando a
// pessoa volta ao menu (null) ou pede para jogar de novo: sozinho ('sozinho'), na hora; online,
// quando os dois pedem a revanche (a sala, para a escolha de personagem de novo).
function jogar(escolha: Escolha): Promise<SalaNaSelecao | 'sozinho' | null> {
  return new Promise((resolver) => {
    // Sai escurecendo: a próxima tela aparece do escuro. Com `proxima` (a revanche online), a
    // conexão continua aberta.
    const sair = (proxima?: SalaNaSelecao | 'sozinho'): void => {
      if (!partida) return;
      encerrarPartida(partida, typeof proxima !== 'object');
      void fecharCortina().then(() => {
        partida = null;
        menusDaPartida = null;
        camera.esquerda = camera.direita = CAMERA_NO_MEIO;
        olhar.esquerda = olhar.direita = 0;
        camera.dividida = false;
        resolver(proxima ?? null);
      });
    };
    const menus = montarMenus({
      online: escolha.modo === 'online',
      heroi: escolha.heroi,
      aoMudarMenu: (aberto) => {
        if (partida) partida.menuAberto = aberto;
        if (aberto) soltarTeclas();
      },
      aoSair: () => sair(),
    });
    menusDaPartida = menus;
    const nova = criarPartida(escolha, (motivo, venceu) => {
      const oponente = escolha.modo === 'online' ? escolha.oponente : 'A CPU';
      const { titulo, texto } = textoDoFim(motivo, venceu, oponente);
      // Por tempo ou morte dá para jogar de novo: sozinho, direto; online a sala continua e é a
      // revanche (já ouvindo, que o outro pode pedir antes de a tela de fim aparecer).
      const deNovo = motivo === 'morte' || motivo === 'tempo';
      const revanche =
        escolha.modo !== 'online' ? (deNovo ? 'sozinho' : undefined) : deNovo ? ouvirRevanche(escolha.conexao, escolha.oponente) : undefined;
      const mostrar = (): void =>
        void menus.mostrarFim(titulo, texto, revanche).then((como) => {
          if (como !== 'revanche' || !revanche) return sair();
          if (revanche === 'sozinho' || escolha.modo !== 'online') return sair('sozinho');
          sair({ conexao: escolha.conexao, oponente: escolha.oponente, prazoAte: revanche.prazoAte, pendentes: revanche.pendentes });
        });
      if (motivo === 'morte') setTimeout(mostrar, ESPERA_FIM_MORTE);
      else mostrar();
    });
    // Começa com a câmera já entre os dois (sem deslizar do meio do mapa).
    camera.esquerda = camera.direita = limitarCamera((nova.jogador.x + nova.outro.x) / 2 - METADE);
    // Teclas apertadas nas telas (o Enter do botão) não valem no jogo.
    soltarTeclas();
    partida = nova;
    bordas = criarBordas();
    // A partida aparece do escuro (a tela de antes sumiu escurecendo o jogo junto).
    void abrirCortina();
  });
}

// Carregamento primeiro (confere a arte, o servidor e o banco); depois o cenário começa a rodar
// atrás da tela inicial. Cada partida passa pelo carregamento da temporada; quando ela acaba, a
// tela inicial volta (ou, jogando de novo, a escolha de personagem).
async function principal(): Promise<void> {
  // No celular e no tablet, só o aviso: o jogo não carrega (inicio/aparelho.ts).
  if (aparelhoMovel()) return telaSoNoComputador();
  // Janela pequena demais: o aviso cobre tudo e, na partida, abre o menu (inicio/janela.ts).
  vigiarJanela(() => menusDaPartida?.abrirMenu());
  // A música das telas (começa no primeiro clique ou tecla: o navegador não deixa antes).
  tocarMusica('telas');
  const { cenario, herois, online } = await carregar({
    carregarCenario: carregarFolhaCenario,
    carregarHerois,
  });
  prepararPersonagens(herois, Y_CHAO);
  prepararPoderes(Y_CHAO, chao, FOLGA_TUFOS);
  prepararArmas(Y_CHAO);
  folhaCenario = cenario;
  prepararAnimais(cenario, Y_CHAO);
  prepararMinhocas(Y_CHAO, ALTURA_CHAO);
  prepararCena();
  requestAnimationFrame(loop);

  // A sala da revanche caindo na escolha (o outro saiu, o tempo de escolher acabou), a tela
  // inicial diz por quê.
  let aviso: string | undefined;
  for (;;) {
    let escolha: Escolha | null = await escolherModo(online, aviso);
    aviso = undefined;
    while (escolha) {
      const atual: Escolha = escolha;
      escolha = null;
      // O carregamento da temporada; online, termina junto para os dois (conta do início no
      // servidor). O outro saindo enquanto isso, volta ao menu.
      const ate = (atual.modo === 'online' ? atual.comecouEm : performance.now()) + CARREGAMENTO_MS;
      const online = atual.modo === 'online' ? { conexao: atual.conexao, oponente: atual.oponente } : undefined;
      const { saiu } = await telaTemporada({ ate, online });
      if (saiu) break;
      esconderCena(); // a arte do menu sai: a partida aparece atrás da tela do carregamento
      tocarMusica('combate');
      const revanche = await jogar(atual);
      tocarMusica('telas');
      // Jogar de novo: a escolha de personagem outra vez — sozinho, contra outra CPU sorteada;
      // online, na mesma sala, e os dois escolhendo começa outra rodada. Voltando, o menu.
      if (revanche === 'sozinho' && atual.modo === 'solo') {
        const r = await telaSelecao();
        if (r.tipo === 'escolheu') escolha = { modo: 'solo', nome: atual.nome, heroi: r.heroi };
      } else if (revanche && revanche !== 'sozinho' && atual.modo === 'online') {
        const r = await telaSelecao(revanche);
        if (r.tipo === 'comecou') escolha = { modo: 'online', nome: atual.nome, ...r.partida, conexao: atual.conexao };
        else if (r.tipo === 'caiu') aviso = r.aviso;
      }
    }
  }
}

void principal();
