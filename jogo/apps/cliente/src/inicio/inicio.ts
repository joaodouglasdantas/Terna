// Telas de antes do jogo: primeiro a de carregamento, uma barra de progresso que confere o
// servidor, o banco e a arte (e deixa o servidor grátis acordar); depois a inicial, com a logo,
// o nome e os modos de jogo. São páginas comuns por cima do canvas: a logo é uma imagem grande
// e o texto precisa ficar nítido, o que o canvas de 480×270 ampliado não daria.

import { Apelido, type Heroi, type Jogador } from '@terna/compartilhado';
import logoSimplesUrl from '../assets/logo-simples.webp';
import logoUrl from '../assets/logo.webp';
import { carregarDecodificada } from '../motor/imagens';
import { checarBanco, checarServidor } from '../rede/saude';
import { guardarNome, lerNome } from '../save/nome';
import { VERSAO } from '../versao';
import { anexarCena, carregarArteDaCena } from './cena';
import { botao, digitandoEm, elemento, mostrarTela, sairComEsmaecer } from './dom';
import { logoViva } from './logo-viva';
import { telaMapa } from './mapa';
import { botaoDaMusica } from './musica';
import { telaMultiplayer, type EscolhaOnline } from './multiplayer';
import { botaoDaOpiniao } from './opiniao';
import { telaPersonagens } from './personagens';
import { TEXTOS_DO_TREINO, telaSelecao } from './selecao';
import { carregarArteDaTemporada } from './temporada';
import { carregarRetratos } from './terras';

// Cada etapa da barra é uma checagem de verdade, com um nome do mundo do jogo no lugar do nome
// técnico. A barra anda por elas em ordem, mas as checagens correm todas ao mesmo tempo.
type Falha = 'arte' | 'rede';
type Resultado = { ok: true } | { ok: false; falha: Falha };

interface Etapa {
  frase: string;
  resultado: Promise<Resultado>;
}

const TEMPO_MINIMO_ETAPA = 700; // ms que cada frase fica na tela, mesmo que a checagem seja instantânea
const AVISO_DEMORA = 6000; // ms numa etapa até avisar que o mundo pode estar acordando
const PAUSA_PRONTO = 450; // ms com a barra cheia antes de abrir a tela inicial

interface Opcoes<C, H> {
  carregarCenario: () => Promise<C>;
  carregarHerois: () => Promise<H>;
}

// O que a pessoa escolheu na tela inicial (e na seleção de personagem). 'treino': a partida de
// treino com o tutorial (inicio/tutorial.ts), contra o boneco.
export type Escolha = { modo: 'solo'; nome: string; heroi: Heroi } | { modo: 'treino'; nome: string; heroi: Heroi } | EscolhaOnline;

// Saiu da conta na tela inicial: o jogo volta para a tela de entrar.
export const SAIU_DA_CONTA = 'saiu-da-conta';

// A logo simples (só as letras, em branco) do carregamento. A imagem tem margem vazia em volta
// das letras: a moldura tem a proporção só das letras e corta o resto (ver inicio.css).
export function logoSimples(): HTMLElement {
  const moldura = elemento('div', 'inicio-logo-simples');
  const img = elemento('img', '');
  img.src = logoSimplesUrl;
  img.alt = 'Terna';
  img.draggable = false;
  moldura.append(img);
  return moldura;
}

const esperar = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

// A logo grande e a letra da tela inicial, baixadas e já decodificadas antes de a tela abrir:
// sem isso ela aparecia com as árvores subindo e a logo chegava segundos depois. Junto, o que as
// telas seguintes mostram de cara: a floresta do fundo dos menus, os retratos dos cartões e a arte
// do carregamento antes de cada partida. A imagem da logo fica guardada aqui para o navegador não
// descartar a versão decodificada (as outras ficam guardadas por quem carrega).
let logoPronta: HTMLImageElement | undefined;
async function prepararTelaInicial(): Promise<void> {
  const [logo] = await Promise.all([
    carregarDecodificada(logoUrl),
    document.fonts.load('1rem "Tiny5"'),
    carregarArteDaCena(),
    carregarRetratos(),
    carregarArteDaTemporada(),
  ]);
  logoPronta = logo;
}

// Guarda o valor carregado e transforma o sucesso/erro em Resultado.
function carregarArte<T>(carregador: () => Promise<T>, guardar: (valor: T) => void): Promise<Resultado> {
  return carregador().then(
    (valor): Resultado => {
      guardar(valor);
      return { ok: true };
    },
    (erro: unknown): Resultado => {
      console.error(erro);
      return { ok: false, falha: 'arte' };
    },
  );
}

// A tela de carregamento. Devolve o que foi carregado e se dá para jogar online, quando a pessoa
// pode seguir (sozinha, se tudo deu certo; com um clique, se algo falhou).
export function carregar<C, H>(opcoes: Opcoes<C, H>): Promise<{ cenario: C; herois: H; online: boolean }> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-carregando');
    const barra = elemento('div', 'inicio-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-label', 'Carregando');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    const preenchido = elemento('div', 'inicio-barra-cheia');
    barra.append(preenchido);
    const frase = elemento('p', 'inicio-frase');
    frase.setAttribute('aria-live', 'polite');
    const aviso = elemento('p', 'inicio-aviso');
    const acoes = elemento('div', 'inicio-acoes');
    tela.append(logoSimples(), barra, frase, aviso, acoes);
    mostrarTela(tela);
    // Pronto: o carregamento esmaece até o escuro e a tela inicial aparece dele (cruzando as duas,
    // a logo pequena e a grande ficavam uma por cima da outra).
    const concluir = (fim: { cenario: C; herois: H; online: boolean }): void => void sairComEsmaecer(tela).then(() => resolver(fim));

    let cenario: C | undefined;
    let herois: H | undefined;
    // Cada rodada (a primeira e cada "Tentar de novo") anima a barra sozinha: a animação da rodada
    // que falhou para quando a nova começa (antes, as duas puxavam a largura ao mesmo tempo). A
    // largura mostrada passa de uma para a outra, e a barra volta deslizando.
    let rodada = 0;
    let mostrado = 0;

    const rodar = async (): Promise<void> => {
      const esta = ++rodada;
      acoes.replaceChildren();
      aviso.textContent = '';
      delete tela.dataset.estado;

      const servidor = checarServidor();
      const etapas: Etapa[] = [
        { frase: 'Colocando grama no chão', resultado: carregarArte(opcoes.carregarCenario, (v) => (cenario = v)) },
        { frase: 'Chamando os heróis', resultado: carregarArte(opcoes.carregarHerois, (v) => (herois = v)) },
        { frase: 'Acendendo o cristal do verão', resultado: carregarArte(prepararTelaInicial, () => undefined) },
        { frase: 'Afiando as armas', resultado: servidor.then((r) => (r.ok ? r : { ok: false, falha: 'rede' })) },
        {
          frase: 'Abrindo o baú de memórias',
          // O banco só se confere com o servidor de pé.
          resultado: servidor
            .then((r) => (r.ok ? checarBanco() : r))
            .then((r) => (r.ok ? r : { ok: false, falha: 'rede' })),
        },
      ];

      // A barra: `feitas` etapas cheias e a atual enchendo devagar enquanto a checagem não volta
      // (sem nunca completar a etapa por conta própria). A largura persegue esse alvo.
      let feitas = 0;
      let inicioEtapa = performance.now();
      let parada = false;
      const animar = (agora: number): void => {
        if (esta !== rodada) return;
        const correndo = parada ? 0 : 0.85 * (1 - Math.exp(-(agora - inicioEtapa) / 1500));
        const alvo = Math.min(1, (feitas + correndo) / etapas.length);
        mostrado += (alvo - mostrado) * 0.15;
        preenchido.style.width = `${(mostrado * 100).toFixed(2)}%`;
        barra.setAttribute('aria-valuenow', String(Math.round(mostrado * 100)));
        if (!parada && agora - inicioEtapa > AVISO_DEMORA) {
          aviso.textContent = 'O mundo está acordando… isso pode levar até um minuto.';
        }
        if (!parada || Math.abs(alvo - mostrado) > 0.001) requestAnimationFrame(animar);
      };
      requestAnimationFrame(animar);

      for (const etapa of etapas) {
        frase.textContent = `${etapa.frase}…`;
        barra.setAttribute('aria-valuetext', etapa.frase);
        inicioEtapa = performance.now();
        const [resultado] = await Promise.all([etapa.resultado, esperar(TEMPO_MINIMO_ETAPA)]);
        aviso.textContent = '';
        if (!resultado.ok) {
          parada = true;
          falhou(resultado.falha);
          return;
        }
        feitas++;
      }
      parada = true;
      frase.textContent = 'Tudo pronto!';
      barra.setAttribute('aria-valuetext', 'Tudo pronto');
      await esperar(PAUSA_PRONTO);
      // As três primeiras etapas são a arte: chegando aqui, todas carregaram.
      concluir({ cenario: cenario as C, herois: herois as H, online: true });
    };

    const falhou = (falha: Falha): void => {
      tela.dataset.estado = 'falhou';
      const tentarDeNovo = botao('Tentar de novo', 'inicio-botao inicio-botao-claro', () => void rodar());
      if (falha === 'rede' && cenario !== undefined && herois !== undefined && logoPronta) {
        // Só o online falhou: o jogo roda sozinho, então dá para seguir sem ele.
        const [c, h] = [cenario, herois];
        frase.textContent = 'O mundo online não respondeu';
        aviso.textContent = 'Dá para jogar mesmo assim, mas sem salvar na conta nem jogar com outras pessoas.';
        acoes.append(
          botao('Jogar offline', 'inicio-botao', () => concluir({ cenario: c, herois: h, online: false })),
          tentarDeNovo,
        );
      } else {
        frase.textContent = 'As imagens do jogo não carregaram';
        aviso.textContent = 'Sem elas não dá para abrir o jogo. Confira a conexão e tente de novo.';
        acoes.append(tentarDeNovo);
      }
      tentarDeNovo.focus({ preventScroll: true });
    };

    void rodar();
  });
}

// O aviso de sala que caiu: quanto fica na tela e quanto leva esmaecendo (o CSS usa o mesmo).
const AVISO_MS = 7000;
const AVISO_ESMAECE_MS = 1200;

// Os ícones dos atalhos, em pixels ('#' aceso): um busto e um marcador de mapa.
const ICONE_PERSONAGENS = ['...###...', '..#####..', '..#####..', '...###...', '....#....', '.#######.', '#########', '#########'];
const ICONE_MAPA = ['..####..', '.######.', '###..###', '###..###', '.######.', '..####..', '...##...', '...##...'];
// O alvo do treino: os anéis de um alvo de arco e flecha.
const ICONE_TREINO = ['..####..', '.#....#.', '#..##..#', '#.#..#.#', '#.#..#.#', '#..##..#', '.#....#.', '..####..'];

function iconeDePixels(linhas: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${linhas[0].length} ${linhas.length}`);
  svg.setAttribute('class', 'inicio-atalho-icone');
  svg.setAttribute('aria-hidden', 'true');
  linhas.forEach((linha, y) => {
    // Um retângulo por trecho aceso da linha.
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

function atalho(texto: string, icone: string[]): HTMLButtonElement {
  const b = elemento('button', 'inicio-botao inicio-botao-claro inicio-atalho');
  b.type = 'button';
  b.append(iconeDePixels(icone), elemento('span', '', texto));
  return b;
}

// A tela inicial: a logo (viva, com partículas), o nome e os modos de jogo, com as árvores da
// frente subindo nas beiradas. Termina quando a pessoa escolhe um modo e o personagem —
// Singleplayer, depois da seleção de personagem; Multiplayer, depois de criar ou entrar numa sala
// e dos dois escolherem (as telas deles voltam para cá se ela desistir). Sem conexão com o
// servidor, o Multiplayer fica apagado.
// `aviso`: a sala da partida online caiu (o outro saiu, o tempo de escolher acabou, a rede caiu):
// aparece em cima do nome e some sozinho, esmaecendo (antes, se a pessoa abrir outra tela).
// `conta`: dentro da conta, o nome é o dela (no lugar do campo, com o botão de sair da conta, que
// termina a tela com SAIU_DA_CONTA). Sem conta (offline), o campo do apelido, como antes.
export function escolherModo(online: boolean, aviso = '', conta: Jogador | null = null): Promise<Escolha | typeof SAIU_DA_CONTA> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-titulo-tela');
    const avisoDaSala = elemento('p', 'inicio-sala-caiu');
    avisoDaSala.setAttribute('role', 'status');
    let esmaecer = 0;
    let apagar = 0;
    const mostrarAviso = (texto: string): void => {
      clearTimeout(esmaecer);
      clearTimeout(apagar);
      avisoDaSala.classList.remove('inicio-sala-caiu-saindo');
      avisoDaSala.textContent = texto;
      if (!texto) return;
      esmaecer = window.setTimeout(() => {
        avisoDaSala.classList.add('inicio-sala-caiu-saindo');
        apagar = window.setTimeout(() => mostrarAviso(''), AVISO_ESMAECE_MS);
      }, AVISO_MS);
    };
    mostrarAviso(aviso);

    const campo = elemento('label', 'inicio-campo');
    const rotulo = elemento('span', 'inicio-rotulo', 'Seu nome');
    const entrada = elemento('input', 'inicio-entrada');
    entrada.type = 'text';
    entrada.maxLength = 12;
    entrada.setAttribute('autocomplete', 'nickname');
    entrada.spellcheck = false;
    entrada.placeholder = 'Como te chamam?';
    entrada.value = lerNome();
    const erroNome = elemento('p', 'inicio-erro');
    erroNome.id = 'inicio-erro-nome';
    erroNome.setAttribute('aria-live', 'polite');
    campo.append(rotulo, entrada);
    entrada.addEventListener('input', () => {
      erroNome.textContent = '';
      entrada.removeAttribute('aria-invalid');
    });

    // Com conta: o nome dela no lugar do campo, e o botão de sair da conta.
    const faixaDaConta = elemento('div', 'inicio-conta-faixa');
    if (conta) {
      const quem = elemento('p', 'inicio-conta-quem');
      quem.append('Jogando como ', elemento('strong', '', conta.nome));
      const sair = botao('Sair da conta', 'inicio-link', () => {
        window.removeEventListener('keydown', aoTeclar);
        mostrarAviso('');
        void sairComEsmaecer(tela).then(() => resolver(SAIU_DA_CONTA));
      });
      faixaDaConta.append(quem, sair);
    }

    // O nome vale para os dois modos: sem nome válido, avisa e volta para o campo. Com conta, é o
    // nome dela (que já segue as regras do apelido).
    const nomeValido = (): string | null => {
      if (conta) return conta.nome.slice(0, 12);
      const nome = Apelido.safeParse(entrada.value);
      if (nome.success) {
        guardarNome(nome.data);
        return nome.data;
      }
      const motivo = nome.error.issues[0]?.message ?? 'nome inválido';
      erroNome.textContent = entrada.value.trim()
        ? motivo.charAt(0).toUpperCase() + motivo.slice(1)
        : 'Escreva seu nome para jogar';
      entrada.setAttribute('aria-invalid', 'true');
      entrada.setAttribute('aria-describedby', erroNome.id);
      entrada.focus();
      return null;
    };

    // Desistiu numa das telas seguintes (ou a sala caiu: `aviso`): a tela inicial volta como estava.
    const voltarParaCa = (foco: HTMLElement, aviso = ''): void => {
      mostrarAviso(aviso);
      anexarCena(tela);
      mostrarTela(tela);
      logo.ligar();
      window.addEventListener('keydown', aoTeclar);
      foco.focus();
    };

    const solo = botao('Singleplayer', 'inicio-botao inicio-jogar', () => {
      const nome = nomeValido();
      if (!nome) return;
      mostrarAviso('');
      window.removeEventListener('keydown', aoTeclar);
      void telaSelecao().then((r) => {
        if (r.tipo === 'escolheu') resolver({ modo: 'solo', nome, heroi: r.heroi });
        else voltarParaCa(solo);
      });
    });

    const multiplayer = botao('Multiplayer', 'inicio-botao inicio-multiplayer', () => {
      const nome = nomeValido();
      if (!nome) return;
      window.removeEventListener('keydown', aoTeclar);
      mostrarAviso('');
      void telaMultiplayer(nome).then((fim) => {
        if (fim.tipo === 'jogar') return resolver(fim.escolha);
        voltarParaCa(multiplayer, fim.aviso);
      });
    });
    if (!online) {
      multiplayer.disabled = true;
      multiplayer.setAttribute('aria-label', 'Multiplayer, sem conexão com o servidor');
      multiplayer.append(elemento('span', 'inicio-etiqueta', 'Offline'));
    }

    // Os atalhos do canto de baixo: os personagens, o mapa e a música.
    const abrirAoClicar = (b: HTMLButtonElement, abrirTela: () => Promise<void>): HTMLButtonElement => {
      b.addEventListener('click', () => {
        window.removeEventListener('keydown', aoTeclar);
        mostrarAviso('');
        void abrirTela().then(() => voltarParaCa(b));
      });
      return b;
    };
    // O treino: escolhe a Leslie ou o Grow e cai na partida de treino, com o tutorial.
    const treino = atalho('Treinamento', ICONE_TREINO);
    treino.addEventListener('click', () => {
      const nome = nomeValido();
      if (!nome) return;
      window.removeEventListener('keydown', aoTeclar);
      mostrarAviso('');
      void telaSelecao(undefined, TEXTOS_DO_TREINO).then((r) => {
        if (r.tipo === 'escolheu') resolver({ modo: 'treino', nome, heroi: r.heroi });
        else voltarParaCa(treino);
      });
    });
    const personagens = abrirAoClicar(atalho('Personagens', ICONE_PERSONAGENS), telaPersonagens);
    const mapa = abrirAoClicar(atalho('Mapa', ICONE_MAPA), telaMapa);
    const atalhos = elemento('div', 'inicio-atalhos');
    atalhos.append(treino, personagens, mapa, botaoDaMusica('inicio-botao inicio-botao-claro inicio-atalho'));

    // Enter joga sozinho (também de dentro do campo de nome); Espaço só fora do campo.
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Enter' || (evento.code === 'Space' && !digitandoEm(evento))) {
        // O próprio botão (ou o link da opinião) já responde.
        if (evento.target instanceof HTMLButtonElement || evento.target instanceof HTMLAnchorElement) return;
        evento.preventDefault();
        solo.click();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    const modos = elemento('div', 'inicio-modos');
    if (conta) modos.append(avisoDaSala, faixaDaConta, solo, multiplayer);
    else modos.append(avisoDaSala, campo, erroNome, solo, multiplayer);
    const logo = logoViva();
    // O formulário de opinião, no canto de baixo à direita, em cima da versão.
    const opiniao = botaoDaOpiniao('inicio-botao inicio-atalho inicio-opiniao-canto');
    tela.append(logo.palco, modos, elemento('p', 'inicio-versao', VERSAO), atalhos, opiniao);
    anexarCena(tela, true);
    mostrarTela(tela);
    logo.ligar();
    // Quem não tem nome começa no campo. Quem já tem não começa com foco em nada: o contorno
    // do foco no Singleplayer parecia um botão já escolhido. O Enter joga do mesmo jeito.
    if (!conta && !entrada.value) entrada.focus();
  });
}
