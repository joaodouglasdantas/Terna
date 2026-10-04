// O passe da temporada (o botão do canto de cima da tela inicial e a tela dele). A tela é uma
// trilha de NIVEIS_DO_PASSE níveis, da esquerda para a direita: cada nível é um degrau com um nó
// na linha da trilha e um cartão embaixo, com a recompensa (azios, XP ou os dois; a cada 5 níveis,
// um maior). Os pontos das partidas vão liberando os níveis em ordem (PONTOS_POR_NIVEL_DO_PASSE
// cada um); o liberado ainda não resgatado brilha com o botão de resgatar, o resgatado fica com o
// visto e o ainda não liberado fica apagado, com o cadeado. A linha da trilha vai acendendo até
// onde os pontos chegaram, com o pedaço do nível seguinte enchendo.
//
// Em cima, quanto falta para o próximo nível, o nível do perfil e os azios; embaixo, resgatar
// todos de uma vez e voltar. A roda do mouse e as setas andam pela trilha; Esc volta. A conta
// mestre tem a trilha toda liberada e pode recomeçar o passe (para testar).
//
// Termina quando a pessoa volta para a tela inicial.

import {
  DIAS_DO_PASSE,
  GANHO_POR_PARTIDA,
  NIVEIS_DO_PASSE,
  PONTOS_POR_NIVEL_DO_PASSE,
  diasParaOPasseAcabar,
  nivelDoPerfil,
  nivelLiberadoDoPasse,
  passeAberto,
  type Jogador,
  type RecompensaDoPasse,
} from '@terna/compartilhado';
import { api, ErroApi } from '../rede/api';
import { atualizarConta, contaAtual, souMestre } from '../save/sessao';
import { anexarCena } from './cena';
import { botao, elemento, mostrarTela } from './dom';
import { barraDeNivel, contadorDeAzios, iconeAzio, iconeXp, numero } from './progresso';
import { TEMPORADA } from './temporada';

type Estado = 'resgatado' | 'liberado' | 'bloqueado';

// Até que nível a trilha está liberada para a conta (o mestre: toda).
const liberadoPara = (j: Jogador): number => (souMestre() ? NIVEIS_DO_PASSE.length : nivelLiberadoDoPasse(j.passe.pontos));

function estadoDo(nivel: number, j: Jogador): Estado {
  if (j.passe.resgatados.includes(nivel)) return 'resgatado';
  return nivel <= liberadoPara(j) ? 'liberado' : 'bloqueado';
}

// Quantos níveis estão liberados e ainda não foram resgatados (o selo do botão da tela inicial).
export function niveisParaResgatar(j: Jogador): number {
  let n = 0;
  for (let nivel = 1; nivel <= liberadoPara(j); nivel++) if (!j.passe.resgatados.includes(nivel)) n++;
  return n;
}

// O progresso no passe: o nível alcançado e quanto dos pontos do próximo já foi.
function progressoDoPasse(j: Jogador): { nivel: number; noNivel: number; completo: boolean } {
  const nivel = nivelLiberadoDoPasse(j.passe.pontos);
  const completo = nivel >= NIVEIS_DO_PASSE.length;
  return { nivel, noNivel: completo ? PONTOS_POR_NIVEL_DO_PASSE : j.passe.pontos - nivel * PONTOS_POR_NIVEL_DO_PASSE, completo };
}

const maior = (nivel: number): boolean => nivel % 5 === 0;

const mensagemDe = (erro: unknown): string =>
  erro instanceof ErroApi ? erro.message.charAt(0).toUpperCase() + erro.message.slice(1) : 'Algo deu errado; tente de novo.';

// Os algarismos do número do nível, em pixels (3×5), desenhados dentro do losango: assim o número
// fica exatamente no meio dele (com a fonte, cada tamanho de tela o deixava torto).
const ALGARISMOS: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

// Um losango de pixels com `r` de raio (largura 2r+1): o contorno escuro por fora, a borda, o
// miolo com a metade de cima mais clara e o número no meio. As cores vêm do CSS (.inicio-passe-no).
function losango(r: number, numero: number): SVGSVGElement {
  const lado = 2 * r + 1;
  // O número: os algarismos com 1 pixel entre eles, com o meio no pixel do meio do losango.
  const digitos = String(numero).split('');
  const largura = digitos.length * 4 - 1;
  const x0 = r - (largura - 1) / 2;
  const y0 = r - 2;
  const noNumero = (x: number, y: number): boolean => {
    const dx = x - x0;
    const dy = y - y0;
    if (dx < 0 || dy < 0 || dx >= largura || dy >= 5 || dx % 4 === 3) return false;
    return ALGARISMOS[digitos[Math.floor(dx / 4)]]?.[dy]?.[dx % 4] === '#';
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${lado} ${lado}`);
  svg.setAttribute('class', 'inicio-passe-losango');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (let y = 0; y < lado; y++) {
    // Um retângulo por trecho da mesma camada, na linha.
    let camada = '';
    let inicio = 0;
    const fecha = (fim: number): void => {
      if (!camada) return;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('class', camada);
      rect.setAttribute('x', String(inicio));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(fim - inicio));
      rect.setAttribute('height', '1');
      svg.append(rect);
    };
    for (let x = 0; x <= lado; x++) {
      const d = x < lado ? Math.abs(x - r) + Math.abs(y - r) : 99;
      const agora =
        d > r ? '' : d > r - 1 ? 'l-contorno' : d > r - 3 ? 'l-borda' : noNumero(x, y) ? 'l-numero' : y < r ? 'l-claro' : 'l-escuro';
      if (agora !== camada) {
        fecha(x);
        camada = agora;
        inicio = x;
      }
    }
  }
  return svg;
}

// Um cadeado em pixels (o nível ainda não liberado) e o visto (o já resgatado).
const CADEADO = ['..###..', '.#...#.', '.#...#.', '#######', '###.###', '###.###', '#######'];
const VISTO = ['......##', '.....##.', '#...##..', '##.##...', '.###....', '..#.....'];
function iconeMono(linhas: string[], classe: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${linhas[0].length} ${linhas.length}`);
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  linhas.forEach((linha, y) => {
    for (const trecho of linha.matchAll(/#+/g)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(trecho.index));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(trecho[0].length));
      r.setAttribute('height', '1');
      svg.append(r);
    }
  });
  return svg;
}

// As recompensas de um nível, para o cartão: o ícone e a quantidade de cada uma.
function itensDa(recompensa: RecompensaDoPasse): HTMLElement {
  const lista = elemento('ul', 'inicio-passe-itens');
  if (recompensa.azios) {
    const li = elemento('li', 'inicio-passe-item inicio-passe-item-azios');
    li.append(iconeAzio('inicio-passe-item-icone'), elemento('span', 'inicio-passe-item-qtd', numero(recompensa.azios)), elemento('span', 'inicio-passe-item-nome', 'azios'));
    lista.append(li);
  }
  if (recompensa.xp) {
    const li = elemento('li', 'inicio-passe-item inicio-passe-item-xp');
    li.append(iconeXp('inicio-passe-item-icone'), elemento('span', 'inicio-passe-item-qtd', numero(recompensa.xp)), elemento('span', 'inicio-passe-item-nome', 'XP'));
    lista.append(li);
  }
  return lista;
}

const textoDaRecompensa = (r: RecompensaDoPasse): string =>
  [r.azios ? `${numero(r.azios)} azios` : '', r.xp ? `${numero(r.xp)} XP` : ''].filter(Boolean).join(' e ');

// O que falta para o passe acabar, em palavras.
function prazoDoPasse(): string {
  if (!passeAberto()) return 'encerrado: ainda dá para resgatar o que você ganhou';
  const dias = diasParaOPasseAcabar();
  return dias <= 1 ? 'termina hoje' : `termina em ${dias} dias`;
}

// ---- O botão da tela inicial ----

// O botão do canto de cima à esquerda: o selo do passe, o nome, o nível alcançado com a barra do
// próximo e, havendo nível para resgatar, o aviso piscando com quantos.
export function botaoDoPasse(aoAbrir: () => void): { el: HTMLButtonElement; mostrar: () => void } {
  const b = elemento('button', 'inicio-passe-botao');
  b.type = 'button';
  const selo = elemento('span', 'inicio-passe-botao-selo');
  selo.append(iconeXp('inicio-passe-botao-estrela'));
  const texto = elemento('span', 'inicio-passe-botao-texto');
  const rotulo = elemento('span', 'inicio-passe-botao-rotulo', `Temporada ${TEMPORADA.numero}`);
  const nome = elemento('span', 'inicio-passe-botao-nome', 'Passe da Temporada');
  const linha = elemento('span', 'inicio-passe-botao-linha');
  const nivel = elemento('span', 'inicio-passe-botao-nivel');
  const trilho = elemento('span', 'inicio-passe-botao-trilho');
  const cheio = elemento('span', 'inicio-passe-botao-cheio');
  trilho.append(cheio);
  linha.append(nivel, trilho);
  texto.append(rotulo, nome, linha);
  const aviso = elemento('span', 'inicio-passe-botao-aviso');
  b.append(selo, texto, aviso);
  b.addEventListener('click', aoAbrir);
  const mostrar = (): void => {
    const j = contaAtual();
    if (!j) return;
    const p = progressoDoPasse(j);
    nivel.textContent = `Nível ${p.nivel}/${NIVEIS_DO_PASSE.length}`;
    cheio.style.width = `${((p.noNivel / PONTOS_POR_NIVEL_DO_PASSE) * 100).toFixed(1)}%`;
    const prontos = niveisParaResgatar(j);
    aviso.hidden = prontos === 0;
    aviso.textContent = String(prontos);
    b.classList.toggle('inicio-passe-botao-pronto', prontos > 0);
    b.setAttribute(
      'aria-label',
      `Passe da Temporada: nível ${p.nivel} de ${NIVEIS_DO_PASSE.length}` + (prontos ? `, ${prontos} ${prontos === 1 ? 'recompensa' : 'recompensas'} para resgatar` : ''),
    );
  };
  mostrar();
  return { el: b, mostrar };
}

// ---- A tela ----

export function telaPasse(): Promise<void> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-passe-tela');
    const caixa = elemento('div', 'inicio-passe');

    // O topo: o título e a temporada; ao lado, o nível do perfil e os azios.
    const cabeca = elemento('header', 'inicio-passe-cabeca');
    const titulos = elemento('div', 'inicio-passe-titulos');
    titulos.append(
      elemento('h1', 'inicio-titulo inicio-passe-titulo', 'Passe da Temporada'),
      elemento('p', 'inicio-passe-temporada', `Temporada ${TEMPORADA.numero} · ${TEMPORADA.nome} · ${prazoDoPasse()}`),
    );
    const perfil = barraDeNivel('inicio-passe-perfil', true);
    const azios = contadorDeAzios('inicio-passe-azios');
    const conta = elemento('div', 'inicio-passe-conta');
    conta.append(perfil.el, azios.el);
    cabeca.append(titulos, conta);

    // O progresso: o nível alcançado e a barra dos pontos do próximo.
    const progresso = elemento('div', 'inicio-passe-progresso');
    const nivelAlcancado = elemento('p', 'inicio-passe-alcancado');
    const barra = elemento('div', 'inicio-passe-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', String(PONTOS_POR_NIVEL_DO_PASSE));
    const barraCheia = elemento('div', 'inicio-passe-barra-cheia');
    barra.append(barraCheia);
    const faltam = elemento('p', 'inicio-passe-faltam');
    const g = GANHO_POR_PARTIDA;
    const comoGanhar = elemento(
      'p',
      'inicio-passe-como',
      `Cada partida dá pontos: vitória +${g.vitoria.pontos}, empate +${g.empate.pontos}, derrota +${g.derrota.pontos}. O passe dura ${DIAS_DO_PASSE} dias.`,
    );
    progresso.append(nivelAlcancado, barra, faltam);

    // A trilha, com as setas dos lados.
    const trilha = elemento('div', 'inicio-passe-trilha');
    trilha.setAttribute('role', 'list');
    trilha.setAttribute('aria-label', 'Níveis do passe');
    const degraus = NIVEIS_DO_PASSE.map((recompensa, i) => {
      const nivel = i + 1;
      const degrau = elemento('div', `inicio-passe-degrau${maior(nivel) ? ' inicio-passe-degrau-maior' : ''}`);
      degrau.setAttribute('role', 'listitem');
      degrau.style.setProperty('--ordem', String(i));
      // O nó é um losango em pixels com o número no meio (desenhado pixel a pixel: o quadrado
      // virado com CSS deixava as pontas furadas).
      const no = elemento('span', 'inicio-passe-no');
      no.append(losango(maior(nivel) ? 11 : 9, nivel));
      const cartao = elemento('div', 'inicio-passe-cartao');
      const topo = elemento('span', 'inicio-passe-cartao-nivel', `Nível ${nivel}`);
      const rodape = elemento('div', 'inicio-passe-cartao-rodape');
      cartao.append(topo, itensDa(recompensa), rodape);
      degrau.append(no, cartao);
      trilha.append(degrau);
      return { nivel, recompensa, degrau, rodape, estado: null as Estado | null };
    });
    const andar = (passo: number): void => {
      const largura = degraus[0].degrau.getBoundingClientRect().width || 160;
      trilha.scrollBy({ left: passo * largura * 3, behavior: 'smooth' });
    };
    const antes = botao('', 'inicio-passe-seta inicio-passe-seta-antes', () => andar(-1));
    antes.setAttribute('aria-label', 'Níveis anteriores');
    const depois = botao('', 'inicio-passe-seta inicio-passe-seta-depois', () => andar(1));
    depois.setAttribute('aria-label', 'Próximos níveis');
    const moldura = elemento('div', 'inicio-passe-moldura');
    moldura.append(antes, trilha, depois);
    // A roda do mouse anda pela trilha (de lado).
    trilha.addEventListener(
      'wheel',
      (evento) => {
        if (Math.abs(evento.deltaY) <= Math.abs(evento.deltaX)) return;
        evento.preventDefault();
        trilha.scrollBy({ left: evento.deltaY });
      },
      { passive: false },
    );
    const setas = (): void => {
      antes.disabled = trilha.scrollLeft <= 2;
      depois.disabled = trilha.scrollLeft + trilha.clientWidth >= trilha.scrollWidth - 2;
    };
    trilha.addEventListener('scroll', setas, { passive: true });

    // O aviso do que veio (some sozinho) e os erros.
    const aviso = elemento('p', 'inicio-passe-aviso');
    aviso.setAttribute('role', 'status');
    let apagarAviso = 0;
    const avisar = (texto: string, erro = false): void => {
      clearTimeout(apagarAviso);
      aviso.textContent = texto;
      aviso.classList.toggle('inicio-passe-aviso-erro', erro);
      aviso.classList.remove('inicio-passe-aviso-novo');
      void aviso.offsetWidth; // recomeça a animação
      aviso.classList.add('inicio-passe-aviso-novo');
      apagarAviso = window.setTimeout(() => (aviso.textContent = ''), 5000);
    };

    const todos = botao('Resgatar tudo', 'inicio-botao inicio-passe-todos', () => void resgatarTodos());
    const voltar = botao('Voltar', 'inicio-botao inicio-botao-claro', () => sair());
    const acoes = elemento('div', 'inicio-passe-acoes');
    acoes.append(todos, voltar);
    // O mestre: recomeçar o passe, para testar a trilha de novo.
    const recomecar = botao('Recomeçar o passe (mestre)', 'inicio-link inicio-passe-recomecar', () => {
      if (ocupado) return;
      ocupado = true;
      api
        .recomecarPasse()
        .then((j) => {
          atualizarConta(j);
          mostrar();
          avisar('O passe voltou ao começo.');
          trilha.scrollTo({ left: 0, behavior: 'smooth' });
        })
        .catch((erro: unknown) => avisar(mensagemDe(erro), true))
        .finally(() => (ocupado = false));
    });

    caixa.append(cabeca, progresso, moldura, comoGanhar, aviso, acoes, recomecar);
    tela.append(caixa);

    let ocupado = false;

    // Resgata um nível: a recompensa sobe do cartão, os números de cima mudam e, subindo de nível
    // do perfil, avisa.
    const resgatar = async (nivel: number, sozinho = true): Promise<boolean> => {
      if (ocupado && sozinho) return false;
      ocupado = true;
      try {
        const r = await api.resgatarNivelDoPasse(nivel);
        atualizarConta(r.jogador);
        const d = degraus[nivel - 1];
        const sobe = elemento('span', 'inicio-passe-sobe', `+${textoDaRecompensa(r.recompensa)}`);
        d.degrau.append(sobe);
        window.setTimeout(() => sobe.remove(), 1400);
        d.degrau.classList.remove('inicio-passe-resgatou');
        void d.degrau.offsetWidth;
        d.degrau.classList.add('inicio-passe-resgatou');
        mostrar();
        avisar(r.subiuPara ? `Nível ${nivel} resgatado! Você subiu para o nível ${r.subiuPara} do perfil!` : `Nível ${nivel} resgatado: ${textoDaRecompensa(r.recompensa)}.`);
        return true;
      } catch (erro) {
        avisar(mensagemDe(erro), true);
        return false;
      } finally {
        if (sozinho) ocupado = false;
      }
    };

    const resgatarTodos = async (): Promise<void> => {
      const j = contaAtual();
      if (!j || ocupado) return;
      ocupado = true;
      let soma = { xp: 0, azios: 0 };
      const nivelAntes = j.xp;
      try {
        for (const d of degraus) {
          const agora = contaAtual();
          if (!agora || estadoDo(d.nivel, agora) !== 'liberado') continue;
          if (!(await resgatar(d.nivel, false))) return;
          soma = { xp: soma.xp + d.recompensa.xp, azios: soma.azios + d.recompensa.azios };
        }
        if (soma.xp || soma.azios) {
          const depois = contaAtual();
          const subiu = depois ? subiuDeNivel(nivelAntes, depois.xp) : null;
          avisar(`Tudo resgatado: ${textoDaRecompensa(soma)}.` + (subiu ? ` Você subiu para o nível ${subiu} do perfil!` : ''));
        }
      } finally {
        ocupado = false;
      }
    };

    // Mostra a conta como está.
    function mostrar(): void {
      const j = contaAtual();
      if (!j) return;
      perfil.mostrar(j);
      azios.mostrar();
      const p = progressoDoPasse(j);
      nivelAlcancado.replaceChildren(
        elemento('span', 'inicio-passe-alcancado-rotulo', 'Nível do passe'),
        elemento('strong', 'inicio-passe-alcancado-valor', String(p.nivel)),
        elemento('span', 'inicio-passe-alcancado-de', `/ ${NIVEIS_DO_PASSE.length}`),
      );
      barraCheia.style.width = `${((p.noNivel / PONTOS_POR_NIVEL_DO_PASSE) * 100).toFixed(1)}%`;
      barra.setAttribute('aria-valuenow', String(p.noNivel));
      barra.setAttribute('aria-label', 'Pontos para o próximo nível do passe');
      faltam.textContent = p.completo
        ? 'Trilha completa!'
        : `${numero(p.noNivel)} / ${numero(PONTOS_POR_NIVEL_DO_PASSE)} pontos para o nível ${p.nivel + 1}`;
      // A linha da trilha acende até o nível alcançado; o do lado enche com os pontos.
      const alcancado = p.nivel;
      for (const d of degraus) {
        const estado = estadoDo(d.nivel, j);
        d.degrau.classList.toggle('inicio-passe-aceso', d.nivel <= alcancado);
        d.degrau.classList.toggle('inicio-passe-seguinte', d.nivel === alcancado + 1);
        d.degrau.style.setProperty('--parte', d.nivel === alcancado + 1 ? String(p.noNivel / PONTOS_POR_NIVEL_DO_PASSE) : d.nivel <= alcancado ? '1' : '0');
        if (estado === d.estado) continue;
        d.estado = estado;
        d.degrau.dataset.estado = estado;
        const recompensa = textoDaRecompensa(d.recompensa);
        if (estado === 'liberado') {
          const b = botao('Resgatar', 'inicio-botao inicio-passe-resgatar', () => void resgatar(d.nivel));
          b.setAttribute('aria-label', `Resgatar o nível ${d.nivel}: ${recompensa}`);
          d.rodape.replaceChildren(b);
        } else if (estado === 'resgatado') {
          const feito = elemento('span', 'inicio-passe-feito');
          feito.append(iconeMono(VISTO, 'inicio-passe-visto'), 'Resgatado');
          d.rodape.replaceChildren(feito);
        } else {
          const trancado = elemento('span', 'inicio-passe-trancado');
          trancado.append(iconeMono(CADEADO, 'inicio-passe-cadeado'), 'Bloqueado');
          d.rodape.replaceChildren(trancado);
        }
        d.degrau.setAttribute(
          'aria-label',
          `Nível ${d.nivel}: ${recompensa}, ${estado === 'resgatado' ? 'resgatado' : estado === 'liberado' ? 'liberado para resgatar' : 'bloqueado'}`,
        );
      }
      const prontos = niveisParaResgatar(j);
      todos.hidden = prontos < 2;
      todos.textContent = `Resgatar tudo (${prontos})`;
      recomecar.hidden = !souMestre();
    }

    const sair = (): void => {
      window.removeEventListener('keydown', aoTeclar);
      clearTimeout(apagarAviso);
      resolver();
    };
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Escape') {
        evento.preventDefault();
        sair();
      } else if (evento.code === 'ArrowRight' || evento.code === 'ArrowLeft') {
        if (evento.target instanceof HTMLInputElement) return;
        evento.preventDefault();
        andar(evento.code === 'ArrowRight' ? 1 : -1);
      }
    };
    window.addEventListener('keydown', aoTeclar);

    mostrar();
    anexarCena(tela);
    mostrarTela(tela);
    // Abre com o próximo nível (o primeiro por resgatar, ou o que está enchendo) no meio da trilha.
    requestAnimationFrame(() => {
      const j = contaAtual();
      const alvo = j ? degraus.find((d) => estadoDo(d.nivel, j) === 'liberado') ?? degraus[Math.min(degraus.length - 1, progressoDoPasse(j).nivel)] : degraus[0];
      trilha.scrollLeft = Math.max(0, alvo.degrau.offsetLeft - trilha.clientWidth / 2 + alvo.degrau.offsetWidth / 2);
      setas();
      voltar.focus({ preventScroll: true });
    });
  });
}

// O nível do perfil novo, se `xpDepois` passou de nível em relação a `xpAntes` (senão, null).
function subiuDeNivel(xpAntes: number, xpDepois: number): number | null {
  const antes = nivelDoPerfil(xpAntes).nivel;
  const depois = nivelDoPerfil(xpDepois).nivel;
  return depois > antes ? depois : null;
}
